import { randomUUID } from 'node:crypto';

import { createPromptManagerDomain, type PromptData, type PromptSettings } from '../app/lib/prompt-manager.ts';
import { createChatMemoryCore } from '../public/scripts/chat-memory-shared.js';
import { PIPELINE_FALLBACK_PROMPT, buildStepPrompt, pipelineModelRemovesTools, pipelineStepTool, pipelineTriggerTag, stripPipelineMarkup } from '../public/scripts/reply-pipeline-core.js';
import { escapeRegex } from '../public/scripts/util/primitives.js';
import { countWebTokenizerTokens, getSentencepiceTokenizer, getTiktokenTokenizer, getTokenizerModel, getWebTokenizer } from './endpoints/tokenizers.js';
import { getRegenerateChatPrefix } from './server-generation-service.ts';
import { createStoryProjection, projectHistory, type MediaResolver, type ServerPromptMessage } from './server-prompt/history.ts';
import { array, record, ServerPromptError, string, type RecordView, type ServerPromptSnapshot } from './server-prompt/snapshot.ts';
import { roleAt, scanWorldInfo, type Injection, type Role, type WorldInfoActivation } from './server-prompt/world-info.ts';

export { readServerPromptSnapshot, ServerPromptError, type ServerPromptSnapshot } from './server-prompt/snapshot.ts';

export type ServerPromptCommand = { action: 'send' | 'regenerate' | 'continue'; temporary?: boolean; pendingUserText?: string; pendingUserExtra?: RecordView };
const generationTrigger = (command?: ServerPromptCommand) => !command || command.action === 'send' ? 'normal' : command.action;
const continuationInstruction = '[Continue your last message without repeating its original content.]';
export type { ServerPromptMessage } from './server-prompt/history.ts';
type TextMessage = { role: Role; content: string; name?: string };
type PipelineStep = { tool: string; prompt?: string; model?: string; maxTokens?: number | null };
export type ServerPromptRuntime = {
    scanPrompts?: readonly string[];
    forceWorldInfo?: readonly WorldInfoActivation[];
    injections?: readonly Injection[];
    projectMemory?: (rows: readonly RecordView[], snapshot: ServerPromptSnapshot) => readonly RecordView[];
    translateMemory?: (text: string) => string;
    resolveMedia?: MediaResolver;
    resolveFile?: (url: string) => string;

    pipeline?: { activeRunId?: string; step: PipelineStep; steps?: readonly PipelineStep[]; index: number; total: number; currentInput?: string | null }
        | { activeRunId?: string; fallback: true; steps?: Array<{ tool: string }> };
};

function invalid(message: string): never {
    throw new ServerPromptError('invalid_config', message);
}

