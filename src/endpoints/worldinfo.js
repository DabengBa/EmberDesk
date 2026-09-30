import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { invalidateDirectory } from './settings-cache.js';
import { canonicalSqliteManager, withCanonicalTransaction } from '../canonical-sqlite.js';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.js';
import { getPersistedCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.js';
import { recordImportLedgerEntry, removeImportLedgerEntry } from '../canonical-import-ledger.js';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.js';
import { ensureCanonicalSliceBackend } from '../canonical-backend.js';
import {
    getCanonicalWorldInfoBook,
    listCanonicalWorldInfoBooks,
    markCanonicalWorldInfoBookDeleted,
    normalizeCanonicalWorldInfoName,
    recordWorldInfoProjectionRepair,
    upsertCanonicalWorldInfoBook,
} from './world-info-store.js';
import {
    clearCanonicalCharacterWorldBinding,
    listCanonicalCharactersBoundToWorld,
} from './character-store.js';

function getRequestHandle(request) {
    return request.user?.profile?.handle ?? request.user?.handle ?? 'default-user';
}

export async function getCanonicalWorldInfoReadState(request) {
    const worldInfoSlice = getCanonicalStorageSlice('world_info');
    const featureFlags = worldInfoSlice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled', featureFlags };
    }
    await ensureCanonicalSliceBackend('world_info', request.user.directories, getRequestHandle(request));
    if (!featureFlags.reads) {
        return { ok: false, reason: 'canonical_reads_disabled', featureFlags };
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
        return { ok: false, reason: 'canonical_storage_unavailable', featureFlags };
    }

    const migrationStatus = runCanonicalMigrations(db, {
        strict: !!featureFlags.strict,
    });
    if (!migrationStatus.ok) {
        return { ok: false, reason: 'migration_blocked', featureFlags, migrationStatus };
    }

    const auditStatus = getPersistedCanonicalAuditStatus(db, { scope: worldInfoSlice.auditScope });
    if (auditStatus.blocking) {
        return { ok: false, reason: auditStatus.reason ?? 'world_info_audit_blocked', featureFlags, auditStatus };
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
        return { ok: false, reason, featureFlags, auditStatus, rollback };
    }

    return {
        ok: true,
        db,
        featureFlags,
        migrationStatus,
        auditStatus,
        sliceKey: worldInfoSlice.key,
    };
}

async function getCanonicalWorldInfoWriteState(request) {
    const readState = await getCanonicalWorldInfoReadState(request);
    if (!readState.ok) {
        return readState;
    }

    if (!readState.featureFlags.writes) {
        return {
            ...readState,
            ok: false,
            reason: 'canonical_writes_disabled',
        };
    }

    const worldInfoSlice = getCanonicalStorageSlice('world_info');
    const writeBlockers = worldInfoSlice.getRollbackBlockers({
        db: readState.db,
        featureFlags: readState.featureFlags,
        phase: 'writes',
        persistedAuditStatus: readState.auditStatus,
    });
    if (!writeBlockers.ok) {
        const reason = writeBlockers.blockers[0]?.code ?? 'world_info_write_blocked';
        return {
            ...readState,
            ok: false,
            reason,
            rollback: writeBlockers,
        };
    }

    return readState;
}

function writeWorldInfoProjectionFile(directories, worldName, payload, db = null) {
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

function sendCanonicalWorldInfoUnavailable(response, state) {
    return response.status(503).send({
        error: 'canonical_storage_unavailable',
        reason: state?.reason ?? 'canonical_storage_unavailable',
    });
}

function sendWorldInfoProjectionFailure({ response, db, worldName, operation, error }) {
    const normalizedWorldName = normalizeCanonicalWorldInfoName(worldName);
    const repairKey = `world_info:${normalizedWorldName}:${operation}`;
    recordWorldInfoProjectionRepair(db, {
        repairKey,
        worldName: normalizedWorldName,
        reason: 'projection_failed',
        details: { operation },
    });
    console.warn(`Canonical World Info ${operation} projection failed for ${normalizedWorldName}:`, error);
    return response.status(500).send({
        error: 'Failed to project canonical World Info file.',
        repairKey,
    });
}

/**
 * Reads a World Info file and returns its contents
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @param {string} worldInfoName Name of the World Info file
 * @param {boolean} allowDummy If true, returns an empty object if the file doesn't exist
 * @returns {object} World Info file contents
 */
export function readWorldInfoFile(directories, worldInfoName, allowDummy) {
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
            const entryCount = book?.entries ? Object.keys(book.entries).length : 0;
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

    const worldInfoName = normalizeCanonicalWorldInfoName(request.body.name);
    const filename = sanitize(`${worldInfoName}.json`);
    const pathToWorldInfo = path.join(request.user.directories.worlds, filename);

    const canonicalWriteState = await getCanonicalWorldInfoWriteState(request);
    if (canonicalWriteState.ok) {
        markCanonicalWorldInfoBookDeleted(canonicalWriteState.db, {
            name: worldInfoName,
            deletedAtMs: Date.now(),
        });

        try {
            if (fs.existsSync(pathToWorldInfo)) {
                fs.unlinkSync(pathToWorldInfo);
            }
            invalidateDirectory(request.user.directories.worlds);
            removeImportLedgerEntry(canonicalWriteState.db, {
                sliceKey: 'world_info',
                sourcePath: path.relative(request.user.directories.root, pathToWorldInfo),
            });
        } catch (error) {
            return sendWorldInfoProjectionFailure({
                response,
                db: canonicalWriteState.db,
                worldName: worldInfoName,
                operation: 'delete',
                error,
            });
        }

        return response.sendStatus(200);
    }

    return sendCanonicalWorldInfoUnavailable(response, canonicalWriteState);
});

