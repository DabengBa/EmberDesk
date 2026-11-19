import fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { getFallbackOpenAIModel } from '../app/lib/generation/shared-state.ts';
import { createChatMemoryCore } from '../public/scripts/chat-memory-shared.js';
import { isLegacyOpenAICompletionSource, resolveReasoningEffort, resolveVerbosity } from '../public/scripts/openai-provider-capabilities.js';
import { OPENAI_FIXED_REASONING_EFFORT, OPENAI_REASONING_EFFORT_MAP, OPENAI_REASONING_EFFORT_MODELS, OPENAI_VERBOSITY_MODELS } from './constants.js';
import { readCanonicalChatPayload, type CanonicalChatLocator } from './endpoints/canonical-chat-read-service.ts';
import { getCanonicalCharacter } from './endpoints/character-store.ts';
import { getCanonicalSettingsDocument } from './endpoints/settings-store.ts';
import { getGenerationUserName, resolveGenerationModelBaseUrl } from './server-prompt.ts';
import { record, string } from './server-prompt/snapshot.ts';

const zhTranslations = record(JSON.parse(fs.readFileSync(new URL('../public/locales/zh-cn.json', import.meta.url), 'utf8')));

export type SummaryTurn = { turnKey: string; messageIds: string[]; contentHash: string };

/** Read only the canonical sources needed for the existing two-message summary prompt. */
export function prepareChatMemorySummary(db: DatabaseSync, { handle, locator, avatar, locale, target }: {
    handle: string; locator: CanonicalChatLocator; avatar: string; locale: string; target: SummaryTurn;
}) {
    const character = getCanonicalCharacter(db, avatar, { includeChatStats: false });
    const payload = character && readCanonicalChatPayload(db, locator);
    if (!payload) return { error: 'summary_chat_not_found', status: 404 } as const;

    const [header, ...chat] = payload;
    const metadata = record(record(header).chat_metadata);
    const settings = record(record(getCanonicalSettingsDocument(db, { userId: handle })?.payload).oai_settings);
    const memory = createChatMemoryCore((text: string) => locale === 'zh-cn' ? string(zhTranslations[text]) || text : text, Symbol.for('ignore'));
    const { enabled, keepTurns, prompt, maxTokens } = memory.resolveChatMemorySettings(settings, metadata);
    const { summarizableTurns } = memory.computeMemoryWindow(memory.partitionChatTurns(chat), keepTurns);
    const turn = summarizableTurns.find(candidate => record(candidate).key === target.turnKey);
    if (!enabled || !turn || JSON.stringify(record(turn).messageIds) !== JSON.stringify(target.messageIds)
        || memory.computeTurnHash(chat, turn) !== target.contentHash) return { error: 'stale_summary_turn', status: 409 } as const;
    const source = memory.extractTurnSourceText(chat, turn);
    if (!source.trim()) return { error: 'empty_summary_turn', status: 422 } as const;

    const fallbackModel = settings.fallback_provider_enabled === false ? '' : getFallbackOpenAIModel(settings);
    const configuredModel = string(settings.openai_model) || 'gpt-4-turbo';
    const legacyModel = configuredModel === 'gpt-4-turbo' ? string(settings.custom_model) : '';
    const model = (fallbackModel || legacyModel || configuredModel).trim();
    const customUrl = settings.custom_url || settings.reverse_proxy || '';
    const baseUrl = resolveGenerationModelBaseUrl(customUrl);
    const provider = settings.chat_completion_source ?? 'openai';
    if ((provider !== 'openai' && !isLegacyOpenAICompletionSource(provider)) || !model || !baseUrl) {
        return { error: 'invalid_summary_connection', status: 422 } as const;
    }
    const effort = string(resolveReasoningEffort({ reasoning_effort: 'high', ...settings, chat_completion_source: 'openai', openai_model: model }));
    const reasoningEffort = effort && OPENAI_REASONING_EFFORT_MODELS.includes(model)
        ? string(record(OPENAI_FIXED_REASONING_EFFORT)[model] ?? record(OPENAI_REASONING_EFFORT_MAP)[effort] ?? effort)
        : /^koboldcpp\/(.+)$/.test(model) ? effort : undefined;
    const verbosity = OPENAI_VERBOSITY_MODELS.test(model) ? string(resolveVerbosity(settings)) || undefined : undefined;
    const userName = getGenerationUserName(record(header));
    const substitute = (text: string) => text.replaceAll('{{char}}', () => string(record(character).name))
        .replaceAll('{{user}}', () => userName);
    return { connection: {
        model, baseUrl, maxTokens, reasoningEffort, verbosity,
        temperature: Number(settings.temp_openai ?? 1), frequencyPenalty: Number(settings.freq_pen_openai ?? 0),
        presencePenalty: Number(settings.pres_pen_openai ?? 0), topP: Number(settings.top_p_openai ?? 1),
        messages: [{ role: 'system', content: substitute(prompt) }, { role: 'user', content: substitute(source) }],
    }, needsApiKey: !string(customUrl).trim() };
}
