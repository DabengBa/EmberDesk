import type { DatabaseSync } from 'node:sqlite';

import { readCanonicalChatPayload, type CanonicalChatLocator } from '../endpoints/canonical-chat-read-service.ts';
import { getCanonicalChatSession } from '../endpoints/canonical-chat-store.ts';
import { getCanonicalCharacter } from '../endpoints/character-store.ts';
import { getCanonicalPreset } from '../endpoints/presets-store.ts';
import { getCanonicalSettingsDocument } from '../endpoints/settings-store.ts';
import { getCanonicalWorldInfoBook } from '../endpoints/world-info-store.ts';

export type RecordView = Record<string, unknown>;
export const record = (value: unknown): RecordView => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordView : {};
export const string = (value: unknown) => typeof value === 'string' ? value : '';
export const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const worldInfoSettings = (settings: RecordView) => record(settings.world_info_settings ?? settings);

export type WorldBook = { name: string; scope: 'chat' | 'global' | 'character'; entries: RecordView[] };
export type ServerPromptSnapshot = {
    version: string | null;
    character: RecordView;
    settings: RecordView;
    preset: RecordView;
    chat: readonly object[];
    books: readonly WorldBook[];
};

export class ServerPromptError extends Error {
    readonly code: 'source_not_found' | 'invalid_config' | 'budget_exceeded';
    constructor(code: ServerPromptError['code'], message: string) {
        super(message);
        this.code = code;
    }
}

/** Synchronous read in the caller's transaction, after persisting the pending user message for send. */
export function readServerPromptSnapshot(db: DatabaseSync, { userId, locator, avatar, draftHeader }: {
    userId: string; locator: CanonicalChatLocator; avatar?: string; draftHeader?: RecordView;
}): ServerPromptSnapshot {
    const session = getCanonicalChatSession(db, locator);
    const chat = session ? readCanonicalChatPayload(db, locator) : draftHeader && [draftHeader];
    if (!chat) throw new ServerPromptError('source_not_found', 'Chat not found');
    const character = getCanonicalCharacter(db, avatar ?? locator.ownerId, { includeChatStats: false });
    if (!character) throw new ServerPromptError('source_not_found', 'Character not found');

    const settings = record(getCanonicalSettingsDocument(db, { userId })?.payload);
    const oai = record(settings.oai_settings);
    const presetName = string(oai.preset_settings_openai) || 'Default';
    const preset = getCanonicalPreset(db, { name: presetName });
    const header = record(chat[0]);
    const selection = worldInfoSettings(settings).world_info;
    const world = record(selection);
    const loreOwner = (avatar ?? locator.ownerId).replace(/\.png$/i, '');
    const extra = array(world.charLore).map(record).find(item => item.name === loreOwner);
    const globalNames = typeof selection === 'string' ? [selection] : Array.isArray(selection) ? selection : array(world.globalSelect);
    const chatName = record(header.chat_metadata).world_info;
    const sources = [
        ['global', globalNames],
        ['chat', [chatName]],
        ['character', [record(record(character.data).extensions).world, ...array(extra?.extraBooks)]],
    ] as const;
    const books: WorldBook[] = [];
    const seen = new Set<string>();
    for (const [scope, names] of sources) {
        for (const name of names) {
            if (typeof name !== 'string' || !name || seen.has(name)) continue;
            seen.add(name);
            const book = getCanonicalWorldInfoBook(db, name);
            if (book) books.push({ name, scope, entries: Object.values(record(record(book).entries)).map(record) });
        }
    }
    return { version: session?.concurrency_token ?? null, character, settings, preset: preset ? record(JSON.parse(preset.payloadJson)) : {}, chat, books };
}
