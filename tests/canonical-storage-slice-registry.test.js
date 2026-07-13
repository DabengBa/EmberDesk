import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    buildCanonicalBackupManifest,
    createCanonicalStorageSliceRegistry,
    getCanonicalBackupRestoreReadiness,
    getDefaultCanonicalStorageSliceRegistry,
    listCanonicalStorageSliceKeys,
    MANAGED_FILE_MANIFEST_VERSION,
} from '../src/canonical-storage-slice-registry.js';
import {
    buildCanonicalRollbackBlockers,
    buildCanonicalSliceRollbackBlockers,
    getCanonicalFlagContractStatus,
    getCanonicalSliceFlagContractStatus,
} from '../src/canonical-sqlite-rollout-contract.js';
import { recordProjectionRepair } from '../src/endpoints/character-store.js';
import { recordWorldInfoProjectionRepair } from '../src/endpoints/world-info-store.js';
import { persistCanonicalAuditStatus } from '../src/canonical-sqlite-shadow-import.js';

const tempRoots = [];
const managers = [];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-slice-registry-'));
    tempRoots.push(root);
    return root;
}

function createDirectories(root) {
    const directories = {
        root,
        storage: path.join(root, 'storage'),
        characters: path.join(root, 'characters'),
        chats: path.join(root, 'chats'),
        worlds: path.join(root, 'worlds'),
    };
    for (const directory of Object.values(directories)) {
        if (directory !== root) {
            fs.mkdirSync(directory, { recursive: true });
        }
    }
    return directories;
}

function createManager() {
    const manager = createCanonicalSqliteManager({
        logger: { info() {}, warn() {} },
    });
    managers.push(manager);
    return manager;
}

function openMigratedDb() {
    const root = makeRoot();
    const directories = createDirectories(root);
    const manager = createManager();
    const db = manager.open({
        handle: 'alice',
        directories,
        featureFlags: { enabled: true, strict: false },
    });
    runCanonicalMigrations(db, { nowMs: 1735689600000 });
    return { db, directories };
}