export function resolveGenerationModelBaseUrl(url: unknown) {
    if (typeof url !== 'string') return null;
    const baseUrl = url.trim().replace(/\/+$/, '') || 'https://api.openai.com/v1';
    const parsed = URL.parse(baseUrl);
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || /[?#]/.test(baseUrl)) return null;
    return baseUrl;
}

function resolveConnection(preset: RecordView, settings: RecordView) {
    // Connection fields are independently saved by Settings. Never use a URL
    // embedded in an imported preset as authority for the model target.
    if ((settings.chat_completion_source ?? 'openai') !== 'openai') invalid('Invalid chat completion source');
    const modelValue = settings.openai_model ?? 'gpt-4-turbo';
    if (typeof modelValue !== 'string' || !modelValue.trim()) invalid('Invalid model name');
    const model = modelValue.trim();
    const baseUrl = resolveGenerationModelBaseUrl(settings.custom_url ?? settings.reverse_proxy ?? '');
    if (!baseUrl) invalid('Invalid model base URL');

    const getNumber = (value: unknown, fallback: number, field: string, min: number, max: number) => {
        const result = value ?? fallback;
        if (typeof result !== 'number' || !Number.isFinite(result) || result < min || result > max) invalid(`Invalid ${field}`);
        return result;
    };
    const contextTokens = getNumber(settings.openai_max_context ?? preset.openai_max_context, 65535, 'context token limit', 1, Number.MAX_SAFE_INTEGER);
    const responseTokens = getNumber(settings.openai_max_tokens ?? preset.openai_max_tokens, 8000, 'response token limit', 1, Number.MAX_SAFE_INTEGER);
    if (!Number.isInteger(contextTokens) || !Number.isInteger(responseTokens) || responseTokens >= contextTokens) invalid('Invalid context or response token limit');
    return {
        baseUrl, model, contextTokens, responseTokens,
        temperature: getNumber(settings.temp_openai ?? preset.temperature, 1, 'temperature', 0, 2),
        frequencyPenalty: getNumber(settings.freq_pen_openai ?? preset.frequency_penalty, 0, 'frequency penalty', -2, 2),
        presencePenalty: getNumber(settings.pres_pen_openai ?? preset.presence_penalty, 0, 'presence penalty', -2, 2),
        topP: getNumber(settings.top_p_openai ?? preset.top_p, 1, 'top P', 0, 1),
    };
}

export const DEFAULT_GENERATION_USER_NAME = 'User';

export function getGenerationUserName(header: object) {
    const name = string(record(header).user_name);
    return name && name !== 'unused' ? name : DEFAULT_GENERATION_USER_NAME;
}

const regexPlacement = { userInput: 1, aiOutput: 2 } as const;

function createSubstitute(snapshot: ServerPromptSnapshot, input: RecordView[], model: string, pendingUserText?: string) {
    const card = record(snapshot.character.data);
    const header = record(snapshot.chat[0]);
    const metadata = record(header.chat_metadata);
    const recent = input.slice().reverse();
    const lastUser = string(recent.find(row => row.is_user)?.mes);
    const values: Record<string, string> = {
        user: getGenerationUserName(header), char: string(snapshot.character.name ?? card.name), model,
        description: string(snapshot.character.description ?? card.description),
        scenario: string(metadata.scenario || snapshot.character.scenario || card.scenario),
        personality: string(snapshot.character.personality ?? card.personality),
        input: pendingUserText ?? lastUser,
        lastmessage: string(input.at(-1)?.mes),
        lastusermessage: lastUser,
        lastcharmessage: string(recent.find(row => !row.is_user && !row.is_system)?.mes),
        newline: '\n', noop: '',
    };
    return (text: string) => text.replace(/{{\s*([\w]+)\s*}}|<(USER|BOT)>/gi, (whole, macro: string | undefined, legacy: string | undefined) => {
        const key = macro?.toLowerCase() ?? (legacy?.toLowerCase() === 'user' ? 'user' : 'char');
        return Object.hasOwn(values, key) ? values[key] : whole;
    });
}

function makeRegex(snapshot: ServerPromptSnapshot, substitute: (value: string) => string, phase: 'prompt' | 'write') {
    const feature = record(snapshot.settings.feature_settings ?? snapshot.settings.extension_settings);
    const presetName = string(record(snapshot.settings.oai_settings).preset_settings_openai) || 'Default';
    const scripts = [
        ...array(feature.regex),
        ...array(array(feature.character_allowed_regex).includes(snapshot.character.avatar) ? record(record(snapshot.character.data).extensions).regex_scripts : null),
        ...array(array(record(feature.preset_allowed_regex).openai).includes(presetName) ? record(snapshot.preset.extensions).regex_scripts : null),
    ].map(record);
    return (value: string, placement: number, depth?: number) => {
        for (const script of scripts) {
            const applies = phase === 'prompt' ? script.promptOnly : !script.promptOnly && !script.markdownOnly;
            if (!value || script.disabled || !applies || !array(script.placement).includes(placement) || !script.findRegex) continue;
            if (depth !== undefined && ((script.minDepth != null && Number(script.minDepth) >= -1 && depth < Number(script.minDepth))
                || (script.maxDepth != null && Number(script.maxDepth) >= 0 && depth > Number(script.maxDepth)))) continue;
            const source = string(script.findRegex);
            const mode = Number(script.substituteRegex);
            const expanded = mode === 1 ? substitute(source) : mode === 2 ? source.replace(/{{[^{}]+}}/g, macro => escapeRegex(substitute(macro))) : source;
            const delimited = expanded.match(/^\/(.*)\/([dgimsuvy]*)$/s);
            let pattern: RegExp;
            try { pattern = delimited ? new RegExp(delimited[1], delimited[2]) : new RegExp(expanded); } catch { continue; }
            value = value.replace(pattern, (...args: unknown[]) => {
                const replacement = string(script.replaceString).replace(/{{match}}/gi, '$0').replace(/\$(\d+)|\$<([^>]+)>/g, (_token, num, groupName) => {
                    let match = string(num ? args[Number(num)] : record(args.at(-1))[groupName]);
                    for (const trim of array(script.trimStrings)) match = match.replaceAll(substitute(string(trim)), '');
                    return match;
                });
                return substitute(replacement);
            });
        }
        return value;
    };
}

export function prepareGenerationUserMessage(snapshot: ServerPromptSnapshot, text: string) {
    const model = string(record(snapshot.settings.oai_settings).openai_model ?? 'gpt-4-turbo').trim();
    const substitute = createSubstitute(snapshot, snapshot.chat.slice(1).map(record), model, text);
    const regex = makeRegex(snapshot, substitute, 'write');
    return { name: getGenerationUserName(record(snapshot.chat[0])), mes: substitute(regex(text, regexPlacement.userInput)), is_user: true };
}

export function applyGenerationOutputRegex(snapshot: ServerPromptSnapshot, text: string, model: string) {
    const substitute = createSubstitute(snapshot, snapshot.chat.slice(1).map(record), model);
    return makeRegex(snapshot, substitute, 'write')(text, regexPlacement.aiOutput);
}

const markers = ['worldInfo', 'charDescription', 'chatHistory'];
const roleOrder: Role[] = ['system', 'user', 'assistant'];

function makePromptManager(settings: RecordView, substitute: (value: string) => string) {
    const orders = structuredClone(array(settings.prompt_order)).map(record).map(bucket => ({
        character_id: string(bucket.character_id) || Number(bucket.character_id),
        order: array(bucket.order).map(record).filter(entry => entry.identifier !== 'dialogueExamples')
            .map(entry => ({ identifier: string(entry.identifier), enabled: Boolean(entry.enabled) })),
    }));
    const config: PromptSettings = {
        prompts: (structuredClone(array(settings.prompts)).map(record) as PromptData[]).filter(prompt => prompt.identifier !== 'dialogueExamples'),
        prompt_order: orders,
    };
    const { PromptManager } = createPromptManagerDomain({
        defaults: { prompts: markers.map(identifier => ({ identifier, marker: true, system_prompt: true })) },
        defaultOrder: markers.map(identifier => ({ identifier, enabled: true })),
        removeRetiredExamples: () => {}, subscribe: () => {},
        eventTypes: { CHAT_LOADED: '', CHARACTER_EDITED: '', CHARACTER_DELETED: '', OAI_PRESET_CHANGED_AFTER: '' },
        substitute, uuid: randomUUID,
        createTokenHandler: () => ({ resetCounts: () => {}, getCounts: () => ({}), getTotal: () => 0 }),
    });
    const manager = new PromptManager();
    manager.init({ promptOrder: { strategy: 'global', dummyId: 100001 } }, config);
    return manager;
}

async function makeCounter(requestModel: string) {
    const model = getTokenizerModel(requestModel);
    const web = getWebTokenizer(model);
    const webTokenizer = await web?.get();
    if (webTokenizer) return (message: Record<string, string>) => countWebTokenizerTokens(webTokenizer, [message]);
    const sentencepiece = await getSentencepiceTokenizer(model)?.get();
    if (sentencepiece) return (message: Record<string, string>) => sentencepiece.encodeIds(Object.values(message).join('\n\n')).length;
    const fallback = model !== 'o1' && !model.startsWith('gpt-');
    const tokenizer = getTiktokenTokenizer(fallback ? 'gpt-3.5-turbo' : model);
    const legacy = model === 'gpt-3.5-turbo-0301';
    return (message: Record<string, string>) => (legacy ? 4 : 3) + Object.values(message).reduce((total, value) => total + tokenizer.encode(value).length, 0)
        + (message.name === undefined ? 0 : legacy ? -1 : 1);
}

function pipelineTools(pipeline: ServerPromptRuntime['pipeline']) {
    const steps = pipeline?.steps ?? (pipeline && 'step' in pipeline ? [pipeline.step] : []);
    return [...new Map(steps.map(item => [item.tool, pipelineStepTool(item)])).values()];
}

function buildPipelineTail(runtime: ServerPromptRuntime, manager: ReturnType<typeof makePromptManager>, generation: string,
    pipelineHistory: boolean, currentInput: string | null | undefined, project: ReturnType<typeof createStoryProjection>) {
    const pipeline = runtime.pipeline;
    if (!pipeline) return [];
    const suffix = generation === 'continue' ? ` ${continuationInstruction} Return only the new suffix as the final reply.` : '';
    if (!('step' in pipeline)) return [{ role: 'system', content: PIPELINE_FALLBACK_PROMPT + suffix }] satisfies ServerPromptMessage[];
    const tail: ServerPromptMessage[] = [];
    const tag = pipelineTriggerTag(pipeline.step.tool);
    for (const entry of manager.getPromptOrderForCharacter(manager.activeCharacter)) {
        const prompt = manager.getPromptById(entry.identifier);
        const triggers = prompt?.injection_trigger ?? [];
        if (!entry.enabled || !prompt || !triggers.includes(tag) || triggers.includes(generation) || triggers.includes('all')) continue;
        const { role, content } = manager.preparePrompt(prompt);
        if (content) tail.push(...(pipelineHistory
            ? project(`step:${pipeline.index}:${entry.identifier}`, 'story_preset', content, roleAt(role)).messages
            : [{ role: roleAt(role), content }]));
    }
    const input = pipeline.currentInput === undefined ? currentInput : pipeline.currentInput;
    const transcriptGuide = pipelineHistory ? ' Synthetic calls and their receipts provide context; do not repeat those calls.' : '';
    const historyGuide = pipelineHistory ? ' The story_history call, when present, contains saved memory summaries in chronological order without speaker labels. Earlier unsummarized messages appear as individual submit_story calls.' : undefined;
    const inputGuide = !pipelineHistory ? '' : input
        ? ` The current user input is the story_continuation_input call with ID ${input}.`
        : input === null ? ' The latest native user message is the current input.' : '';
    tail.push({ role: 'system', content: buildStepPrompt(pipeline.step, pipeline.index, pipeline.total, historyGuide) + transcriptGuide + inputGuide + suffix });
    return tail;
}

async function promptBudget(connection: ReturnType<typeof resolveConnection>, tools: ReturnType<typeof pipelineTools>) {
    const count = await makeCounter(connection.model);
    const padding = connection.model.includes('gpt-3.5-turbo-0301') ? 12 : 3;
    const toolTokens = tools.length ? count({ role: 'system', content: JSON.stringify(tools) }) : 0;
    const counts = new Map<object, number>();
    const measure = (messages: readonly object[], costs: ReadonlyMap<object, number>) => messages.reduce((sum, message) => {
        let tokens = counts.get(message);
        if (tokens === undefined) {
            const countable = Object.fromEntries(Object.entries(message).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
            if ('content' in message && Array.isArray(message.content)) countable.content = message.content.map(part => part.type === 'text' ? part.text : '').join('');
            const counted: number = count(countable);
            counts.set(message, counted);
            tokens = counted;
        }
        return sum + tokens + (costs.get(message) ?? 0);
    }, 0);
    return { fixed: padding + toolTokens, measure };
}

/** Follow-up rounds budget the captured transcript, without rebuilding media, lore or history. */
export async function assembleServerPipelineTail(snapshot: ServerPromptSnapshot, runtime: ServerPromptRuntime,
    transcript: readonly object[], mediaCosts: ReadonlyMap<object, number>, callIds: ReadonlySet<string>, command?: ServerPromptCommand) {
    const local = record(snapshot.settings.oai_settings);
    const step = runtime.pipeline && 'step' in runtime.pipeline ? runtime.pipeline.step : undefined;
    const connection = resolveConnection(snapshot.preset, step?.model ? { ...local, openai_model: step.model } : local);
    if (step && pipelineModelRemovesTools({ chat_completion_source: 'openai', model: connection.model })) invalid('Reply pipeline model does not support tools');
    const regenerate = command?.action === 'regenerate';
    const rows = (regenerate ? getRegenerateChatPrefix(snapshot.chat) : snapshot.chat).slice(1).map(record);
    const pendingUserText = command?.pendingUserText;
    if (pendingUserText !== undefined) rows.push(prepareGenerationUserMessage(snapshot, pendingUserText));
    const manager = makePromptManager({ ...snapshot.preset, ...local }, createSubstitute(snapshot, rows, connection.model));
    const tools = pipelineTools(runtime.pipeline);
    const tail = buildPipelineTail(runtime, manager, generationTrigger(command), true, undefined, createStoryProjection(new Set(callIds)));
    const messages = [...transcript, ...tail];
    const { fixed, measure } = await promptBudget(connection, tools);
    const promptTokens = fixed + measure(messages, mediaCosts);
    if (promptTokens > connection.contextTokens - (step?.maxTokens ?? connection.responseTokens)) {
        throw new ServerPromptError('budget_exceeded', 'Reply pipeline transcript exceeds the context size');
    }
    return { connection, messages, tail, tools, promptTokens };
}

/** Shared server-only entry point. Runtime inputs are supplied by the server caller, not the HTTP request. */
export async function assembleServerPrompt(snapshot: ServerPromptSnapshot, command: ServerPromptCommand, runtime: ServerPromptRuntime = {}) {
    const local = record(snapshot.settings.oai_settings);
    const step = runtime.pipeline && 'step' in runtime.pipeline ? runtime.pipeline : undefined;
    const connection = resolveConnection(snapshot.preset, step?.step.model ? { ...local, openai_model: step.step.model } : local);
    const removesTools = pipelineModelRemovesTools({ chat_completion_source: 'openai', model: connection.model });
    if (step && removesTools) invalid('Reply pipeline model does not support tools');
    const pipelineHistory = Boolean(runtime.pipeline) && !removesTools;
    const settings = { ...snapshot.preset, ...local };
    const historyPayload = command.action === 'regenerate' ? getRegenerateChatPrefix(snapshot.chat) : snapshot.chat;
    const rows = structuredClone(historyPayload.slice(1).map(record));
    if (command.pendingUserText !== undefined) {
        if (command.action !== 'send') invalid('Only send preview accepts pending user text');
        rows.push({ ...prepareGenerationUserMessage(snapshot, command.pendingUserText), extra: command.pendingUserExtra });
    }
    // Memory can add IDs after a send; use the position in the original chat,
    // before memory replaces or groups any rows, for append-only stability.
    const sourceKeys = new Map(rows.map((row, index) => [row, `row:${index}`]));
    const name1 = getGenerationUserName(record(snapshot.chat[0]));
    const substitute = createSubstitute(snapshot, rows, connection.model);
    const regex = makeRegex(snapshot, substitute, 'prompt');
    const history = rows.filter(row => !row.is_system || record(row.extra).type === 'narrator' || array(record(row.extra).tool_invocations).length);
    const metadata = record(record(snapshot.chat[0]).chat_metadata);
    const memory = record(metadata.chat_memory);
    const memoryEnabled = typeof memory.disabled === 'boolean' ? !memory.disabled : Boolean(local.chat_memory_enabled ?? true);
    const hasSummaries = array(memory.summaries).some(item => string(record(item).text).trim());
    let core: readonly RecordView[] = history;
    if (memoryEnabled && hasSummaries) {
        if (runtime.projectMemory) {
            core = runtime.projectMemory(history, snapshot);
        } else {
            if (!runtime.translateMemory) invalid('Chat memory projection requires a server memory translator');
            const memoryCore = createChatMemoryCore(runtime.translateMemory, Symbol.for('ignore'));
            const memorySettings = memoryCore.resolveChatMemorySettings(local, metadata);
            memoryCore.ensureChatMessageIds(rows, randomUUID);
            const normalized = memoryCore.getChatMemoryMetadata(metadata);
            const reconciliation = memoryCore.reconcileChatMemory(rows, normalized, memorySettings.keepTurns);
            core = memoryCore.applySummariesToCoreChat(history, reconciliation.activeSummaries, {
                role: memorySettings.role,
                wrap: memorySettings.wrap,
                name1,
                name2: string(snapshot.character.name ?? record(snapshot.character.data).name),
                includeTurns: pipelineHistory,
            }).items.map(record);
        }
    }
    const prepared = core.map((row, index) => {
        const extra = record(row.extra);
        const role: Role = extra.type === 'narrator' ? 'system' : row.is_user ? 'user' : 'assistant';
        const files = array(extra.files).map(record).map(file => string(file.text) || runtime.resolveFile?.(string(file.url))).filter(Boolean);
        const message = (files.length ? `${files.join('\n\n')}\n\n` : '') + string(row.mes);
        const prepareText = (value: string) => regex(substitute(value).replace(/\r/g, ''), role === 'user' ? regexPlacement.userInput : regexPlacement.aiOutput, core.length - index - 1);
        const content = prepareText(message);
        const text = stripPipelineMarkup(content, array(extra.tool_invocations).map(record));
        const name = string(row.name);
        const displayName = role !== 'system' && name && (settings.names_behavior === 2 || (settings.names_behavior ?? 0) === 0 && row.force_avatar && name !== name1);
        const summary = record(extra.chatMemorySummary);
        const summaryTurns = pipelineHistory ? array(summary.turns).map(record) : [];
        const summaryText = pipelineHistory && extra.chatMemorySummary
            ? (summaryTurns.length ? summaryTurns.map(turn => prepareText(string(turn.text))) : [text]).filter(chunk => chunk.trim()).join('\n\n')
            : undefined;
        return { row, role, text: displayName ? `${name}: ${text}` : text, name: settings.names_behavior === 1 ? name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64) : undefined,
            sourceKey: sourceKeys.get(row) ?? (string(summary.turnKey ?? summary.summaryId) || `projected:${index}`),
            summaryText,
        };
    });
    const world = scanWorldInfo(snapshot, prepared.map(message => message.text).reverse(), substitute, regex, runtime);
    const format = (content: string, template: unknown) => content && substitute(string(template).trim() ? string(template).replaceAll('{0}', () => content) : content);
    const card = record(snapshot.character.data);
    const computed = new Map([
        ['worldInfo', format(world.text, settings.wi_format)],
        ['charDescription', format(string(snapshot.character.description ?? card.description).trim(), settings.description_format)],
    ]);
    const generation = generationTrigger(command);
    const manager = makePromptManager(settings, substitute);
    const prompts = manager.getPromptCollection(generation).collection;
    const injections: Injection[] = [];
    const depth = record(record(card.extensions).depth_prompt);
    const relative: ({ message: TextMessage; key: string; tool: string } | 'history')[] = [];
    for (const prompt of prompts) {
        const content = computed.get(prompt.identifier ?? '') ?? (prompt.system_prompt ? '' : prompt.content);
        if (prompt.identifier === 'chatHistory') {
            relative.push('history');
        } else if (content) {
            const message = { role: roleAt(prompt.role), content };
            if (prompt.injection_position === 1) injections.push({ ...message, depth: prompt.injection_depth ?? 0, order: prompt.injection_order });
            else relative.push({ message, key: `preset:${prompt.identifier}`, tool: prompt.identifier === 'charDescription' ? 'character_card' : prompt.identifier === 'worldInfo' ? 'world_info' : 'story_preset' });
        }
    }
    if (depth.prompt) injections.push({ role: roleAt(depth.role), content: substitute(string(depth.prompt).trim()), depth: Number(depth.depth ?? 4), order: 100 });
    injections.push(...world.injections);
    injections.push(...(runtime.injections ?? []));
    // The current turn must not be silently lost, including when the history
    // marker is missing/disabled in a preset.
    if (!relative.includes('history') && prepared.length) invalid('Chat history is disabled in the selected preset');
    const newChat: TextMessage = { role: 'system', content: substitute(string(settings.new_chat_prompt ?? '[Start a new Chat]')) };
    const continueNudge = command.action === 'continue'
        ? substitute(string(settings.continue_nudge_prompt ?? continuationInstruction)) : '';

    const { groups, currentUser, currentInput, mediaCosts, project } = await projectHistory(prepared, {
        settings, model: connection.model, tools: pipelineHistory, pipelineHistory, activeRunId: runtime.pipeline?.activeRunId, resolveMedia: runtime.resolveMedia,
    });
    const tools = pipelineTools(runtime.pipeline);
    const tail = buildPipelineTail(runtime, manager, generation, pipelineHistory, currentInput, project);
    const pack = (key: string, tool: string, message: TextMessage) => pipelineHistory
        ? project(key, tool, message.content, message.role, message.name).messages : [message];
    const limit = connection.contextTokens - (step?.step.maxTokens ?? connection.responseTokens);
    const worldInjections = new Set(world.injections);
    const relativeMessages = relative.map(item => item === 'history' ? item : pack(item.key, item.tool, item.message));
    const newChatMessages = newChat.content ? pack('new_chat', 'story_preset', newChat) : [];
    const assemble = (start: number): ServerPromptMessage[] => {
        const selected = groups.slice(start);
        for (const [index, messages] of groupInjections(injections, selected.length, worldInjections)) {
            selected.splice(index, 0, { messages: messages.flatMap(({ message, key, tool }) => pack(key, tool, message)) });
        }
        const historyMessages = [...newChatMessages];
        const historyText = selected.flatMap(group => group.summaryText || []).join('\n\n');
        let historyPending = Boolean(historyText);
        for (const group of selected) {
            historyMessages.push(...group.messages);
            if (historyPending && group.summaryText) {
                historyMessages.push(...project('history', 'story_history', historyText).messages);
                historyPending = false;
            }
        }
        const messages = relativeMessages.flatMap(item => item === 'history' ? historyMessages : item);
        if (continueNudge) messages.push({ role: 'system', content: continueNudge });
        return settings.squash_system_messages ? squash(messages, newChat) : messages;
    };
    const budget = await promptBudget(connection, tools);
    const reserved = budget.fixed + budget.measure(tail, mediaCosts);
    const measure = (messages: ServerPromptMessage[]) => reserved + budget.measure(messages, mediaCosts);
    // Keep the current user turn (including the reply being continued) and
    // mandatory prompts before adding the newest contiguous older suffix.
    let start = currentUser;
    if (start < 0) start = Math.max(0, prepared.length - 1);
    let messages = assemble(start);
    let promptTokens = measure(messages);
    if (promptTokens > limit) throw new ServerPromptError('budget_exceeded', 'Mandatory prompts exceed the context size');
    const retain = (candidate: number) => {
        const previous = assemble(candidate);
        const tokens = measure(previous);
        if (tokens > limit) return false;
        start = candidate;
        messages = previous;
        promptTokens = tokens;
        return true;
    };
    if (pipelineHistory) {
        // The merged text must be retokenized for each probe. Bracket the
        // budget boundary before bisecting, without recounting every suffix.
        const mandatory = start;
        let stride = 1;
        while (start > 0 && retain(Math.max(0, mandatory - stride))) stride *= 2;
        let tooOld = Math.max(0, mandatory - stride);
        while (tooOld + 1 < start) {
            const middle = Math.floor((tooOld + start) / 2);
            if (!retain(middle)) tooOld = middle;
        }
    } else {
        while (start > 0 && retain(start - 1)) { /* Keep fitting older groups. */ }
    }
    return {
        messages: [...messages, ...tail], connection,
        budget: { contextTokens: connection.contextTokens, responseTokens: connection.responseTokens, promptTokens, omittedHistory: start },
        ...(runtime.pipeline ? { pipeline: { baseMessages: messages, tail, tools, currentInput, mediaCosts } } : {}),
    };
}

/** Apply absolute injections in the reference reverse-history depth/order/role order. */
function groupInjections(injections: Injection[], historyLength: number, worldInjections: Set<Injection>) {
    const groups = new Map<number, Injection[]>();
    for (const entry of injections) {
        if (!Number.isInteger(entry.depth) || entry.depth < 0) continue;
        const bucket = groups.get(entry.depth) ?? [];
        bucket.push(entry);
        groups.set(entry.depth, bucket);
    }
    return [...groups].sort(([a], [b]) => a - b).map(([depth, entries]) => {
        const order = [...new Set(entries.map(entry => entry.order))].sort((a, b) => a - b);
        const messages = order.flatMap(priority => roleOrder.slice().reverse().flatMap(role => {
            const matching = entries.filter(entry => entry.order === priority && entry.role === role);
            const content = matching.map(entry => entry.content.trim()).filter(Boolean).join('\n');
            return content ? [{ message: { role, content }, key: `depth:${depth}:${priority}:${role}`, tool: matching.every(entry => worldInjections.has(entry)) ? 'world_info' : 'prompt_injection' }] : [];
        }));
        return [Math.max(0, historyLength - depth), messages] as const;
    });
}

function squash(messages: ServerPromptMessage[], newChat: ServerPromptMessage) {
    const result: ServerPromptMessage[] = [];
    for (const message of messages) {
        if (message.role === 'system' && message.content === '') continue;
        const last = result.at(-1);
        if (last?.role === 'system' && message.role === 'system' && typeof last.content === 'string' && typeof message.content === 'string' && last !== newChat && message !== newChat && !last.name && !message.name) last.content += `\n${message.content}`;
        else result.push(message !== newChat && message.role === 'system' && typeof message.content === 'string' ? { ...message } : message);
    }
    return result;
}
