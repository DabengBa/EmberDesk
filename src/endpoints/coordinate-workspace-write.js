import { openCanonicalDatabase } from '../canonical-sqlite.js';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.js';
import { executeWorkspaceWrite } from '../character-replace-write-coordinator.js';
import { executeReplaceIntent } from '../character-replace-write-coordinator.js';
import { getCanonicalSqliteFeatureFlags } from '../storage-feature-flags.js';

export function openRequestCoordinationDatabase(request) {
    const handle = request.user?.profile?.handle;
    const directories = request.user?.directories;
    if (!handle || !directories?.root) throw new Error('Workspace write requires an authenticated user');
    const featureFlags = getCanonicalSqliteFeatureFlags();
    if (!featureFlags.enabled) throw new Error('Canonical storage is disabled');
    const db = openCanonicalDatabase({ handle, directories, featureFlags });
    if (!db || !runCanonicalMigrations(db, { strict: true }).ok) throw new Error('Canonical storage is unavailable');
    return db;
}

/**
 * Wrap a handler whose work is fully awaited and whose response is sent with
 * Express's send/json/sendStatus methods. The actual response is delayed until
 * after its durable terminal record; a disconnected socket is not a signal
 * that the handler has stopped writing.
 */
export function coordinateWorkspaceWrite(kind, targetOf, handler) {
    return async function (request, response, next) {
        const sessionId = request.get('x-emberdesk-write-session');
        const operationId = request.get('x-emberdesk-write-operation');
        if (!sessionId && !operationId) return handler(request, response, next);
        if (!sessionId || !operationId) return response.status(400).json({ error: 'incomplete_workspace_write_identity' });

        let db;
        try {
            db = openRequestCoordinationDatabase(request);
        } catch (error) {
            console.error('Workspace write coordination storage unavailable:', error);
            return response.status(503).json({ error: 'canonical_storage_unavailable' });
        }

        const originalSend = response.send;
        const originalEnd = response.end;
        const originalWrite = response.write;
        const originalWriteHead = response.writeHead;
        let buffered;
        let handlerError;
        const preventStreaming = () => { throw new Error('Coordinated write handlers cannot stream responses'); };
        response.send = function (body) {
            if (buffered) throw new Error('Coordinated write handler sent more than one response');
            buffered = { body, status: this.statusCode };
            return this;
        };
        response.end = preventStreaming;
        response.write = preventStreaming;
        response.writeHead = preventStreaming;

        let execution;
        let failure;
        try {
            execution = await executeWorkspaceWrite(db, { sessionId, operationId, kind, target: targetOf(request) ?? null }, async () => {
                try {
                    await handler(request, response, preventStreaming);
                    if (!buffered) throw new Error('Coordinated write handler did not send a response');
                    return {
                        outcome: buffered.status >= 200 && buffered.status < 300 ? 'committed' : 'unknown',
                        value: buffered,
                    };
                } catch (error) {
                    handlerError = error;
                    throw error;
                }
            });
        } catch (error) {
            failure = error;
        } finally {
            response.send = originalSend;
            response.end = originalEnd;
            response.write = originalWrite;
            response.writeHead = originalWriteHead;
        }

        if (response.destroyed) return;
        if (failure) {
            console.error('Coordinated workspace write failed:', failure);
            const status = failure === handlerError ? 500 : failure instanceof TypeError ? 400 : 503;
            return response.status(status).json({ error: 'workspace_write_coordination_failed' });
        }
        if (!execution.claimed) {
            return response.status(409).json({ error: 'workspace_write_not_claimed', status: execution.status, outcome: execution.outcome ?? null });
        }
        response.status(execution.value.status);
        return response.send(execution.value.body);
    };
}
/**
 * Wrap the /text-replace/apply handler so that a durable replace intent fences
 * the execution. Call only when the request carries x-emberdesk-write-session
 * and x-emberdesk-replace-intent headers; falls through to the bare handler
 * when headers are absent.
 *
 * The avatar in the request body must match the stored intent target; a mismatch
 * returns 409 before the writer is claimed so the intent stays claimable.
 *
 * A deterministic 4xx preflight error (e.g. empty query) counts as 'completed'
 * because no canonical write was attempted.
 */
export function coordinateReplaceIntent(handler) {
    return async function (request, response, next) {
        const sessionId = request.get('x-emberdesk-write-session');
        const intentId = request.get('x-emberdesk-replace-intent');
        if (!sessionId && !intentId) return handler(request, response, next);
        if (!sessionId || !intentId) return response.status(400).json({ error: 'incomplete_replace_intent_identity' });

        let db;
        try {
            db = openRequestCoordinationDatabase(request);
        } catch (error) {
            console.error('Replace intent coordination storage unavailable:', error);
            return response.status(503).json({ error: 'canonical_storage_unavailable' });
        }

        // Target mismatch check: compare stored intent avatar against request body.
        // Done before claiming so the intent remains claimable after a mismatch.
        const { getReplaceIntent } = await import('../character-replace-write-coordinator.js');
        const stored = getReplaceIntent(db, { sessionId, intentId });
        if (stored && stored.target) {
            const requestAvatar = String(request.body?.avatar_url ?? '');
            if (stored.target.avatar !== requestAvatar) {
                return response.status(409).json({ error: 'replacement_target_mismatch' });
            }
        }

        const originalSend = response.send;
        let buffered;
        let handlerError;
        response.send = function (body) {
            if (buffered) throw new Error('Coordinated replace intent handler sent more than one response');
            buffered = { body, status: this.statusCode };
            return this;
        };

        let execution;
        let failure;
        try {
            execution = await executeReplaceIntent(db, { sessionId, intentId }, async () => {
                try {
                    await handler(request, response, next);
                    if (!buffered) throw new Error('Replace intent handler did not send a response');
                    // Any deterministic error (4xx) is 'completed': no canonical write was attempted.
                    // Any 5xx is 'unknown': the server may have partially committed.
                    const outcome = buffered.status < 500 ? 'completed' : 'unknown_partial';
                    return {
                        outcome,
                        value: buffered,
                    };
                } catch (error) {
                    handlerError = error;
                    throw error;
                }
            });
        } catch (error) {
            failure = error;
        } finally {
            response.send = originalSend;
        }

        if (response.destroyed) return;
        if (failure) {
            console.error('Replace intent coordination failed:', failure);
            const status = failure === handlerError ? 500 : 503;
            return response.status(status).json({ error: 'replace_intent_coordination_failed' });
        }
        if (!execution.claimed) {
            return response.status(409).json({ error: 'replacement_not_claimed', status: execution.status, outcome: execution.outcome ?? null });
        }
        response.status(execution.value.status);
        return response.send(execution.value.body);
    };
}
