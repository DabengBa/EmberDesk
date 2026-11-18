import { randomUUID } from 'node:crypto';

import { createPromptManagerDomain, type PromptData, type PromptSettings } from '../app/lib/prompt-manager.ts';
import { createChatMemoryCore } from '../public/scripts/chat-memory-shared.js';
import { PIPELINE_FALLBACK_PROMPT, buildStepPrompt, pipelineModelRemovesTools, pipelineStepTool, pipelineTriggerTag } from '../public/scripts/reply-pipeline-core.js';
import { hasEnabledToolBindings } from '../public/scripts/tool-bindings-core.js';
import { escapeRegex } from '../public/scripts/util/primitives.js';
import { countWebTokenizerTokens, getSentencepiceTokenizer, getTiktokenTokenizer, getTokenizerModel, getWebTokenizer } from './endpoints/tokenizers.js';
import { getRegenerateChatPrefix } from './server-generation-service.ts';
import { projectHistory, stripPipelineMarkup, type MediaResolver, type ServerPromptMessage } from './server-prompt/history.ts';
import { array, record, ServerPromptError, string, type RecordView, type ServerPromptSnapshot } from './server-prompt/snapshot.ts';
import { roleAt, scanWorldInfo, type Injection, type Role, type WorldInfoActivation } from './server-prompt/world-info.ts';

export { readServerPromptSnapshot, ServerPromptError, type ServerPromptSnapshot } from './server-prompt/snapshot.ts';

export type ServerPromptCommand = { action: 'send' | 'regenerate' | 'continue'; pendingUserText?: string; pendingUserExtra?: RecordView };
export type { ServerPromptMessage } from './server-prompt/history.ts';
type TextMessage = { role: Role; content: string; name?: string };
export type ServerPromptRuntime = {
    scanPrompts?: readonly string[];
    forceWorldInfo?: readonly WorldInfoActivation[];
    injections?: readonly Injection[];
    projectMemory?: (rows: readonly RecordView[], snapshot: ServerPromptSnapshot) => readonly RecordView[];
    translateMemory?: (text: string) => string;
    resolveMedia?: MediaResolver;
    resolveFile?: (url: string) => string;
    pipeline?: { activeRunId?: string; step: { tool: string; prompt?: string; model?: string }; index: number; total: number }
        | { activeRunId?: string; fallback: true };
};

function invalid(message: string): never {
    throw new ServerPromptError('invalid_config', message);
}

