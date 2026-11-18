import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import mime from 'mime-types';
import { resolveUiLocale } from '../../public/scripts/ui-locale.js';
import { isPathUnderParent } from '../util.js';
import { canonicalSqliteManager, withCanonicalTransaction } from '../canonical-sqlite.ts';
import { MEDIA_EXTENSIONS } from '../constants.js';
import { createServerGenerationService, ServerGenerationExecutionError, type GenerationChat, type GenerationEvent } from '../server-generation-service.ts';
import { ChatGenerationBusyError } from '../server-generation-lock.ts';
import { streamServerModel } from '../server-generation-model-transport.ts';
import { applyGenerationOutputRegex, DEFAULT_GENERATION_USER_NAME, prepareGenerationUserMessage, readServerPromptSnapshot, ServerPromptError, type ServerPromptCommand, type ServerPromptRuntime, type ServerPromptSnapshot } from '../server-prompt.ts';
import { prepareServerGeneration, previewServerGeneration, runServerPipeline } from '../server-generation-pipeline.ts';
import { array, readTemporaryPromptSnapshot, record, string } from '../server-prompt/snapshot.ts';
import type { WorldInfoActivation } from '../server-prompt/world-info.ts';
import { getCanonicalCharacter } from './character-store.ts';

import { readManagedMediaContent } from './canonical-managed-media-read-service.ts';
import { getCanonicalManagedMediaReference } from './canonical-managed-media-store.ts';
import { readSecret, SECRET_KEYS } from './secrets.js';
import type { ChatRouteContext } from './chat-route-context.ts';

type Action = ServerPromptCommand['action'];
const isAction = (action: unknown): action is Action => action === 'send' || action === 'regenerate' || action === 'continue';
const isRequestId = (requestId: unknown): requestId is string => typeof requestId === 'string' && /^[\w-]{1,128}$/.test(requestId);
const errorResponse = (response: Response, status: number, error: string) => response.status(status).json({ error });

class InvalidAttachmentError extends Error {}
class InvalidWorldRuntimeError extends Error {}

type Directories = Request['user']['directories'];
const zhTranslations: Record<string, string> = JSON.parse(fs.readFileSync(new URL('../../public/locales/zh-cn.json', import.meta.url), 'utf8'));

