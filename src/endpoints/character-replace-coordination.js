import express from 'express';

import { openCanonicalDatabase } from '../canonical-sqlite.js';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.js';
import { getCanonicalSqliteFeatureFlags } from '../storage-feature-flags.js';
import {
    acknowledgeReplaceIntent,
    closeWorkspaceWriteSession,
    createReplaceIntent,
    createWorkspaceWriteSession,
    fenceReplaceIntent,
    fenceWorkspaceWrite,
    getReplaceIntent,
    getWorkspaceWrite,
    listUnacknowledgedReplaceIntents,
    markReplaceIntentReady,
    registerIntentWrites,
    removeSettledWorkspaceWriteDetails,
} from '../character-replace-write-coordinator.js';

export const router = express.Router();

// The private router is mounted after the normal authentication and CSRF
// middleware. Never accept a handle or database path from a request body.
router.use((request, response, next) => {
    const handle = request.user?.profile?.handle;
    const directories = request.user?.directories;
    if (!handle || !directories?.root) return response.status(401).json({ error: 'authentication_required' });

    try {
        const featureFlags = getCanonicalSqliteFeatureFlags();
        if (!featureFlags.enabled) return response.status(503).json({ error: 'canonical_storage_unavailable' });
        const db = openCanonicalDatabase({ handle, directories, featureFlags });
        if (!db) return response.status(503).json({ error: 'canonical_storage_unavailable' });
        const migration = runCanonicalMigrations(db, { strict: true });
        if (!migration.ok) return response.status(503).json({ error: 'canonical_storage_unavailable' });
        response.locals.coordinationDb = db;
        return next();
    } catch (error) {
        console.error('Character replacement coordination storage unavailable:', error);
        return response.status(503).json({ error: 'canonical_storage_unavailable' });
    }
});

function route(path, action) {
    router.post(path, (request, response) => {
        try {
            return response.json(action(response.locals.coordinationDb, request.body ?? {}));
        } catch (error) {
            if (error instanceof TypeError) return response.status(400).json({ error: error.message });
            if (error?.code === 'ERR_SQLITE_ERROR') {
                console.error('Character replacement coordination database error:', error);
                return response.status(503).json({ error: 'canonical_storage_unavailable' });
            }
            return response.status(409).json({ error: 'coordination_state_conflict' });
        }
    });
}

route('/sessions/create', db => createWorkspaceWriteSession(db));
route('/sessions/close', (db, body) => closeWorkspaceWriteSession(db, body));
route('/sessions/cleanup', (db, body) => removeSettledWorkspaceWriteDetails(db, body));
route('/writes/status', (db, body) => ({ write: getWorkspaceWrite(db, body) }));
route('/writes/fence', (db, body) => fenceWorkspaceWrite(db, body));
route('/intents/create', (db, body) => createReplaceIntent(db, body));
route('/intents/status', (db, body) => ({ intent: getReplaceIntent(db, body) }));
route('/intents/list', db => ({ intents: listUnacknowledgedReplaceIntents(db) }));
route('/intents/register-writes', (db, body) => registerIntentWrites(db, body));
route('/intents/ready', (db, body) => markReplaceIntentReady(db, body));
route('/intents/fence', (db, body) => fenceReplaceIntent(db, body));
route('/intents/acknowledge', (db, body) => acknowledgeReplaceIntent(db, body));