function resolveConnection(preset: RecordView, settings: RecordView) {
    // Connection fields are independently saved by Settings. Never use a URL
    // embedded in an imported preset as authority for the model target.
    if ((settings.chat_completion_source ?? 'openai') !== 'openai') invalid('Invalid chat completion source');
    const modelValue = settings.openai_model ?? 'gpt-4-turbo';
    if (typeof modelValue !== 'string' || !modelValue.trim()) invalid('Invalid model name');
    const model = modelValue.trim();
    const url = settings.custom_url ?? settings.reverse_proxy ?? '';
    if (typeof url !== 'string') invalid('Invalid model base URL');
    const baseUrl = url.trim().replace(/\/+$/, '') || 'https://api.openai.com/v1';
    const parsed = URL.parse(baseUrl);
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || /[?#]/.test(baseUrl)) invalid('Invalid model base URL');

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

/** Shared server-only entry point. Runtime inputs are supplied by the server caller, not the HTTP request. */
export async function assembleServerPrompt(snapshot: ServerPromptSnapshot, command: ServerPromptCommand, runtime: ServerPromptRuntime = {}) {
    const local = record(snapshot.settings.oai_settings);
    const step = runtime.pipeline && 'step' in runtime.pipeline ? runtime.pipeline : undefined;
    const connection = resolveConnection(snapshot.preset, step?.step.model ? { ...local, openai_model: step.step.model } : local);
    const settings = { ...snapshot.preset, ...local };
    const historyPayload = command.action === 'regenerate' ? getRegenerateChatPrefix(snapshot.chat) : snapshot.chat;
    const rows = structuredClone(historyPayload.slice(1).map(record));
    if (command.pendingUserText !== undefined) {
        if (command.action !== 'send') invalid('Only send preview accepts pending user text');
        rows.push({ ...prepareGenerationUserMessage(snapshot, command.pendingUserText), extra: command.pendingUserExtra });
    }
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
            }).items.map(record);
        }
    }
    const prepared = core.map((row, index) => {
        const extra = record(row.extra);
        const role: Role = extra.type === 'narrator' ? 'system' : row.is_user ? 'user' : 'assistant';
        const files = array(extra.files).map(record).map(file => string(file.text) || runtime.resolveFile?.(string(file.url))).filter(Boolean);
        const message = (files.length ? `${files.join('\n\n')}\n\n` : '') + string(row.mes);
        const content = regex(substitute(message).replace(/\r/g, ''), role === 'user' ? regexPlacement.userInput : regexPlacement.aiOutput, core.length - index - 1);
        const text = stripPipelineMarkup(content, array(extra.tool_invocations).map(record));
        const name = string(row.name);
        const displayName = role !== 'system' && name && (settings.names_behavior === 2 || (settings.names_behavior ?? 0) === 0 && row.force_avatar && name !== name1);
        return { row, role, text: displayName ? `${name}: ${text}` : text, name: settings.names_behavior === 1 ? name.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64) : undefined };
    });
    const world = scanWorldInfo(snapshot, prepared.map(message => message.text).reverse(), substitute, regex, runtime);
    const format = (content: string, template: unknown) => content && substitute(string(template).trim() ? string(template).replaceAll('{0}', () => content) : content);
    const card = record(snapshot.character.data);
    const computed = new Map([
        ['worldInfo', format(world.text, settings.wi_format)],
        ['charDescription', format(string(snapshot.character.description ?? card.description).trim(), settings.description_format)],
    ]);
    const generation = command.action === 'send' ? 'normal' : command.action === 'regenerate' ? 'regenerate' : 'continue';
    const manager = makePromptManager(settings, substitute);
    const prompts = manager.getPromptCollection(generation).collection;
    const injections: Injection[] = [];
    const depth = record(record(card.extensions).depth_prompt);
    const relative: (TextMessage | 'history')[] = [];
    for (const prompt of prompts) {
        const content = computed.get(prompt.identifier ?? '') ?? (prompt.system_prompt ? '' : prompt.content);
        if (prompt.identifier === 'chatHistory') {
            relative.push('history');
        } else if (content) {
            const message = { role: roleAt(prompt.role), content };
            if (prompt.injection_position === 1) injections.push({ ...message, depth: prompt.injection_depth ?? 0, order: prompt.injection_order });
            else relative.push(message);
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
        ? substitute(string(settings.continue_nudge_prompt ?? '[Continue your last message without repeating its original content.]')) : '';
    const count = await makeCounter(connection.model);
    const feature = record(snapshot.settings.feature_settings ?? snapshot.settings.extension_settings);
    const removesTools = pipelineModelRemovesTools({ chat_completion_source: 'openai', model: connection.model });
    if (step && removesTools) invalid('Reply pipeline model does not support tools');
    const pipelineHistory = generation === 'normal' && Boolean(runtime.pipeline) && !removesTools;
    const toolsEnabled = !removesTools && (Boolean(runtime.pipeline) || Boolean(record(settings.reply_pipeline).enabled) && hasEnabledToolBindings(feature.tool_bindings));
    const { groups, currentUser, mediaCosts } = await projectHistory(prepared, {
        settings, model: connection.model, tools: toolsEnabled, pipelineHistory, activeRunId: runtime.pipeline?.activeRunId, resolveMedia: runtime.resolveMedia,
    });
    const tools = step ? [pipelineStepTool(step.step)] : [];
    const tail: TextMessage[] = [];
    if (step) {
        const tag = pipelineTriggerTag(step.step.tool);
        for (const entry of manager.getPromptOrderForCharacter(manager.activeCharacter)) {
            const prompt = manager.getPromptById(entry.identifier);
            const triggers = prompt?.injection_trigger ?? [];
            if (!entry.enabled || !prompt || !triggers.includes(tag) || triggers.includes(generation) || triggers.includes('all')) continue;
            const { role, content } = manager.preparePrompt(prompt);
            if (content) tail.push({ role: roleAt(role), content });
        }
        tail.push({ role: 'system', content: buildStepPrompt(step.step, step.index, step.total) });
    } else if (runtime.pipeline) tail.push({ role: 'system', content: PIPELINE_FALLBACK_PROMPT });
    const limit = connection.contextTokens - connection.responseTokens;
    const padding = connection.model.includes('gpt-3.5-turbo-0301') ? 12 : 3;
    const anchor: TextMessage = { role: 'user', content: '以下是此前已经发生的对话。' };
    const assemble = (start: number): ServerPromptMessage[] => {
        const selected = groups.slice(start);
        for (const [index, messages] of groupInjections(injections, selected.length)) selected.splice(index, 0, messages);
        const historyMessages = selected.flat();
        if (pipelineHistory && historyMessages[0]?.role !== 'user' && historyMessages.some(message => 'tool_calls' in message)) historyMessages.unshift(anchor);
        if (newChat.content) historyMessages.unshift(newChat);
        const messages = relative.flatMap(item => item === 'history' ? historyMessages : [item]);
        if (continueNudge) messages.push({ role: 'system', content: continueNudge });
        return settings.squash_system_messages ? squash(messages, newChat) : messages;
    };
    const counts = new Map<ServerPromptMessage, number>();
    const measureOne = (message: ServerPromptMessage) => {
        const cached = counts.get(message);
        if (cached !== undefined) return cached;
        const countable = Object.fromEntries(Object.entries(message).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
        if ('content' in message && Array.isArray(message.content)) countable.content = message.content.map(part => part.type === 'text' ? part.text : '').join('');
        const tokens = count(countable) + (mediaCosts.get(message) ?? 0);
        counts.set(message, tokens);
        return tokens;
    };
    const reserved = tail.reduce((sum, message) => sum + measureOne(message), 0) + (tools.length ? count({ role: 'system', content: JSON.stringify(tools) }) : 0);
    const measure = (messages: ServerPromptMessage[]) => messages.reduce((total, message) => total + measureOne(message), padding + reserved);
    // Keep the current user turn (including the reply being continued) and
    // mandatory prompts before adding the newest contiguous older suffix.
    let start = currentUser;
    if (start < 0) start = Math.max(0, prepared.length - 1);
    let messages = assemble(start);
    let promptTokens = measure(messages);
    if (promptTokens > limit) throw new ServerPromptError('budget_exceeded', 'Mandatory prompts exceed the context size');
    while (start > 0) {
        const previous = assemble(start - 1);
        const tokens = measure(previous);
        if (tokens > limit) break;
        start--;
        messages = previous;
        promptTokens = tokens;
    }
    return {
        messages: [...messages, ...tail], connection,
        budget: { contextTokens: connection.contextTokens, responseTokens: connection.responseTokens, promptTokens, omittedHistory: start },
        ...(runtime.pipeline ? { pipeline: { baseMessages: messages, tail, tools } } : {}),
    };
}

/** Apply absolute injections in the reference reverse-history depth/order/role order. */
function groupInjections(injections: Injection[], historyLength: number) {
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
            const content = entries.filter(entry => entry.order === priority && entry.role === role).map(entry => entry.content.trim()).filter(Boolean).join('\n');
            return content ? [{ role, content }] : [];
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
