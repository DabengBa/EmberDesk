import { worldInfoCache } from './world-info-state.js';
import { requireWorldInfoShellContext } from './world-info-shell-context.js';

/** Repository for canonical World Info reads and confirmed, per-book writes. */
export function createWorldInfoRepository({ cache, headers, fetch, emitUpdated }) {
    const queues = new Map();
    const revisions = new Map();

    function enqueue(name, operation) {
        const previous = queues.get(name) ?? Promise.resolve();
        const result = previous.catch(() => {}).then(operation);
        queues.set(name, result);
        void result.then(() => {
            if (queues.get(name) === result) queues.delete(name);
        }, () => {
            if (queues.get(name) === result) queues.delete(name);
        });
        return result;
    }

    async function load(name) {
        if (!name) return;
        if (cache.has(name)) return structuredClone(cache.get(name));
        const response = await fetch('/api/worldinfo/get', {
            method: 'POST', headers: headers(), body: JSON.stringify({ name }), cache: 'no-cache',
        });
        if (!response.ok) return null;
        const data = await response.json();
        // A write may have completed while this read was in flight.
        if (!cache.has(name)) {
            cache.set(name, structuredClone(data));
            const revision = response.headers?.get('X-World-Info-Revision');
            if (revision != null) revisions.set(name, Number(revision));
        }
        return structuredClone(cache.get(name));
    }

    async function write(name, data) {
        const response = await fetch('/api/worldinfo/edit', {
            method: 'POST', headers: headers(), body: JSON.stringify({ name, data, expectedRevision: cache.has(name) ? revisions.get(name) : 0 }),
        });
        if (!response.ok) {
            if (response.status === 409) throw new Error('世界书保存冲突（HTTP 409）：此世界书已在其他会话中修改，请重新加载后再保存。');
            // The database is authoritative even when its file projection fails.
            // Remember the committed snapshot and revision so a retry is not stale.
            const result = await response.json?.().catch(() => null);
            if (result?.committed === true && Number.isInteger(result.revision)) {
                revisions.set(name, result.revision);
                cache.set(name, structuredClone(data));
            }
            throw new Error(`World Info save failed (HTTP ${response.status}).`);
        }
        if (response.json) {
            const result = await response.json();
            if (result.revision != null) revisions.set(name, result.revision);
        }
        cache.set(name, structuredClone(data));
        void emitUpdated(name, data);
    }

    function save(name, data) {
        if (!name || !data) return Promise.resolve();
        const snapshot = structuredClone(data);
        return enqueue(name, () => write(name, snapshot));
    }

    function mutate(name, operation) {
        return enqueue(name, () => operation((data) => write(name, structuredClone(data))));
    }

    return { load, save, mutate };
}

export const worldInfoRepository = createWorldInfoRepository({
    cache: worldInfoCache,
    headers: () => requireWorldInfoShellContext().getRequestHeaders(),
    fetch: (...args) => globalThis.fetch(...args),
    emitUpdated: (name, data) => {
        const shell = requireWorldInfoShellContext();
        return shell.eventSource.emit(shell.eventTypes.WORLDINFO_UPDATED, name, data);
    },
});
