import type { DatabaseSync } from 'node:sqlite';
import type { Request, RequestHandler } from 'express';
import sanitize from 'sanitize-filename';
import { getCanonicalWorldInfoBook, normalizeCanonicalWorldInfoName } from './world-info-store.ts';

const DELETE_PREFLIGHT_AVATAR_LIMIT = 500;

export function scanCharacterDeleteWorldReferences(db: DatabaseSync, handle: string) {
    const row = db.prepare('SELECT payload_json FROM settings_documents WHERE user_id = ?').get(handle);
    const document = row ? JSON.parse(String(row.payload_json)) : undefined;
    const settings = (document?.world_info_settings ?? document)?.world_info;
    const otherReferences = new Set<string>();
    const names = (value: unknown): string[] => Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string' && Boolean(name)) : [];
    const selection = typeof settings === 'string' ? [settings] : Array.isArray(settings) ? settings : settings?.globalSelect;
    for (const name of names(selection)) otherReferences.add(name);
    for (const chat of db.prepare('SELECT header_payload_json FROM chat_sessions').iterate()) {
        const name = JSON.parse(String(chat.header_payload_json))?.chat_metadata?.world_info;
        if (typeof name === 'string' && name) otherReferences.add(name);
    }
    const extraByStem = new Map<string, string[]>();
    for (const entry of Array.isArray(settings?.charLore) ? settings.charLore : []) {
        if (typeof entry?.name !== 'string') continue;
        extraByStem.set(entry.name, [...extraByStem.get(entry.name) ?? [], ...names(entry.extraBooks)]);
    }
    const worldsByAvatar = new Map<string, Set<string>>();
    const boundCharacters = new Map<string, { avatar: string; name: string }[]>();
    for (const card of db.prepare('SELECT avatar_filename, display_name, world_name FROM characters WHERE deleted_at_ms IS NULL ORDER BY avatar_filename COLLATE NOCASE').iterate()) {
        const avatar = String(card.avatar_filename);
        const worlds = new Set([...names([card.world_name]), ...extraByStem.get(avatar.replace(/\.[^/.]+$/, '')) ?? []]);
        if (worlds.size) worldsByAvatar.set(avatar, worlds);
        for (const world of worlds) {
            if (!boundCharacters.has(world)) boundCharacters.set(world, []);
            boundCharacters.get(world)!.push({ avatar, name: String(card.display_name ?? avatar) });
        }
    }
    return { worldsByAvatar, boundCharacters, otherReferences };
}

export function createCharacterDeletePreflightHandler(getCanonicalWorldBindingScanState: (request: Request) => Promise<{ ok: boolean; db?: DatabaseSync }>): RequestHandler {
    return async function (request, response) {
        try {
            const avatars = request.body?.avatars;
            if (!Array.isArray(avatars) || avatars.length === 0) {
                return response.send({ worldInfos: [] });
            }

            if (avatars.length > DELETE_PREFLIGHT_AVATAR_LIMIT) {
                return response.status(400).send({ error: 'Too many avatars requested.' });
            }

            const canonicalBindings = await getCanonicalWorldBindingScanState(request);
            if (!canonicalBindings.ok) {
                return response.status(503).send({ error: 'canonical_storage_unavailable' });
            }
            const worldNameToAvatars = new Map<string, string[]>();
            const { boundCharacters, worldsByAvatar } = scanCharacterDeleteWorldReferences(canonicalBindings.db!, request.user.profile?.handle ?? 'default-user');

            for (const avatar of new Set(avatars)) {
                if (typeof avatar !== 'string') continue;
                const safeName = sanitize(avatar);
                if (!safeName || safeName !== avatar) continue;

                for (const worldName of worldsByAvatar.get(avatar) ?? []) {
                    if (!worldNameToAvatars.has(worldName)) worldNameToAvatars.set(worldName, []);
                    worldNameToAvatars.get(worldName)!.push(avatar);
                }
            }

            if (worldNameToAvatars.size === 0) {
                return response.send({ worldInfos: [] });
            }

            const worldInfos = [];

            for (const [worldName, deleteCandidateAvatars] of worldNameToAvatars) {
                const book = getCanonicalWorldInfoBook(canonicalBindings.db!, normalizeCanonicalWorldInfoName(worldName)) as { entries?: object } | null;
                if (!book) continue;
                const entryCount = book?.entries ? Object.keys(book.entries).length : 0;
                worldInfos.push({
                    name: worldName,
                    entryCount,
                    boundCharacters: boundCharacters.get(worldName) ?? [],
                    deleteCandidateAvatars,
                });
            }

            return response.send({ worldInfos });
        } catch (error) {
            console.error('Delete preflight error:', error);
            return response.status(500).send({ error: 'Failed to gather world info metadata.' });
        }
    };
}
