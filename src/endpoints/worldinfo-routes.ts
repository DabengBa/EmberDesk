import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import type { Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { UserDirectoryList } from '../user-types.ts';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { setImportedWorldInfoPositions } from '../../public/scripts/world-info-import-placement.js';
import { invalidateDirectory } from './settings-cache.ts';
import { canonicalSqliteManager, withCanonicalTransaction } from '../canonical-sqlite.ts';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.ts';
import { getPersistedCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.ts';
import { recordImportLedgerEntry } from '../canonical-import-ledger.ts';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.ts';
import { ensureCanonicalSliceBackend } from '../canonical-backend.ts';
import { coordinateWorkspaceWrite } from './coordinate-workspace-write.ts';
import { recordWorldProjectionIntent, replayWorldProjection } from '../canonical-world-info-projection.ts';
import {
    getCanonicalWorldInfoBook,
    getCanonicalWorldInfoRevision,
    listCanonicalWorldInfoBooks,
    markCanonicalWorldInfoBookDeleted,
    normalizeCanonicalWorldInfoName,

    upsertCanonicalWorldInfoBookInTransaction,
} from './world-info-store.ts';
import {
    clearCanonicalCharacterWorldBinding,
    listCanonicalCharactersBoundToWorld,
} from './character-store.ts';

function getRequestHandle(request: Request) {
    // Legacy callers may supply a bare user handle rather than a profile.
    return request.user?.profile?.handle ?? (request.user as typeof request.user & { handle?: string })?.handle ?? 'default-user';
}

export async function getCanonicalWorldInfoReadState(request: Request) {
    const worldInfoSlice = getCanonicalStorageSlice('world_info');
    const featureFlags = worldInfoSlice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false as const, reason: 'canonical_storage_disabled', featureFlags };
    }
    await ensureCanonicalSliceBackend('world_info', request.user.directories, getRequestHandle(request));
    if (!featureFlags.reads) {
        return { ok: false as const, reason: 'canonical_reads_disabled', featureFlags };
    }

    const db = canonicalSqliteManager.open({
        handle: getRequestHandle(request),
        directories: request.user.directories,
        featureFlags: {
            enabled: true,
            strict: !!featureFlags.strict,
        },
    });
    if (!db) {
        return { ok: false as const, reason: 'canonical_storage_unavailable', featureFlags };
    }

    const migrationStatus = runCanonicalMigrations(db, {
        strict: !!featureFlags.strict,
    });
    if (!migrationStatus.ok) {
        return { ok: false as const, reason: 'migration_blocked', featureFlags, migrationStatus };
    }

    const auditStatus = getPersistedCanonicalAuditStatus(db, { scope: worldInfoSlice.auditScope });
    if (auditStatus.blocking) {
        return { ok: false as const, reason: auditStatus.reason ?? 'world_info_audit_blocked', featureFlags, auditStatus };
    }

    // Surface slice readiness so later routes can query blockers without coupling.
    const rollback = worldInfoSlice.getRollbackBlockers({
        db,
        featureFlags,
        phase: 'reads',
        persistedAuditStatus: auditStatus,
    });
    if (!rollback.ok) {
        const reason = rollback.blockers[0]?.code ?? auditStatus.reason ?? 'world_info_slice_blocked';
        return { ok: false as const, reason, featureFlags, auditStatus, rollback };
    }

    return {
        ok: true as const,
        db,
        featureFlags,
        migrationStatus,
        auditStatus,
        sliceKey: worldInfoSlice.key,
    };
}

export async function getCanonicalWorldInfoWriteState(request: Request) {
    const readState = await getCanonicalWorldInfoReadState(request);
    if (!readState.ok) {
        return readState;
    }

    if (!readState.featureFlags.writes) {
        return {
            ...readState,
            ok: false as const,
            reason: 'canonical_writes_disabled',
        };
    }

    const worldInfoSlice = getCanonicalStorageSlice('world_info');
    const writeBlockers = worldInfoSlice.getRollbackBlockers({
        db: readState.db,
        featureFlags: readState.featureFlags,
        phase: 'writes',
        persistedAuditStatus: readState.auditStatus,
        // A pending v1 intent is expected state for an in-flight world write.
        // Legacy repair rows still block; operator status/downgrade callers
        // keep the default strict view.
        allowProtocolPending: true,
    });
    if (!writeBlockers.ok) {
        const reason = writeBlockers.blockers[0]?.code ?? 'world_info_write_blocked';
        return {
            ...readState,
            ok: false as const,
            reason,
            rollback: writeBlockers,
        };
    }

    return readState;
}

