import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import sanitize from 'sanitize-filename';
import _ from 'lodash';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { tryParse } from '../util.js';
import { invalidateDirectory } from './settings-cache.js';
import { read, write } from '../character-card-parser.js';
import { canonicalSqliteManager } from '../canonical-sqlite.js';
import { runCanonicalMigrations } from '../canonical-sqlite-migrations.js';
import { getPersistedCanonicalAuditStatus, invalidateCanonicalAuditStatus } from '../canonical-sqlite-shadow-import.js';
import { getCanonicalSqliteFeatureFlags } from '../storage-feature-flags.js';
import { WORLD_INFO_AUDIT_SCOPE } from '../canonical-world-info-shadow-import.js';
import { getCanonicalStorageSlice } from '../canonical-storage-slice-registry.js';
import {
    getCanonicalWorldInfoBook,
    listCanonicalWorldInfoBooks,
    markCanonicalWorldInfoBookDeleted,
    normalizeCanonicalWorldInfoName,
    recordWorldInfoProjectionRepair,
    upsertCanonicalWorldInfoBook,
} from './world-info-store.js';

function getRequestHandle(request) {
    return request.user?.profile?.handle ?? request.user?.handle ?? 'default-user';
}

function getCanonicalWorldInfoReadState(request) {
    const worldInfoSlice = getCanonicalStorageSlice('world_info');
    const featureFlags = worldInfoSlice.getFeatureFlags();
    if (!featureFlags.enabled) {
        return { ok: false, reason: 'canonical_storage_disabled', featureFlags };
    }
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
        if (featureFlags.strict) {
            throw new Error(migrationStatus.blockedReason);
        }
        return { ok: false, reason: 'migration_blocked', featureFlags, migrationStatus };
    }

    const auditStatus = getPersistedCanonicalAuditStatus(db, { scope: worldInfoSlice.auditScope });
    if (auditStatus.blocking) {
        if (featureFlags.strict) {
            throw new Error(`Canonical World Info reads blocked: ${auditStatus.reason}`);
        }
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
        if (featureFlags.strict) {
            throw new Error(`Canonical World Info reads blocked: ${reason}`);
        }
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

function getCanonicalWorldInfoWriteState(request) {
    const readState = getCanonicalWorldInfoReadState(request);
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
        if (readState.featureFlags.strict) {
            throw new Error(`Canonical World Info writes blocked: ${reason}`);
        }
        return {
            ...readState,
            ok: false,
            reason,
            rollback: writeBlockers,
        };
    }

    return readState;
}

function writeWorldInfoProjectionFile(directories, worldName, payload) {
    const filename = `${normalizeCanonicalWorldInfoName(worldName)}.json`;
    const pathToFile = path.join(directories.worlds, filename);
    writeFileAtomicSync(pathToFile, JSON.stringify(payload, null, 4));
    invalidateDirectory(directories.worlds);
}

function canReadCanonicalFeatureFlags() {
    if (globalThis.COMMAND_LINE_ARGS != null) {
        return true;
    }

    return Object.keys(process.env).some(key => key.startsWith('EMBERDESK_FEATURES_STORAGE_CANONICALSQLITE_'));
}

