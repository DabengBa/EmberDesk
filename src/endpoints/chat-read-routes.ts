import fs from 'node:fs';
import path from 'node:path';

import type { Request, RequestHandler, Response, Router } from 'express';
import sanitize from 'sanitize-filename';

import validateAvatarUrlMiddleware from '../middleware/validateFileName.js';
import { isPathUnderParent } from '../util.js';
import type { UserDirectoryList } from '../users.js';
import type { ChatRouteContext } from './chat-route-context.ts';

type ChatLocator = { ownerType: 'character'; ownerId: string; sourcePath: string };
type ChatRoutePayload = { active: boolean; payload: unknown; version?: string | null; reason?: string };

type ChatReadDependencies = {
    rejectGroupChatRequest: RequestHandler;
    getCanonicalChatLocator: (directories: UserDirectoryList, options: { ownerType: 'character'; ownerId: string; filePath: string }) => ChatLocator;
    readCanonicalChatRoutePayload: (request: Request, locator: ChatLocator) => Promise<ChatRoutePayload>;
    sendCanonicalChatReadBlocked: (response: Response, state: ChatRoutePayload) => Response;
};

/** Register at the original position so the compatibility router keeps its order. */
export function registerChatGetRoute(router: Router, dependencies: ChatReadDependencies): void {
    const { rejectGroupChatRequest, getCanonicalChatLocator, readCanonicalChatRoutePayload, sendCanonicalChatReadBlocked } = dependencies;
    router.post('/get', rejectGroupChatRequest, validateAvatarUrlMiddleware, async function (request, response) {
        try {
            const dirName = String(request.body.avatar_url).replace('.png', '');
            const directoryPath = path.join(request.user.directories.chats, dirName);
            if (!isPathUnderParent(request.user.directories.chats, directoryPath)) {
                return response.sendStatus(400);
            }
            if (!request.body.file_name) {
                if (!fs.existsSync(directoryPath)) {
                    fs.mkdirSync(directoryPath);
                }
                return response.send({});
            }

            const chatFileName = `${String(request.body.file_name)}.jsonl`;
            const chatFilePath = path.join(directoryPath, sanitize(chatFileName));
            const canonical = await readCanonicalChatRoutePayload(request, getCanonicalChatLocator(request.user.directories, {
                ownerType: 'character',
                ownerId: dirName,
                filePath: chatFilePath,
            }));
            if (!canonical.active) {
                return sendCanonicalChatReadBlocked(response, canonical);
            }
            if (canonical.version) response.set('X-Chat-Version', canonical.version);
            return response.send(canonical.payload ?? {});
        } catch (error) {
            console.error(error);
            return response.send({});
        }
    });
}

export function registerChatSearchRoute(context: ChatRouteContext): void {
    const { router, validateAvatarUrlMiddleware, getCanonicalChatReadState, sendCanonicalChatReadBlocked, reconcileCanonicalChatSources, searchCanonicalChatPayload } = context;
    router.post('/search', validateAvatarUrlMiddleware, async function (request, response) {
        try {
            const { query, avatar_url, group_id } = request.body;
            if (group_id) {
                return response.send([]);
            }
            const readState = await getCanonicalChatReadState(request);
            if (!readState.ok) {
                return sendCanonicalChatReadBlocked(response, readState);
            }
            reconcileCanonicalChatSources({
                db: readState.db,
                directories: request.user.directories,
                ownerType: 'character',
                ownerId: String(avatar_url ?? '').replace('.png', ''),
            });
            const payload = await searchCanonicalChatPayload({
                db: readState.db,
                query,
                avatarUrl: avatar_url,
            });

            return response.send(payload);
        } catch (error) {
            console.error('Chat search error:', error);
            return response.status(500).json({ error: 'Search failed' });
        }
    });
}

export function registerChatRecentRoute(context: ChatRouteContext): void {
    const { router, fs, path, getCanonicalChatReadState, sendCanonicalChatReadBlocked, readCanonicalRecentChatPayload, getChatInfo } = context;
    router.post('/recent', async function (request, response) {
        try {
            const dependencies = {
                fs,
                path,
                getChatInfo,
            };
            const readState = await getCanonicalChatReadState(request);
            if (!readState.ok) {
                return sendCanonicalChatReadBlocked(response, readState);
            }
            const payload = await readCanonicalRecentChatPayload({
                db: readState.db,
                directories: request.user.directories,
                pinned: request.body.pinned,
                max: request.body.max,
                metadata: !!request.body.metadata,
                dependencies,
            });

            return response.send(payload);
        } catch (error) {
            console.error(error);
            return response.sendStatus(500);
        }
    });
}