export function writeWorldInfoProjectionFile(directories: UserDirectoryList, worldName: string, payload: unknown, db: DatabaseSync | null = null) {
    if (getCanonicalStorageSlice('world_info').getProjectionMode() === 'off') {
        return;
    }
    const filename = `${normalizeCanonicalWorldInfoName(worldName)}.json`;
    const pathToFile = path.join(directories.worlds, filename);
    const contents = JSON.stringify(payload, null, 4);
    writeFileAtomicSync(pathToFile, contents);
    invalidateDirectory(directories.worlds);
    if (db) {
        recordImportLedgerEntry(db, {
            sliceKey: 'world_info',
            sourcePath: path.relative(directories.root, pathToFile),
            contentHash: crypto.createHash('sha256').update(contents).digest('hex'),
            origin: 'projection',
        });
    }
}

function sendCanonicalWorldInfoUnavailable(response: Response, state: { reason?: string }) {
    return response.status(503).send({
        error: 'canonical_storage_unavailable',
        reason: state?.reason ?? 'canonical_storage_unavailable',
    });
}


/**
 * Reads a World Info file and returns its contents
 * @param {import('../user-types.ts').UserDirectoryList} directories User directories
 * @param {string} worldInfoName Name of the World Info file
 * @param {boolean} allowDummy If true, returns an empty object if the file doesn't exist
 * @returns {object} World Info file contents
 */
export function readWorldInfoFile(directories: UserDirectoryList, worldInfoName: string, allowDummy: boolean) {
    const dummyObject = allowDummy ? { entries: {} } : null;

    if (!worldInfoName) {
        return dummyObject;
    }

    const filename = sanitize(`${worldInfoName}.json`);
    const pathToWorldInfo = path.join(directories.worlds, filename);

    if (!fs.existsSync(pathToWorldInfo)) {
        console.error(`World info file ${filename} doesn't exist.`);
        return dummyObject;
    }

    const worldInfoText = fs.readFileSync(pathToWorldInfo, 'utf8');
    const worldInfo = JSON.parse(worldInfoText);
    return worldInfo;
}

export const router = express.Router();

router.post('/list', async (request, response) => {
    try {
        const canonicalReadState = await getCanonicalWorldInfoReadState(request);
        if (!canonicalReadState.ok) {
            return sendCanonicalWorldInfoUnavailable(response, canonicalReadState);
        }
        return response.send(listCanonicalWorldInfoBooks(canonicalReadState.db));
    } catch (err) {
        console.error('Error reading World Info directory:', err);
        return response.sendStatus(500);
    }
});

router.post('/get', async (request, response) => {
    if (!request.body?.name) {
        return response.sendStatus(400);
    }

    const canonicalReadState = await getCanonicalWorldInfoReadState(request);
    if (!canonicalReadState.ok) {
        return sendCanonicalWorldInfoUnavailable(response, canonicalReadState);
    }

    const canonicalBook = getCanonicalWorldInfoBook(canonicalReadState.db, request.body.name);
    response.set('X-World-Info-Revision', String(getCanonicalWorldInfoRevision(canonicalReadState.db, request.body.name)));
    return response.send(canonicalBook ?? { entries: {} });
});

router.post('/delete-preflight', async (request, response) => {
    try {
        const worldName = request.body?.name;
        if (!worldName || typeof worldName !== 'string') {
            return response.status(400).send({ error: 'World name is required.' });
        }

        const canonicalReadState = await getCanonicalWorldInfoReadState(request);
        if (canonicalReadState.ok) {
            const normalizedName = normalizeCanonicalWorldInfoName(worldName);
            const book = getCanonicalWorldInfoBook(canonicalReadState.db, normalizedName);
            if (!book) {
                return response.send({ worldInfos: [] });
            }
            // Canonical store returns unchecked JSON; this view describes the existing read.
            const entryCount = (book as { entries?: object } | null)?.entries ? Object.keys((book as { entries: object }).entries).length : 0;
            const boundCharacters = listCanonicalCharactersBoundToWorld(canonicalReadState.db, normalizedName);
            return response.send({
                worldInfos: [{
                    name: worldName,
                    entryCount,
                    boundCharacters,
                    deleteCandidateAvatars: [],
                }],
            });
        }

        return sendCanonicalWorldInfoUnavailable(response, canonicalReadState);
    } catch (error) {
        console.error('World delete preflight error:', error);
        return response.status(500).send({ error: 'Failed to gather world info metadata.' });
    }
});