router.post('/import', async (request, response) => {
    if (!request.file) return response.sendStatus(400);

    const filename = `${path.parse(sanitize(request.file.originalname)).name}.json`;

    let fileContents = null;

    if (request.body.convertedData) {
        fileContents = request.body.convertedData;
    } else {
        const pathToUpload = path.join(request.file.destination, request.file.filename);
        fileContents = fs.readFileSync(pathToUpload, 'utf8');
        fs.unlinkSync(pathToUpload);
    }

    try {
        const worldContent = JSON.parse(fileContents);
        if (!('entries' in worldContent)) {
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
        const payload = JSON.parse(fileContents);
        upsertCanonicalWorldInfoBook(canonicalWriteState.db, {
            name: worldName,
            payload,
            nowMs: Date.now(),
        });

        try {
            writeWorldInfoProjectionFile(request.user.directories, worldName, payload, canonicalWriteState.db);
        } catch (error) {
            return sendWorldInfoProjectionFailure({
                response,
                db: canonicalWriteState.db,
                worldName,
                operation: 'import',
                error,
            });
        }

        return response.send({ name: worldName });
    }

    return sendCanonicalWorldInfoUnavailable(response, canonicalWriteState);
});

router.post('/edit', async (request, response) => {
    if (!request.body) {
        return response.sendStatus(400);
    }

    if (!request.body.name) {
        return response.status(400).send('World file must have a name');
    }

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
        upsertCanonicalWorldInfoBook(canonicalWriteState.db, {
            name: worldName,
            payload: request.body.data,
            nowMs: Date.now(),
        });

        try {
            writeWorldInfoProjectionFile(request.user.directories, worldName, request.body.data, canonicalWriteState.db);
        } catch (error) {
            return sendWorldInfoProjectionFailure({
                response,
                db: canonicalWriteState.db,
                worldName,
                operation: 'edit',
                error,
            });
        }

        return response.send({ ok: true });
    }

    return sendCanonicalWorldInfoUnavailable(response, canonicalWriteState);
});

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
                const normalizedName = normalizeCanonicalWorldInfoName(worldName);

                withCanonicalTransaction(db, txnDb => {
                    if (clearReferences && canonicalCharacterWrites) {
                        for (const { avatar } of listCanonicalCharactersBoundToWorld(txnDb, normalizedName)) {
                            clearCanonicalCharacterWorldBinding(txnDb, { avatarFilename: avatar });
                        }
                    }
                    markCanonicalWorldInfoBookDeleted(txnDb, {
                        name: normalizedName,
                        deletedAtMs: Date.now(),
                    });
                });

                if (clearReferences && !canonicalCharacterWrites) {
                    console.warn(`Skipping world binding clear for ${normalizedName}: canonical character writes are unavailable.`);
                }

                const worldPath = path.join(directories.worlds, sanitize(`${normalizedName}.json`));
                try {
                    if (fs.existsSync(worldPath)) {
                        fs.unlinkSync(worldPath);
                    }
                    removeImportLedgerEntry(db, {
                        sliceKey: 'world_info',
                        sourcePath: path.relative(directories.root, worldPath),
                    });
                } catch (error) {
                    return sendWorldInfoProjectionFailure({
                        response,
                        db,
                        worldName: normalizedName,
                        operation: 'delete',
                        error,
                    });
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
