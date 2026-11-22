import { performance } from 'node:perf_hooks';
import type { Request, RequestHandler, Response } from 'express';
import type { UserDirectoryList } from '../user-types.ts';
import { readCharacterFullPayload, readCharacterListPayload } from './character-read-service.ts';
import type { CharacterReadDependencies } from './character-read-service.ts';

type Dependencies = {
    shallow: boolean;
    createReadDependencies: () => CharacterReadDependencies;
    sendCanonicalReadUnavailable: (response: Response, reason: string) => unknown;
    canonicalReadErrorReason: (error: unknown) => string | null;
    applyInteractionPerfHeaders: (response: Response, pathName: string | undefined, startedAt: number, directories?: UserDirectoryList | null) => void;
    sendCharacterListResponse: (request: Request, response: Response) => Promise<unknown>;
    listCanonicalCharacterChats: (request: Request, ownerId: string) => Promise<{ file_name?: string; file_id?: string }[] | null>;
};

export function createCharacterReadHandlers(deps: Dependencies): { all: RequestHandler; list: RequestHandler; get: RequestHandler; chats: RequestHandler } {
    return {
        all: async function (request, response) {
            const startedAt = performance.now();
            try {
                const payload = await readCharacterListPayload({
                    handle: request.user.profile?.handle ?? null, directories: request.user.directories,
                    shallow: deps.shallow, dependencies: deps.createReadDependencies(),
                });
                if (payload.canonicalUnavailable) return deps.sendCanonicalReadUnavailable(response, payload.canonicalUnavailable);
                deps.applyInteractionPerfHeaders(response, payload.interactionPath, startedAt, request.user.directories);
                return response.send(payload.result.data);
            } catch (err) {
                const reason = deps.canonicalReadErrorReason(err);
                if (reason !== null) return deps.sendCanonicalReadUnavailable(response, reason);
                console.error(err);
                const isRangeError = err instanceof RangeError;
                deps.applyInteractionPerfHeaders(response, 'characters_all:error', startedAt, request.user?.directories);
                response.status(500).send({ overflow: isRangeError, error: true });
            }
        },
        list: async function (request, response) { await deps.sendCharacterListResponse(request, response); },
        get: async function (request, response) {
            const startedAt = performance.now();
            try {
                if (!request.body) return response.sendStatus(400);
                const payload = await readCharacterFullPayload({
                    handle: request.user.profile?.handle ?? null, directories: request.user.directories,
                    avatarUrl: request.body.avatar_url, dependencies: deps.createReadDependencies(),
                });
                if (payload.canonicalUnavailable) return deps.sendCanonicalReadUnavailable(response, payload.canonicalUnavailable);
                if (payload.status === 'not_found') return response.sendStatus(404);
                deps.applyInteractionPerfHeaders(response, payload.interactionPath, startedAt, request.user.directories);
                return response.send(payload.result!.data);
            } catch (err) {
                const reason = deps.canonicalReadErrorReason(err);
                if (reason !== null) return deps.sendCanonicalReadUnavailable(response, reason);
                console.error(err);
                deps.applyInteractionPerfHeaders(response, 'characters_get:error', startedAt, request.user?.directories);
                response.sendStatus(500);
            }
        },
        chats: async function (request, response) {
            try {
                if (!request.body) return response.sendStatus(400);
                const characterDirectory = request.body.avatar_url.replace('.png', '');
                const canonicalChats = await deps.listCanonicalCharacterChats(request, characterDirectory);
                if (canonicalChats === null) return response.send({ error: true });
                if (request.body.simple) return response.send(canonicalChats.map(chat => ({ file_name: chat.file_name, file_id: chat.file_id })));
                return response.send(canonicalChats);
            } catch (error) {
                console.error(error);
                return response.send({ error: true });
            }
        },
    };
}
