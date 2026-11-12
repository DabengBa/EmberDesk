import { DatabaseSync } from 'node:sqlite';
import { resolveCanonicalDatabasePath } from './canonical-sqlite.js';

/** Coarse commit hints only. Versions are meaningful on one connection only. */
export function createCharacterLibraryChangeObserver({
    pollMs = 1000,
    lifetimeMs = 60000,
    maxPerUser = 8,
    maxTotal = 256,
    openDatabase = file => new DatabaseSync(file, { readOnly: true }),
} = {}) {
    const observers = new Map();
    let total = 0;
    let disposed = false;

    function release(entry) {
        observers.delete(entry.key);
        clearInterval(entry.poll);
        clearTimeout(entry.expiry);
        try { entry.db.close(); } catch { /* Already closed after an I/O error. */ }
    }
    function stop(entry) {
        if (observers.get(entry.key) !== entry) return;
        const subscribers = [...entry.subscribers];
        total -= subscribers.length;
        entry.subscribers.clear();
        release(entry);
        for (const subscriber of subscribers) {
            try { subscriber.close?.(); } catch { /* Other streams must still close. */ }
        }
    }

    return {
        subscribe(directories, subscriber) {
            if (disposed) throw new Error('Character library observer is closed');
            const { dbPath } = resolveCanonicalDatabasePath(directories);
            const key = process.platform === 'win32' ? dbPath.toLowerCase() : dbPath;
            let entry = observers.get(key);
            if (total >= maxTotal || (entry?.subscribers.size ?? 0) >= maxPerUser) {
                const error = new Error('Character library stream limit exceeded');
                error.code = 'STREAM_LIMIT';
                throw error;
            }
            if (!entry) {
                const db = openDatabase(dbPath);
                try {
                    // No migrations, audit, journal-mode change or long read transaction.
                    const version = db.prepare('PRAGMA data_version').get().data_version;
                    entry = { key, db, version, subscribers: new Set(), poll: null, expiry: null };
                } catch (error) {
                    db.close();
                    throw error;
                }
                observers.set(key, entry);
                entry.poll = setInterval(() => {
                    try {
                        const version = db.prepare('PRAGMA data_version').get().data_version;
                        if (version === entry.version) return;
                        entry.version = version;
                        for (const current of [...entry.subscribers]) current.invalidate?.();
                    } catch { stop(entry); }
                }, pollMs);
                // Rotate the whole group. Later tabs must not pin a replaced inode.
                entry.expiry = setTimeout(() => stop(entry), lifetimeMs);
                entry.poll.unref();
                entry.expiry.unref();
            }
            entry.subscribers.add(subscriber);
            total++;
            return () => {
                if (!entry.subscribers.delete(subscriber)) return;
                total--;
                if (!entry.subscribers.size) release(entry);
            };
        },
        dispose() {
            disposed = true;
            for (const entry of [...observers.values()]) stop(entry);
        },
    };
}

export const characterLibraryChangeObserver = createCharacterLibraryChangeObserver();