function invalidateWorldInfoAuditAfterFileWrite(request, operation) {
    if (!canReadCanonicalFeatureFlags()) {
        return;
    }

    const featureFlags = getCanonicalSqliteFeatureFlags();
    if (!featureFlags.enabled) {
        return;
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
        return;
    }

    const migrationStatus = runCanonicalMigrations(db, {
        strict: !!featureFlags.strict,
    });
    if (!migrationStatus.ok) {
        if (featureFlags.strict) {
            throw new Error(migrationStatus.blockedReason);
        }
        return;
    }

    invalidateCanonicalAuditStatus(db, {
        scope: WORLD_INFO_AUDIT_SCOPE,
        handle: getRequestHandle(request),
        reason: 'audit_stale_after_world_info_file_write',
        source: `worldinfo:${operation}`,
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

/**
 * Scans compatibility PNG cards and returns their current World Info bindings.
 *
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @returns {{
 *   worldNameToCharacters: Map<string, Array<{ avatar: string, name: string }>>,
 *   avatarToWorldName: Map<string, string>,
 * }} Characters grouped by bound world plus a direct avatar lookup map
 */
export function scanCharacterWorldBindingsFromFiles(directories) {
    const emptyResult = {
        worldNameToCharacters: new Map(),
        avatarToWorldName: new Map(),
    };

    if (!directories?.characters) {
        return emptyResult;
    }

    let files = [];
    try {
        files = fs.readdirSync(directories.characters, { withFileTypes: true });
    } catch {
        return emptyResult;
    }

    const worldNameToCharacters = new Map();
    const avatarToWorldName = new Map();
    for (const file of files) {
        if (!file.isFile() || path.extname(file.name).toLowerCase() !== '.png') {
            continue;
        }

        try {
            const avatar = file.name;
            const imageBuffer = fs.readFileSync(path.join(directories.characters, avatar));
            const card = JSON.parse(read(imageBuffer));
            const boundWorld = card?.data?.extensions?.world ?? card?.world;
            if (typeof boundWorld === 'string' && boundWorld.trim()) {
                const characterInfo = {
                    avatar,
                    name: card?.data?.name ?? card?.name ?? avatar,
                };
                avatarToWorldName.set(avatar, boundWorld);
                if (!worldNameToCharacters.has(boundWorld)) {
                    worldNameToCharacters.set(boundWorld, []);
                }
                worldNameToCharacters.get(boundWorld).push(characterInfo);
            }
        } catch {
            // Skip unreadable character cards. Delete preflight must remain best-effort.
        }
    }

    return {
        worldNameToCharacters,
        avatarToWorldName,
    };
}

/**
 * Finds character cards whose World Info binding matches the given name by
 * scanning the compatibility PNG files directly.
 *
 * @param {import('../users.js').UserDirectoryList} directories User directories
 * @param {string} worldName World Info name to match
 * @returns {Array<{ avatar: string, name: string }>} Characters bound to this world
 */
export function findCharactersBoundToWorldFromFiles(directories, worldName) {
    if (!worldName) {
        return [];
    }

    return scanCharacterWorldBindingsFromFiles(directories).worldNameToCharacters.get(worldName) ?? [];
}

export const router = express.Router();

router.post('/list', async (request, response) => {
    try {
        const canonicalReadState = getCanonicalWorldInfoReadState(request);
        if (canonicalReadState.ok) {
            return response.send(listCanonicalWorldInfoBooks(canonicalReadState.db));
        }

        const data = [];
        const jsonFiles = (await fs.promises.readdir(request.user.directories.worlds, { withFileTypes: true }))
            .filter((file) => file.isFile() && path.extname(file.name).toLowerCase() === '.json')
            .sort((a, b) => a.name.localeCompare(b.name));

        for (const file of jsonFiles) {
            try {
                const filePath = path.join(request.user.directories.worlds, file.name);
                const fileContents = await fs.promises.readFile(filePath, 'utf8');
                const fileContentsParsed = tryParse(fileContents) || {};
                const fileExtensions = fileContentsParsed?.extensions || {};
                const fileNameWithoutExt = path.parse(file.name).name;
                const fileData = {
                    file_id: fileNameWithoutExt,
                    name: fileContentsParsed?.name || fileNameWithoutExt,
                    extensions: _.isObjectLike(fileExtensions) ? fileExtensions : {},
                };
                data.push(fileData);
            } catch (err) {
                console.warn(`Error reading or parsing World Info file ${file.name}:`, err);
            }
        }

        return response.send(data);
    } catch (err) {
        console.error('Error reading World Info directory:', err);
        return response.sendStatus(500);
    }
});

router.post('/get', (request, response) => {
    if (!request.body?.name) {
        return response.sendStatus(400);
    }

    const canonicalReadState = getCanonicalWorldInfoReadState(request);
    if (canonicalReadState.ok) {
        const canonicalBook = getCanonicalWorldInfoBook(canonicalReadState.db, request.body.name);
        if (canonicalBook) {
            return response.send(canonicalBook);
        }
    }

    const file = readWorldInfoFile(request.user.directories, request.body.name, true);

    return response.send(file);
});

router.post('/delete-preflight', (request, response) => {
    try {
        const worldName = request.body?.name;
        if (!worldName || typeof worldName !== 'string') {
            return response.status(400).send({ error: 'World name is required.' });
        }

        const directories = request.user.directories;
        const worldFilename = sanitize(`${worldName}.json`);
        const worldPath = path.join(directories.worlds, worldFilename);

        if (!fs.existsSync(worldPath)) {
            return response.send({ worldInfos: [] });
        }

        let entryCount = 0;
        try {
            const worldData = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
            entryCount = worldData.entries ? Object.keys(worldData.entries).length : 0;
        } catch {
            // If we can't parse, still show with 0 entries
        }

        const boundCharacters = findCharactersBoundToWorldFromFiles(directories, worldName);

        return response.send({
            worldInfos: [{
                name: worldName,
                entryCount,
                boundCharacters,
                deleteCandidateAvatars: [],
            }],
        });
    } catch (error) {
        console.error('World delete preflight error:', error);
        return response.status(500).send({ error: 'Failed to gather world info metadata.' });
    }
});

router.post('/delete', (request, response) => {
    if (!request.body?.name) {
        return response.sendStatus(400);
    }

    const worldInfoName = normalizeCanonicalWorldInfoName(request.body.name);
    const filename = sanitize(`${worldInfoName}.json`);
    const pathToWorldInfo = path.join(request.user.directories.worlds, filename);

    const canonicalWriteState = getCanonicalWorldInfoWriteState(request);
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

    if (!fs.existsSync(pathToWorldInfo)) {
        throw new Error(`World info file ${filename} doesn't exist.`);
    }

    fs.unlinkSync(pathToWorldInfo);
    invalidateDirectory(request.user.directories.worlds);
    invalidateWorldInfoAuditAfterFileWrite(request, 'delete');

    return response.sendStatus(200);
});

router.post('/import', (request, response) => {
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
    } catch (err) {
        return response.status(400).send('Is not a valid world info file');
    }

    const pathToNewFile = path.join(request.user.directories.worlds, filename);
    const worldName = normalizeCanonicalWorldInfoName(path.parse(pathToNewFile).name);

    if (!worldName) {
        return response.status(400).send('World file must have a name');
    }

    const canonicalWriteState = getCanonicalWorldInfoWriteState(request);
    if (canonicalWriteState.ok) {
        const payload = JSON.parse(fileContents);
        upsertCanonicalWorldInfoBook(canonicalWriteState.db, {
            name: worldName,
            payload,
            nowMs: Date.now(),
        });

        try {
            writeWorldInfoProjectionFile(request.user.directories, worldName, payload);
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

    writeFileAtomicSync(pathToNewFile, fileContents);
    invalidateDirectory(request.user.directories.worlds);
    invalidateWorldInfoAuditAfterFileWrite(request, 'import');
    return response.send({ name: worldName });
});

router.post('/edit', (request, response) => {
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
    } catch (err) {
        return response.status(400).send('Is not a valid world info file');
    }

    const worldName = normalizeCanonicalWorldInfoName(request.body.name);
    if (!worldName) {
        return response.status(400).send('World file must have a name');
    }

    const filename = `${worldName}.json`;
    const pathToFile = path.join(request.user.directories.worlds, filename);

    const canonicalWriteState = getCanonicalWorldInfoWriteState(request);
    if (canonicalWriteState.ok) {
        upsertCanonicalWorldInfoBook(canonicalWriteState.db, {
            name: worldName,
            payload: request.body.data,
            nowMs: Date.now(),
        });

        try {
            writeWorldInfoProjectionFile(request.user.directories, worldName, request.body.data);
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

    writeFileAtomicSync(pathToFile, JSON.stringify(request.body.data, null, 4));
    invalidateDirectory(request.user.directories.worlds);
    invalidateWorldInfoAuditAfterFileWrite(request, 'edit');

    return response.send({ ok: true });
});

router.post('/delete-cascade', async (request, response) => {
    try {
        const worlds = request.body?.worlds;
        if (!Array.isArray(worlds) || worlds.length === 0) {
            return response.sendStatus(400);
        }

        const clearReferences = request.body.clear_references === true;
        const directories = request.user.directories;

        for (const worldName of worlds) {
            if (typeof worldName !== 'string' || !worldName.trim()) continue;

            if (clearReferences) {
                const boundCharacters = findCharactersBoundToWorldFromFiles(directories, worldName);
                for (const { avatar } of boundCharacters) {
                    const charPath = path.join(directories.characters, avatar);
                    if (!fs.existsSync(charPath)) continue;

                    try {
                        const imageBuffer = fs.readFileSync(charPath);
                        const jsonString = read(imageBuffer);
                        const card = JSON.parse(jsonString);
                        if ((card?.data?.extensions?.world ?? card?.world) === worldName) {
                            if (card?.data?.extensions) {
                                card.data.extensions.world = '';
                            } else {
                                card.world = '';
                            }
                            const newBuffer = write(imageBuffer, JSON.stringify(card));
                            writeFileAtomicSync(charPath, newBuffer);
                        }
                    } catch {
                        // Skip characters that can't be updated
                    }
                }
            }

            const worldFilename = sanitize(`${worldName}.json`);
            const worldPath = path.join(directories.worlds, worldFilename);
            if (fs.existsSync(worldPath)) {
                fs.unlinkSync(worldPath);
            }
        }

        invalidateDirectory(directories.worlds);
        invalidateWorldInfoAuditAfterFileWrite(request, 'delete_cascade');
        return response.sendStatus(200);
    } catch (error) {
        console.error('World info cascade delete error:', error);
        return response.status(500).send({ error: 'Failed to cascade-delete world info files.' });
    }
});
