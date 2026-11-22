import { resolveUiLocale } from '../../public/scripts/ui-locale.js';
import { withCanonicalTransaction } from '../canonical-sqlite.ts';
import { prepareChatMemorySummary } from '../server-chat-memory.ts';
import { streamServerModel } from '../server-generation-model-transport.ts';
import { record } from '../server-prompt/snapshot.ts';
import type { ChatRouteContext } from './chat-route-context.ts';
import { readSecret, SECRET_KEYS } from './secrets.ts';

const commandKeys = new Set(['avatar_url', 'file_name', 'turnKey', 'messageIds', 'contentHash', 'locale']);

export function registerChatMemoryRoutes(context: ChatRouteContext) {
    const { router, path, sanitize, getCanonicalChatReadState, getCanonicalChatLocator, isPathUnderParent } = context;
    router.post('/memory/summarize', async (request, response) => {
        const handle = request.user?.profile?.handle;
        const directories = request.user?.directories;
        if (!handle || !directories) return response.status(401).json({ error: 'authentication_required' });

        const input = record(request.body);
        const { avatar_url: avatar, file_name: file, turnKey, messageIds, contentHash, locale } = input;
        if (Object.keys(input).some(key => !commandKeys.has(key))
            || typeof avatar !== 'string' || !/^.+\.png$/i.test(avatar) || sanitize(avatar) !== avatar
            || typeof file !== 'string' || !file || sanitize(`${file}.jsonl`) !== `${file}.jsonl`
            || typeof turnKey !== 'string' || !turnKey || !Array.isArray(messageIds) || messageIds[0] !== turnKey
            || !messageIds.every(id => typeof id === 'string' && id.length)
            || typeof contentHash !== 'string' || !/^[0-9a-f]{8}$/.test(contentHash)
            || (locale !== undefined && typeof locale !== 'string')) {
            return response.status(400).json({ error: 'invalid_summary_command' });
        }
        const ownerId = avatar.replace(/\.png$/i, '');
        const filePath = path.join(directories.chats, ownerId, `${file}.jsonl`);
        if (!isPathUnderParent(directories.chats, filePath)) return response.status(400).json({ error: 'invalid_summary_command' });

        const controller = new AbortController();
        const abort = () => controller.abort();
        response.once('close', abort);
        try {
            const state = await getCanonicalChatReadState(request);
            if (controller.signal.aborted || response.destroyed) return;
            if (!state.ok) return response.status(503).json({ error: state.reason ?? 'canonical_chat_unavailable' });
            const locator = getCanonicalChatLocator(directories, { ownerType: 'character', ownerId, filePath });
            const summary = withCanonicalTransaction(state.db, db => prepareChatMemorySummary(db, {
                handle, locator, avatar, locale: resolveUiLocale(locale), target: { turnKey, messageIds, contentHash },
            }));
            if (!summary.connection) return response.status(summary.status).json({ error: summary.error });
            const apiKey = readSecret(directories, SECRET_KEYS.OPENAI) || undefined;
            if (!apiKey && summary.needsApiKey) return response.status(422).json({ error: 'invalid_summary_connection' });
            const text = (await streamServerModel({ ...summary.connection, stream: false, apiKey, signal: controller.signal, emit() {} })).trim();
            if (controller.signal.aborted || response.destroyed) return;
            if (!text) return response.status(502).json({ error: 'empty_summary_completion' });
            return response.json({ text });
        } catch {
            if (!controller.signal.aborted && !response.destroyed) return response.status(502).json({ error: 'summary_request_failed' });
        } finally {
            response.off('close', abort);
        }
    });
}