function attachmentReference(db: DatabaseSync, url: string) {
    const match = /^\/?(user\/(?:images|files)|assets)\/([^?#]+)$/.exec(url);
    if (!match) return null;
    let decoded: string;
    try { decoded = decodeURIComponent(match[2]); } catch { return null; }
    const relative = path.posix.normalize(`${match[1]}/${decoded}`);
    if (!relative.startsWith(`${match[1]}/`) || relative.includes('\\')) return null;
    const ref = getCanonicalManagedMediaReference(db, relative);
    return ref?.lifecycleState === 'active' && ref.deletedAtMs == null ? ref : null;
}

function readAttachment(db: DatabaseSync, directories: Directories, url: string) {
    const ref = attachmentReference(db, url);
    if (!ref) return null;
    const file = path.resolve(directories.storage, ref.managedRelativePath);
    if (!fs.existsSync(file) || !isPathUnderParent(fs.realpathSync(directories.storage), fs.realpathSync(file))) return null;
    const blob = readManagedMediaContent(db, directories, ref);
    return blob.ok && blob.contents ? { contents: blob.contents, mediaType: blob.mediaType } : null;
}

function previewAttachments(value: unknown) {
    const blobs = new Map<string, { contents: Buffer; mediaType: string }>();
    const files: { url: string; name: string }[] = [];
    const media: { url: string; type: string; title: string; source: string }[] = [];
    if (!Array.isArray(value)) throw new InvalidAttachmentError();
    for (const item of value) {
        const { base64, type, extension, name } = record(item);
        if (typeof base64 !== 'string' || typeof name !== 'string') throw new InvalidAttachmentError();
        const url = `draft:${blobs.size}`;
        const contents = Buffer.from(base64, 'base64');
        if (type === undefined) {
            files.push({ url, name });
            blobs.set(url, { contents, mediaType: 'text/plain' });
        } else {
            if (typeof type !== 'string' || typeof extension !== 'string' || !MEDIA_EXTENSIONS.includes(extension)) throw new InvalidAttachmentError();
            const mediaType = mime.lookup(`attachment.${extension}`);
            if (!mediaType || !mediaType.startsWith(`${type}/`)) throw new InvalidAttachmentError();
            media.push({ url, type, title: name, source: 'upload' });
            blobs.set(url, { contents, mediaType });
        }
    }
    return { blobs, extra: { ...(files.length ? { files } : {}),
        ...(media.length ? { media, media_index: media.length - 1, inline_image: true } : {}) } };
}

function sendAttachments(db: DatabaseSync, value: unknown) {
    const { files, media } = record(value);
    const uploadedFiles = array(files).map(item => {
        const { url, name, size, created } = record(item);
        if (typeof url !== 'string' || !/^\/?user\/files\//.test(url) || !attachmentReference(db, url)) throw new InvalidAttachmentError();
        return { url, name: string(name), size: typeof size === 'number' ? size : undefined, created: typeof created === 'number' ? created : undefined };
    });
    const uploadedMedia = array(media).map(item => {
        const { url, type, title, source } = record(item);
        if (typeof url !== 'string' || typeof type !== 'string' || !/^\/?user\/images\//.test(url)
            || !attachmentReference(db, url)?.mediaType?.startsWith(`${type}/`)) throw new InvalidAttachmentError();
        return { url, type, title: string(title), source: string(source) };
    });
    return {
        ...(uploadedFiles.length ? { files: uploadedFiles } : {}),
        ...(uploadedMedia.length ? { media: uploadedMedia, media_index: uploadedMedia.length - 1, inline_image: true } : {}),
    };
}

function parseWorldRuntime(worldInfo: unknown, scanPrompts: unknown): Pick<ServerPromptRuntime, 'forceWorldInfo' | 'scanPrompts'> {
    if (worldInfo !== undefined && !Array.isArray(worldInfo)
        || scanPrompts !== undefined && (!Array.isArray(scanPrompts) || !scanPrompts.every(text => typeof text === 'string'))) {
        throw new InvalidWorldRuntimeError();
    }
    const forceWorldInfo = array(worldInfo).map((item): WorldInfoActivation => {
        const { world, uid, content, position, depth, role, order, useProbability, probability } = record(item);
        if (typeof world !== 'string' || !(typeof uid === 'string' || typeof uid === 'number' && Number.isFinite(uid))
            || content !== undefined && typeof content !== 'string'
            || useProbability !== undefined && typeof useProbability !== 'boolean') throw new InvalidWorldRuntimeError();
        const numeric = (value: unknown) => {
            if (value === undefined) return undefined;
            if ((typeof value === 'number' || typeof value === 'string' && value.trim()) && Number.isFinite(Number(value))) return Number(value);
            throw new InvalidWorldRuntimeError();
        };
        const parsedRole = role === 'system' || role === 'user' || role === 'assistant' ? role : numeric(role);
        return { world, uid, content, position: numeric(position), depth: numeric(depth), role: parsedRole,
            order: numeric(order), useProbability, probability: numeric(probability) };
    });
    return { forceWorldInfo, scanPrompts };
}

type WorldRuntime = ReturnType<typeof parseWorldRuntime>;
function promptRuntime(db: DatabaseSync, directories: Directories, locale: string, worldRuntime: WorldRuntime,
    draft?: ReturnType<typeof previewAttachments>['blobs']): ServerPromptRuntime {
    return {
        ...worldRuntime,
        translateMemory: text => resolveUiLocale(locale) === 'zh-cn' ? zhTranslations[text] ?? text : text,
        resolveFile: url => (/^\/?user\/files\//.test(url) ? readAttachment(db, directories, url) : draft?.get(url))?.contents.toString('utf8') ?? '',
        async resolveMedia({ url, type }) {
            const blob = draft?.get(url) ?? readAttachment(db, directories, url);
            if (!blob?.mediaType?.startsWith(`${type}/`)) return null;
            return { dataUrl: `data:${blob.mediaType};base64,${blob.contents.toString('base64')}` };
        },
    };
}

type GenerationPrompt = { snapshot: ServerPromptSnapshot; directories: Directories; handle: string; locale: string; worldRuntime: WorldRuntime };
const service = createServerGenerationService<GenerationPrompt>({
    async execute({ chat, prompt, ...ports }) {
        const db = canonicalSqliteManager.open({ handle: prompt.handle, directories: prompt.directories, featureFlags: { enabled: true } });
        if (!db) throw new Error('canonical_chat_unavailable');
        const { snapshot } = prompt;
        const command = { action: chat.kind, temporary: ports.run.temporary };
        const runtime = promptRuntime(db, prompt.directories, prompt.locale, prompt.worldRuntime);
        try {
            const prepared = await prepareServerGeneration(snapshot, command, runtime);
            const { messages, connection } = prepared.prompt;
            const apiKey = readSecret(prompt.directories, SECRET_KEYS.OPENAI) || undefined;
            const pipeline = prepared.pipeline ? await runServerPipeline({ prepared, snapshot, runtime, apiKey, ...ports }) : null;
            const text = pipeline?.text ?? await streamServerModel({ ...connection, messages, maxTokens: connection.responseTokens, apiKey, signal: ports.signal, emit: ports.emit });
            if (!text.trim()) throw new Error('Model returned an empty reply');
            const original = record(chat.original);
            const output = applyGenerationOutputRegex(snapshot, text, connection.model);
            const reply = chat.kind === 'continue' ? `${string(original.mes)}${output}` : output;
            return { ...original, name: string(snapshot.character.name), is_user: false, send_date: Date.now(), mes: reply,
                ...(pipeline ? { extra: { tool_invocations: pipeline.invocations } } : {}) };
        } catch (error) {
            if (error instanceof ServerPromptError) throw new ServerGenerationExecutionError(error.code);
            throw error;
        }
    },
});

export function registerChatGenerationRoutes(context: ChatRouteContext) {
    const { router, path, sanitize, getCanonicalChatReadState, getCanonicalChatWriteState, getCanonicalChatLocator,
        getChatsProjectionMode, getBackupFunction, writeChatProjection, invalidateCanonicalAuditStatus, getCanonicalStorageSlice,
        syncCanonicalChatStatsAfterCharacterChatMutation, isPathUnderParent } = context;

    async function run(request: Request, response: Response, write: boolean, action: (db: DatabaseSync, handle: string) => unknown) {
        const handle = request.user?.profile?.handle;
        if (!handle || !request.user.directories) return errorResponse(response, 401, 'authentication_required');
        try {
            const state = await (write ? getCanonicalChatWriteState : getCanonicalChatReadState)(request);
            if (!state.ok) return errorResponse(response, 503, state.reason ?? 'canonical_chat_unavailable');
            if (!response.destroyed) return await action(state.db, handle);
        } catch (error) {
            if (error instanceof InvalidAttachmentError) return errorResponse(response, 400, 'invalid_generation_attachment');
            if (error instanceof InvalidWorldRuntimeError) return errorResponse(response, 400, 'invalid_generation_world_runtime');

            if (error instanceof ServerPromptError) return errorResponse(response, error.code === 'source_not_found' ? 404 : 422, error.code);
            if (error instanceof ChatGenerationBusyError) return errorResponse(response, 409, error.message);
            if (error instanceof Error && ['chat_conflict', 'assistant_reply_required'].includes(error.message)) return errorResponse(response, 409, error.message);
            return errorResponse(response, 500, 'generation_request_failed');
        }
    }

    function target(request: Request, db: DatabaseSync) {
        const { avatar_url, file_name, is_group } = record(request.body);
        if (is_group || typeof avatar_url !== 'string' || !/\.png$/i.test(avatar_url) || sanitize(avatar_url) !== avatar_url
            || typeof file_name !== 'string' || !file_name || sanitize(`${file_name}.jsonl`) !== `${file_name}.jsonl`) return null;
        const cardName = avatar_url.replace(/\.png$/i, '');
        if (!cardName || !getCanonicalCharacter(db, avatar_url, { includeChatStats: false })) throw new ServerPromptError('source_not_found', 'Character not found');
        const { directories } = request.user;
        const filePath = path.join(directories.chats, cardName, `${file_name}.jsonl`);
        if (!isPathUnderParent(directories.chats, filePath)) return null;
        const locator = getCanonicalChatLocator(directories, { ownerType: 'character', ownerId: cardName, filePath });
        return { locator, avatar: avatar_url, filePath, cardName };
    }

    const draftHeader = () => ({ user_name: DEFAULT_GENERATION_USER_NAME, chat_metadata: {} });

    function temporarySnapshot(db: DatabaseSync, handle: string, history: unknown) {
        if (!Array.isArray(history)) throw new ServerPromptError('invalid_config', 'Temporary history must be an array');
        const chat = history.map(item => {
            const { is_user, mes, extra } = record(item);
            if (typeof is_user !== 'boolean' || typeof mes !== 'string') throw new ServerPromptError('invalid_config', 'Invalid temporary message');
            return { is_user, mes, name: is_user ? DEFAULT_GENERATION_USER_NAME : 'Assistant',
                extra: { ...sendAttachments(db, extra), tool_invocations: record(extra).tool_invocations } };
        });
        return readTemporaryPromptSnapshot(db, handle, [draftHeader(), ...chat]);
    }

    router.post('/generation/preview', (request, response) => run(request, response, false, async (db, handle) => {
        const { action, text, locale, attachments, draftAttachments, worldInfo, scanPrompts, round = 0, temporary, history } = record(request.body);
        const chat = temporary === true ? null : target(request, db);
        if ((!chat && temporary !== true) || !isAction(action) || (text !== undefined && typeof text !== 'string') || typeof round !== 'number' || !Number.isInteger(round) || round < 0) return errorResponse(response, 400, 'invalid_generation_command');
        const worldRuntime = parseWorldRuntime(worldInfo, scanPrompts);
        const draft = action === 'send' && draftAttachments !== undefined ? previewAttachments(draftAttachments) : undefined;
        const { snapshot, extra } = withCanonicalTransaction(db, txn => ({
            snapshot: chat ? readServerPromptSnapshot(txn, {
                ...chat, userId: handle, draftHeader: action === 'send' ? draftHeader() : undefined,
            }) : temporarySnapshot(txn, handle, history),
            extra: action === 'send' ? draft?.extra ?? sendAttachments(txn, attachments) : {},
        }));
        const prompt = await previewServerGeneration(snapshot, { action, temporary: temporary === true,
            pendingUserText: action === 'send' ? (text as string | undefined) ?? (Object.keys(extra).length ? '' : undefined) : undefined,
            pendingUserExtra: extra,
        }, promptRuntime(db, request.user.directories, string(locale), worldRuntime, draft?.blobs), round);
        return response.json(prompt);
    }));

    router.post('/generation/create', (request, response) => run(request, response, true, (db, handle) => {
        const { action, text, requestId, version, locale, attachments, worldInfo, scanPrompts, temporary, history } = record(request.body);
        const chat = temporary === true ? null : target(request, db);
        if ((!chat && temporary !== true) || !isAction(action) || !isRequestId(requestId)
            || (version !== undefined && (typeof version !== 'string' || !/^[0-9a-f]{32}$/.test(version)))
            || (action === 'send' ? typeof text !== 'string' : chat !== null && typeof version !== 'string')) {
            return errorResponse(response, 400, 'invalid_generation_command');
        }
        const { directories } = request.user;
        if (!chat) {
            const worldRuntime = parseWorldRuntime(worldInfo, scanPrompts);
            const { snapshot, original, user } = withCanonicalTransaction(db, txn => {
                const source = temporarySnapshot(txn, handle, history);
                if (action === 'send') {
                    const extra = sendAttachments(txn, attachments);
                    if (!Object.keys(extra).length && !string(text).trim()) throw new ServerPromptError('invalid_config', 'Send requires text or attachments');
                    const user = { ...prepareGenerationUserMessage(source, string(text)), send_date: Date.now(), extra };
                    return { snapshot: { ...source, chat: [...source.chat, user] }, original: null, user };
                }
                const tail = source.chat.at(-1);
                if (record(tail).is_user !== false) throw new Error('assistant_reply_required');
                return { snapshot: source, original: action === 'continue' ? tail ?? null : null };
            });
            const result = service.createTemporary(db, requestId, action, original, { snapshot, directories, handle, locale: string(locale), worldRuntime }, user);
            return response.status(202).json(result);
        }
        let sendSnapshot: ServerPromptSnapshot | undefined;
        const common = {
            requestId, locator: chat.locator,
            capturePrompt(txn: DatabaseSync, generation: GenerationChat) {
                const source = sendSnapshot ?? readServerPromptSnapshot(txn, { ...chat, userId: handle });
                const snapshot = { ...source, chat: generation.payload, version: generation.version };
                return { snapshot, directories, handle, locale: string(locale), worldRuntime: parseWorldRuntime(worldInfo, scanPrompts) };
            },
            projection: {
                projection: getChatsProjectionMode(),
                projectJsonl(jsonl: string) { writeChatProjection(jsonl, chat.filePath, handle, chat.cardName, directories.backups); },
                onAuthorityCommitted(jsonl: string) {
                    getBackupFunction(handle)(directories.backups, chat.cardName, jsonl);
                    syncCanonicalChatStatsAfterCharacterChatMutation(handle, directories, chat.avatar, 'server generation');
                },
                onProjectionFailure() {
                    invalidateCanonicalAuditStatus(db, { scope: getCanonicalStorageSlice('chats').auditScope, handle,
                        reason: 'audit_stale_after_chat_projection_failure', source: 'chat:generation' });
                },
            },
        };
        if (action !== 'send') return response.status(202).json(service.create(db, { ...common, kind: action, version: version as string }));
        const userMessage = (txn: DatabaseSync) => {
            const extra = sendAttachments(txn, attachments);
            if (!Object.keys(extra).length && !string(text).trim()) throw new ServerPromptError('invalid_config', 'Send requires text or attachments');
            sendSnapshot = readServerPromptSnapshot(txn, { ...chat, userId: handle, draftHeader: draftHeader() });
            return { ...prepareGenerationUserMessage(sendSnapshot, string(text)), send_date: Date.now(), extra };
        };
        const result = version === undefined
            ? service.create(db, { ...common, kind: action, header: draftHeader(), userMessage })
            : service.create(db, { ...common, kind: action, version, userMessage });
        return response.status(202).json(result);
    }));

    router.post('/generation/find', (request, response) => run(request, response, false, db => {
        const chat = target(request, db);
        return chat ? response.json(service.find(db, chat.locator)) : errorResponse(response, 400, 'invalid_generation_target');
    }));
    router.post('/generation/cancel', (request, response) => run(request, response, false, db => {
        const { temporary, requestId } = record(request.body);
        if (temporary !== true || !isRequestId(requestId)) return errorResponse(response, 400, 'invalid_generation_command');
        service.cancelTemporaryRequest(db, requestId);
        return response.status(204).end();
    }));
    router.get('/generation/:id', (request, response) => run(request, response, false, db => {
        const id = String(request.params.id);
        const result = service.query(db, id);
        return result ? response.json({ ...result, step: service.getStep(db, id) }) : errorResponse(response, 404, 'generation_not_found');
    }));
    router.post('/generation/:id/step', (request, response) => run(request, response, false, db => {
        const { stepId, result } = record(request.body);
        if (typeof stepId !== 'string' || typeof result !== 'string') return errorResponse(response, 400, 'invalid_generation_step');
        const status = service.submitStep(db, String(request.params.id), stepId, result);
        if (status === 'accepted') return response.status(204).end();
        return status === 'missing' ? errorResponse(response, 404, 'generation_not_found') : errorResponse(response, 409, 'generation_step_stale');
    }));
    router.post('/generation/:id/cancel', (request, response) => run(request, response, false, db => {
        const result = service.cancel(db, String(request.params.id));
        return result ? response.json(result) : errorResponse(response, 404, 'generation_not_found');
    }));
    router.get('/generation/:id/events', (request, response) => run(request, response, false, db => {
        const detach = service.subscribe(db, String(request.params.id), (event: GenerationEvent) => {
            if (event.type === 'snapshot') response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
            response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            if (event.type === 'terminal' || (event.type === 'snapshot' && event.run.status !== 'running')) response.end();
        });
        if (!detach) return errorResponse(response, 404, 'generation_not_found');
        response.once('close', detach);
    }));
}