router.post('/delete', async (request, response) => {
    if (!request.body?.name) {
        return response.sendStatus(400);
    }
    if (typeof request.body.name !== 'string' || normalizeCanonicalWorldInfoName(request.body.name) !== request.body.name) return response.sendStatus(400);

    const worldInfoName = normalizeCanonicalWorldInfoName(request.body.name);
    const canonicalWriteState = await getCanonicalWorldInfoWriteState(request);
    if (canonicalWriteState.ok) {
        const mode = getCanonicalStorageSlice('world_info').getProjectionMode();
        const repairKey = withCanonicalTransaction(canonicalWriteState.db, txn => {
            markCanonicalWorldInfoBookDeleted(txn, { name: worldInfoName, deletedAtMs: Date.now() });
            return recordWorldProjectionIntent(txn, { directories: request.user.directories, name: worldInfoName, action: 'delete', mode });
        });

        try {
            replayWorldProjection(canonicalWriteState.db, { directories: request.user.directories, repairKey });
            invalidateDirectory(request.user.directories.worlds);
        } catch (error) {
            console.warn('World projection failed:', error);
            return response.status(500).send({ error: 'Failed to project canonical World Info file.', repairKey });
        }

        return response.sendStatus(200);
    }

    return sendCanonicalWorldInfoUnavailable(response, canonicalWriteState);
});

router.post('/import', async (request, response) => {
    if (!request.file) return response.sendStatus(400);

    if (sanitize(request.file.originalname) !== request.file.originalname) return response.status(400).send('Unsafe world filename');
    const parsedFilename = path.parse(request.file.originalname);
    if (normalizeCanonicalWorldInfoName(parsedFilename.name) !== parsedFilename.name
        || (parsedFilename.ext.toLowerCase() === '.json' && parsedFilename.ext !== '.json')) {
        return response.status(400).send('Unsafe world filename');
    }
    const filename = `${parsedFilename.name}.json`;

    let fileContents = null;

    if (request.body.convertedData) {
        fileContents = request.body.convertedData;
    } else {
        const pathToUpload = path.join(request.file.destination, request.file.filename);
        fileContents = fs.readFileSync(pathToUpload, 'utf8');
        fs.unlinkSync(pathToUpload);
    }

    let payload;
    try {
        payload = JSON.parse(fileContents);
        if (!('entries' in payload)) {
            throw new Error('File must contain a world info entries list');
        }
    } catch {
        return response.status(400).send('Is not a valid world info file');
    }

    const pathToNewFile = path.join(request.user.directories.worlds, filename);
    const worldName = normalizeCanonicalWorldInfoName(path.parse(pathToNewFile).name);

    if (!worldName) {
        return response.status(400).send('World file must have a name');
    }

    const canonicalWriteState = await getCanonicalWorldInfoWriteState(request);
    if (canonicalWriteState.ok) {
        setImportedWorldInfoPositions(payload.entries);
        const mode = getCanonicalStorageSlice('world_info').getProjectionMode();
        const repairKey = withCanonicalTransaction(canonicalWriteState.db, txn => {
            upsertCanonicalWorldInfoBookInTransaction(txn, { name: worldName, payload });
            return recordWorldProjectionIntent(txn, { directories: request.user.directories, name: worldName, action: 'write', mode });
        });

        try {
            replayWorldProjection(canonicalWriteState.db, { directories: request.user.directories, repairKey });
            invalidateDirectory(request.user.directories.worlds);
        } catch (error) {
            console.warn('World projection failed:', error);
            return response.status(500).send({ error: 'Failed to project canonical World Info file.', repairKey });
        }

        return response.send({ name: worldName });
    }

    return sendCanonicalWorldInfoUnavailable(response, canonicalWriteState);
});

