import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from '@jest/globals';

import { createCanonicalSqliteManager } from '../src/canonical-sqlite.js';
import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import {
    buildCanonicalRollbackBlockers,
    getCanonicalFlagContractStatus,
    listOpenProjectionRepairs,
} from '../src/canonical-sqlite-rollout-contract.js';
import { recordProjectionRepair, resolveProjectionRepair } from '../src/endpoints/character-store.js';

const tempRoots = [];
const managers = [];

function makeRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-rollout-contract-'));
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

afterEach(() => {
    for (const manager of managers.splice(0, managers.length)) {
        manager.dispose();
    }
    for (const root of tempRoots.splice(0, tempRoots.length)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('canonical sqlite rollout contract', () => {
    test('rejects illegal flag combinations that skip earlier phases', () => {
        expect(getCanonicalFlagContractStatus({
            enabled: true,
            shadowImport: false,
            reads: true,
            writes: false,
            chatStats: false,
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

    test('lists only unresolved projection repairs', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });

        recordProjectionRepair(db, {
            repairKey: 'repair:open',
            repairType: 'character_projection',
            avatarFilename: 'alpha.png',
            reason: 'projection_failed',
            details: { operation: 'create' },
            nowMs: 1735689601111,
        });
        recordProjectionRepair(db, {
            repairKey: 'repair:resolved',
            repairType: 'character_projection',
            avatarFilename: 'beta.png',
            reason: 'projection_failed',
            details: { operation: 'delete' },
            nowMs: 1735689602222,
        });
        resolveProjectionRepair(db, {
            repairKey: 'repair:resolved',
            resolvedAtMs: 1735689603333,
        });

        expect(listOpenProjectionRepairs(db)).toEqual([
            expect.objectContaining({
                repairKey: 'repair:open',
                avatarFilename: 'alpha.png',
                details: { operation: 'create' },
            }),
        ]);
    });

    test('blocks write rollback when audit is blocking or open repairs remain', () => {
        const root = makeRoot();
        const directories = createDirectories(root);
        const manager = createManager();
        const db = manager.open({
            handle: 'alice',
            directories,
            featureFlags: { enabled: true, strict: false },
        });
        runCanonicalMigrations(db, { nowMs: 1735689600000 });
        recordProjectionRepair(db, {
            repairKey: 'repair:open',
            repairType: 'character_projection',
            avatarFilename: 'alpha.png',
            reason: 'projection_failed',
            details: { operation: 'rename' },
            nowMs: 1735689601111,
        });

        const blocked = buildCanonicalRollbackBlockers({
            db,
            featureFlags: {
                enabled: true,
                shadowImport: true,
                reads: true,
                writes: true,
                chatStats: false,
                strict: false,
            },
            persistedAuditStatus: {
                ok: false,
                blocking: true,
                reason: 'projection_repair_pending',
            },
            phase: 'writes',
        });

        expect(blocked).toEqual(expect.objectContaining({
            ok: false,
            blockers: expect.arrayContaining([
                expect.objectContaining({ code: 'projection_repair_pending' }),
                expect.objectContaining({ code: 'open_projection_repairs' }),
            ]),
        }));
    });
});