afterEach(() => {
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical storage slice registry', () => {
    test('registers characters and world_info slices with required capabilities', () => {
        const registry = getDefaultCanonicalStorageSliceRegistry();
        expect(listCanonicalStorageSliceKeys(registry)).toEqual(['characters', 'world_info']);

        for (const key of ['characters', 'world_info']) {
            const slice = registry.get(key);
            expect(slice.key).toBe(key);
            expect(typeof slice.auditScope).toBe('string');
            expect(typeof slice.listOpenRepairs).toBe('function');
            expect(typeof slice.getFeatureFlags).toBe('function');
            expect(typeof slice.getMigrationReadiness).toBe('function');
            expect(typeof slice.getRollbackBlockers).toBe('function');
            expect(typeof slice.getBackupManagedPaths).toBe('function');
        }
    });

    test('rejects duplicate slice keys and missing required capabilities', () => {
        const registry = createCanonicalStorageSliceRegistry();
        const base = {
            key: 'settings',
            auditScope: 'settings',
            listOpenRepairs: () => [],
            getFeatureFlags: () => ({ enabled: false }),
            getMigrationReadiness: () => ({ ok: true }),
            getRollbackBlockers: () => ({ ok: true, blockers: [] }),
            getBackupManagedPaths: () => [],
        };

        registry.register(base);
        expect(() => registry.register({ ...base })).toThrow(/duplicate/i);
        expect(() => registry.register({
            key: 'broken',
            auditScope: 'broken',
        })).toThrow(/required/i);
    });

    test('isolates character repair blockers from world_info slice readiness', () => {
        const { db } = openMigratedDb();
        recordProjectionRepair(db, {
            repairKey: 'repair:character',
            repairType: 'character_projection',
            avatarFilename: 'alpha.png',
            reason: 'projection_failed',
            details: { operation: 'create' },
            nowMs: 1735689601111,
        });
        persistCanonicalAuditStatus(db, {
            ok: true,
            handle: 'alice',
            hasDrift: false,
            blocking: false,
            entries: [],
        }, {
            scope: 'world_info',
            auditedAtMs: 1735689602222,
        });

        const characterBlockers = buildCanonicalSliceRollbackBlockers({
            db,
            sliceKey: 'characters',
            featureFlags: {
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                chatStats: false,
                strict: false,
            },
            phase: 'writes',
            persistedAuditStatus: {
                ok: true,
                blocking: false,
                reason: null,
            },
        });
        const worldInfoBlockers = buildCanonicalSliceRollbackBlockers({
            db,
            sliceKey: 'world_info',
            featureFlags: {
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                strict: false,
            },
            phase: 'writes',
            persistedAuditStatus: {
                ok: true,
                blocking: false,
                reason: null,
            },
        });

        expect(characterBlockers.ok).toBe(false);
        expect(characterBlockers.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'open_projection_repairs' }),
        ]));
        expect(worldInfoBlockers.ok).toBe(true);
        expect(worldInfoBlockers.blockers).toEqual([]);
    });

    test('world_info open repairs do not block character-only legacy rollback summary', () => {
        const { db } = openMigratedDb();
        recordWorldInfoProjectionRepair(db, {
            repairKey: 'world_info:Lorebook:edit',
            worldName: 'Lorebook',
            reason: 'projection_failed',
            details: { operation: 'edit' },
            nowMs: 1735689601111,
        });
        persistCanonicalAuditStatus(db, {
            ok: true,
            handle: 'alice',
            hasDrift: false,
            blocking: false,
            entries: [],
        }, {
            auditedAtMs: 1735689602222,
        });

        const characterOnly = buildCanonicalRollbackBlockers({
            db,
            featureFlags: {
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                chatStats: false,
                strict: false,
            },
            phase: 'writes',
            persistedAuditStatus: {
                ok: true,
                blocking: false,
                reason: null,
            },
        });

        expect(characterOnly.ok).toBe(true);
        expect(characterOnly.blockers.map(blocker => blocker.code))
            .not.toContain('open_world_info_projection_repairs');
    });

    test('slice adapters isolate manufactured drift between characters and world_info', () => {
        const { db } = openMigratedDb();
        const registry = getDefaultCanonicalStorageSliceRegistry();
        const characters = registry.get('characters');
        const worldInfo = registry.get('world_info');

        // Character audit blocked; World Info audit clean and no repairs.
        persistCanonicalAuditStatus(db, {
            ok: false,
            handle: 'alice',
            hasDrift: true,
            blocking: true,
            reason: 'audit_drift_blocked',
            entries: [],
        }, {
            scope: characters.auditScope,
            auditedAtMs: 1735689601111,
        });
        persistCanonicalAuditStatus(db, {
            ok: true,
            handle: 'alice',
            hasDrift: false,
            blocking: false,
            entries: [],
        }, {
            scope: worldInfo.auditScope,
            auditedAtMs: 1735689602222,
        });

        const characterFlags = {
            enabled: true,
            shadowImport: true,
            reads: true,
            writes: true,
            chatStats: false,
            strict: false,
        };
        const worldFlags = {
            enabled: true,
            shadowImport: true,
            reads: true,
            writes: true,
            strict: false,
        };

        const characterBlockers = characters.getRollbackBlockers({
            db,
            featureFlags: characterFlags,
            phase: 'reads',
        });
        const worldBlockers = worldInfo.getRollbackBlockers({
            db,
            featureFlags: worldFlags,
            phase: 'reads',
        });

        expect(characterBlockers.ok).toBe(false);
        expect(characterBlockers.blockers.map(b => b.code)).toContain('audit_drift_blocked');
        expect(worldBlockers.ok).toBe(true);

        // Invert: world_info repair open, character clean.
        recordWorldInfoProjectionRepair(db, {
            repairKey: 'world_info:Lorebook:edit',
            worldName: 'Lorebook',
            reason: 'projection_failed',
            details: { operation: 'edit' },
            nowMs: 1735689603333,
        });
        persistCanonicalAuditStatus(db, {
            ok: true,
            handle: 'alice',
            hasDrift: false,
            blocking: false,
            entries: [],
        }, {
            scope: characters.auditScope,
            auditedAtMs: 1735689604444,
        });

        const characterWrites = characters.getRollbackBlockers({
            db,
            featureFlags: characterFlags,
            phase: 'writes',
        });
        const worldWrites = worldInfo.getRollbackBlockers({
            db,
            featureFlags: worldFlags,
            phase: 'writes',
        });

        expect(characterWrites.ok).toBe(true);
        expect(worldWrites.ok).toBe(false);
        expect(worldWrites.blockers.map(b => b.code)).toContain('open_world_info_projection_repairs');
    });

    test('world_info write phase is blocked by open repairs while reads stay clear when audit is clean', () => {
        const { db } = openMigratedDb();
        const worldInfo = getDefaultCanonicalStorageSliceRegistry().get('world_info');
        persistCanonicalAuditStatus(db, {
            ok: true,
            handle: 'alice',
            hasDrift: false,
            blocking: false,
            entries: [],
        }, {
            scope: worldInfo.auditScope,
            auditedAtMs: 1735689601111,
        });
        recordWorldInfoProjectionRepair(db, {
            repairKey: 'world_info:Lorebook:edit',
            worldName: 'Lorebook',
            reason: 'projection_failed',
            details: { operation: 'edit' },
            nowMs: 1735689602222,
        });

        const flags = {
            enabled: true,
            shadowImport: true,
            reads: true,
            writes: true,
            strict: false,
        };
        const reads = worldInfo.getRollbackBlockers({ db, featureFlags: flags, phase: 'reads' });
        const writes = worldInfo.getRollbackBlockers({ db, featureFlags: flags, phase: 'writes' });
        expect(reads.ok).toBe(true);
        expect(writes.ok).toBe(false);
        expect(writes.blockers.map(b => b.code)).toContain('open_world_info_projection_repairs');
    });

    test('reports backup readiness blockers without mutating managed files', () => {
        const { db, directories } = openMigratedDb();
        const before = fs.readdirSync(directories.characters);

        const missingManifest = getCanonicalBackupRestoreReadiness({
            directories,
            db,
            managedFileManifest: null,
        });
        expect(missingManifest.ready).toBe(false);
        expect(missingManifest.mutatesData).toBe(false);
        expect(missingManifest.blockers.map(b => b.code)).toContain('missing_managed_file_manifest');

        const completeManifest = buildCanonicalBackupManifest({
            directories,
            db,
            createdAtMs: 1735689609999,
        });
        expect(completeManifest.managedFileManifestVersion).toBe(MANAGED_FILE_MANIFEST_VERSION);

        const ready = getCanonicalBackupRestoreReadiness({
            directories,
            db,
            managedFileManifest: completeManifest,
        });
        expect(ready.ready).toBe(true);
        expect(ready.blockers).toEqual([]);
        expect(ready.mutatesData).toBe(false);

        // no auto rewrite
        expect(fs.readdirSync(directories.characters)).toEqual(before);
    });

    test('rejects illegal flag combinations through shared phase-gap contract', () => {
        expect(getCanonicalSliceFlagContractStatus({
            enabled: true,
            shadowImport: false,
            reads: true,
            writes: false,
            strict: false,
        })).toEqual(expect.objectContaining({
            ok: false,
            illegalFlags: ['reads'],
            blockingReason: 'illegal_flag_combination:reads',
        }));

        expect(getCanonicalFlagContractStatus({
            enabled: true,
            shadowImport: true,
            reads: true,
            writes: true,
            chatStats: true,
            strict: true,
        })).toEqual(expect.objectContaining({
            ok: true,
            illegalFlags: [],
            blockingReason: null,
        }));
    });
});