router.post('/edit', coordinateWorkspaceWrite('world', (request: Request) => request.body?.name, async (request: Request, response: Response) => {
    if (!request.body) {
        return response.sendStatus(400);
    }

    if (!request.body.name) {
        return response.status(400).send('World file must have a name');
    }
    if (typeof request.body.name !== 'string' || normalizeCanonicalWorldInfoName(request.body.name) !== request.body.name) return response.sendStatus(400);

    try {
        if (!('entries' in request.body.data)) {
            throw new Error('World info must contain an entries list');
        }
    } catch {
        return response.status(400).send('Is not a valid world info file');
    }

    const worldName = normalizeCanonicalWorldInfoName(request.body.name);
    if (!worldName) {
        return response.status(400).send('World file must have a name');
    }

    const canonicalWriteState = await getCanonicalWorldInfoWriteState(request);
    if (canonicalWriteState.ok) {
        const mode = getCanonicalStorageSlice('world_info').getProjectionMode();
        const result = withCanonicalTransaction(canonicalWriteState.db, txn => {
            const revision = getCanonicalWorldInfoRevision(txn, worldName);
            if (request.body.expectedRevision != null && request.body.expectedRevision !== revision) {
                return { ok: false as const, revision };
            }
            const saved = upsertCanonicalWorldInfoBookInTransaction(txn, { name: worldName, payload: request.body.data });
            const repairKey = recordWorldProjectionIntent(txn, { directories: request.user.directories, name: worldName, action: 'write', mode });
            return { ok: true as const, revision: saved.revision, repairKey };
        });
        if (!result.ok) return response.status(409).send({ error: 'world_info_conflict', revision: result.revision });
        const { repairKey } = result;

        try {
            replayWorldProjection(canonicalWriteState.db, { directories: request.user.directories, repairKey });
            invalidateDirectory(request.user.directories.worlds);
        } catch (error) {
            console.warn('World projection failed:', error);
            return response.status(500).send({ error: 'Failed to project canonical World Info file.', repairKey, committed: true, revision: result.revision });
        }

        return response.send({ ok: true, revision: result.revision });
    }

    return sendCanonicalWorldInfoUnavailable(response, canonicalWriteState);
}));

router.post('/delete-cascade', async (request, response) => {
    try {
        const worlds = request.body?.worlds;
        if (!Array.isArray(worlds) || worlds.length === 0) {
            return response.sendStatus(400);
        }

        const clearReferences = request.body.clear_references === true;
        const directories = request.user.directories;

        const canonicalWriteState = await getCanonicalWorldInfoWriteState(request);
        if (canonicalWriteState.ok) {
            const db = canonicalWriteState.db;
            const characterFlags = getCanonicalStorageSlice('characters').getFeatureFlags();
            let canonicalCharacterWrites = characterFlags.enabled && characterFlags.writes;
            if (clearReferences && canonicalCharacterWrites) {
                try {
                    await ensureCanonicalSliceBackend('characters', directories, getRequestHandle(request));
                } catch (error) {
                    console.warn('Canonical character init failed; world bindings will dangle instead of rewriting files:', error);
                    canonicalCharacterWrites = false;
                }
            }
            for (const worldName of worlds) {
                if (typeof worldName !== 'string' || !worldName.trim()) continue;
                if (normalizeCanonicalWorldInfoName(worldName) !== worldName) return response.sendStatus(400);
                const normalizedName = normalizeCanonicalWorldInfoName(worldName);

                const mode = getCanonicalStorageSlice('world_info').getProjectionMode();
                const repairKey = withCanonicalTransaction(db, txnDb => {
                    if (clearReferences && canonicalCharacterWrites) {
                        for (const { avatar } of listCanonicalCharactersBoundToWorld(txnDb, normalizedName)) {
                            clearCanonicalCharacterWorldBinding(txnDb, { avatarFilename: avatar });
                        }
                    }
                    markCanonicalWorldInfoBookDeleted(txnDb, {
                        name: normalizedName,
                        deletedAtMs: Date.now(),
                    });
                    return recordWorldProjectionIntent(txnDb, { directories, name: normalizedName, action: 'delete', mode });
                });

                if (clearReferences && !canonicalCharacterWrites) {
                    console.warn(`Skipping world binding clear for ${normalizedName}: canonical character writes are unavailable.`);
                }

                try {
                    replayWorldProjection(db, { directories, repairKey });
                } catch (error) {
                    console.warn('World projection failed:', error);
                    return response.status(500).send({ error: 'Failed to project canonical World Info file.', repairKey });
                }
            }

            invalidateDirectory(directories.worlds);
            return response.sendStatus(200);
        }

        return sendCanonicalWorldInfoUnavailable(response, canonicalWriteState);
    } catch (error) {
        console.error('World info cascade delete error:', error);
        return response.status(500).send({ error: 'Failed to cascade-delete world info files.' });
    }
});
