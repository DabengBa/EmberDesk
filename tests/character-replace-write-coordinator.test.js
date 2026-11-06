import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import { runCanonicalMigrations } from '../src/canonical-sqlite-migrations.js';
import * as coordinator from '../src/character-replace-write-coordinator.js';
import {
    acknowledgeReplaceIntent,
    claimReplaceIntent,
    claimWorkspaceWrite,
    closeWorkspaceWriteSession,
    createReplaceIntent,
    createWorkspaceWriteSession,
    fenceReplaceIntent,
    fenceWorkspaceWrite,
    finishReplaceIntent,
    finishWorkspaceWrite,
    getReplaceIntent,
    getWorkspaceWrite,
    interruptWorkspaceWriteSessionOffline,
    listUnacknowledgedReplaceIntents,
    markReplaceIntentReady,
    registerIntentWrites,
    removeSettledWorkspaceWriteDetails,
} from '../src/character-replace-write-coordinator.js';

let db;
let sessionId;
const intent = { avatar: 'alice.png', chat: 'chat-a', world: 'world-a', card: true, chatSelected: true, worldSelected: true };

beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runCanonicalMigrations(db, { strict: true });
    sessionId = createWorkspaceWriteSession(db).sessionId;
});

afterEach(() => db.close());

describe('workspace write completion and replacement fencing', () => {
    test('one operation is executed once and duplicates return its durable result', () => {
        expect(claimWorkspaceWrite(db, { sessionId, operationId: 'save-1', kind: 'chat' })).toMatchObject({ claimed: true, status: 'running' });
        expect(claimWorkspaceWrite(db, { sessionId, operationId: 'save-1', kind: 'card' })).toMatchObject({ claimed: false, status: 'running' });
        finishWorkspaceWrite(db, { sessionId, operationId: 'save-1', outcome: 'committed' });
        expect(claimWorkspaceWrite(db, { sessionId, operationId: 'save-1', kind: 'chat' })).toMatchObject({ claimed: false, status: 'finished', outcome: 'committed' });
        expect(getWorkspaceWrite(db, { sessionId, operationId: 'save-1' })).toMatchObject({ status: 'finished', outcome: 'committed', kind: 'chat' });
    });

    test('a disconnected or duplicated request cannot complete or repeat a running write', async () => {
        let release;
        let writes = 0;
        const barrier = new Promise(resolve => { release = resolve; });
        const params = { sessionId, operationId: 'slow', kind: 'chat' };
        const execute = async () => {
            writes++;
            await barrier;
            return { outcome: 'committed', value: 'saved' };
        };

        const first = coordinator.executeWorkspaceWrite(db, params, execute);
        expect(fenceWorkspaceWrite(db, params)).toMatchObject({ status: 'running' });
        expect(await coordinator.executeWorkspaceWrite(db, params, execute)).toMatchObject({ claimed: false, status: 'running' });
        expect(writes).toBe(1);
        release();
        await expect(first).resolves.toMatchObject({ claimed: true, status: 'finished', outcome: 'committed', value: 'saved' });
        expect(getWorkspaceWrite(db, params)).toMatchObject({ status: 'finished', outcome: 'committed' });
        expect(await coordinator.executeWorkspaceWrite(db, params, execute)).toMatchObject({ claimed: false, status: 'finished', outcome: 'committed' });
        expect(writes).toBe(1);
    });

    test('a late fenced write never invokes the writer', async () => {
        const params = { sessionId, operationId: 'late-execution', kind: 'card' };
        fenceWorkspaceWrite(db, params);
        let called = false;
        const result = await coordinator.executeWorkspaceWrite(db, params, async () => { called = true; });
        expect(result).toMatchObject({ claimed: false, status: 'cancelled' });
        expect(called).toBe(false);
    });

    test('a writer that throws may have committed, so its terminal outcome is unknown', async () => {
        const params = { sessionId, operationId: 'threw', kind: 'world' };
        await expect(coordinator.executeWorkspaceWrite(db, params, async () => { throw new Error('connection failed'); })).rejects.toThrow('connection failed');
        expect(getWorkspaceWrite(db, params)).toMatchObject({ status: 'finished', outcome: 'unknown' });
    });

    test('a terminal persistence failure does not return success and remains running', async () => {
        const params = { sessionId, operationId: 'no-terminal', kind: 'chat' };
        db.exec(`CREATE TRIGGER deny_write_terminal BEFORE UPDATE ON workspace_write_operations
            WHEN NEW.status = 'finished' BEGIN SELECT RAISE(ABORT, 'terminal write failed'); END`);
        await expect(coordinator.executeWorkspaceWrite(db, params, async () => ({ outcome: 'committed', value: 'saved' }))).rejects.toThrow('terminal write failed');
        expect(getWorkspaceWrite(db, params)).toMatchObject({ status: 'running' });
    });

    test('replacement remains running until its actual writer settles and executes only once', async () => {
        const params = { sessionId, intentId: 'slow-replace' };
        createReplaceIntent(db, { ...params, target: intent });
        markReplaceIntentReady(db, params);
        let release;
        let executions = 0;
        const barrier = new Promise(resolve => { release = resolve; });
        const execute = async () => {
            executions++;
            await barrier;
            return { outcome: 'completed', areas: { card: 'committed' }, warnings: [], value: 'replaced' };
        };
        const first = coordinator.executeReplaceIntent(db, params, execute);
        expect(fenceReplaceIntent(db, params)).toMatchObject({ status: 'running' });
        expect(await coordinator.executeReplaceIntent(db, params, execute)).toMatchObject({ claimed: false, status: 'running' });
        release();
        await expect(first).resolves.toMatchObject({ claimed: true, status: 'finished', outcome: 'completed', value: 'replaced' });
        expect(executions).toBe(1);
        expect(getReplaceIntent(db, params).result.areas).toEqual({ card: 'committed' });
    });

    test('an exception during a replacement is recorded as unknown partial', async () => {
        const params = { sessionId, intentId: 'partial' };
        createReplaceIntent(db, { ...params, target: intent });
        markReplaceIntentReady(db, params);
        await expect(coordinator.executeReplaceIntent(db, params, async () => { throw new Error('lost after a commit'); })).rejects.toThrow('lost after a commit');
        expect(getReplaceIntent(db, params)).toMatchObject({ status: 'finished', outcome: 'unknown_partial' });
    });

    test('an unseen operation is fenced; a claimed operation cannot be cancelled while running', () => {
        expect(fenceWorkspaceWrite(db, { sessionId, operationId: 'late' })).toMatchObject({ status: 'cancelled' });
        expect(fenceWorkspaceWrite(db, { sessionId, operationId: 'late' })).toMatchObject({ status: 'cancelled' });
        expect(claimWorkspaceWrite(db, { sessionId, operationId: 'late', kind: 'card' })).toMatchObject({ claimed: false, status: 'cancelled' });

        claimWorkspaceWrite(db, { sessionId, operationId: 'in-flight', kind: 'chat' });
        expect(fenceWorkspaceWrite(db, { sessionId, operationId: 'in-flight' })).toMatchObject({ status: 'running' });
        finishWorkspaceWrite(db, { sessionId, operationId: 'in-flight', outcome: 'unknown' });
        expect(fenceWorkspaceWrite(db, { sessionId, operationId: 'in-flight' })).toMatchObject({ status: 'finished', outcome: 'unknown' });
    });

    test('closing a session rejects new claims without declaring already-running writes complete', () => {
        claimWorkspaceWrite(db, { sessionId, operationId: 'pending', kind: 'card' });
        closeWorkspaceWriteSession(db, { sessionId });
        expect(claimWorkspaceWrite(db, { sessionId, operationId: 'late', kind: 'chat' })).toMatchObject({ claimed: false, status: 'session_closed' });
        expect(getWorkspaceWrite(db, { sessionId, operationId: 'pending' })).toMatchObject({ status: 'running' });
        expect(() => removeSettledWorkspaceWriteDetails(db, { sessionId })).toThrow();
        finishWorkspaceWrite(db, { sessionId, operationId: 'pending', outcome: 'committed' });
        removeSettledWorkspaceWriteDetails(db, { sessionId });
        expect(claimWorkspaceWrite(db, { sessionId, operationId: 'pending', kind: 'card' })).toMatchObject({ claimed: false, status: 'session_closed' });
    });

    test('intent fence wins against late registration and cannot be revived', () => {
        expect(fenceReplaceIntent(db, { sessionId, intentId: 'late-intent' })).toMatchObject({ status: 'cancelled' });
        expect(createReplaceIntent(db, { sessionId, intentId: 'late-intent', target: intent })).toMatchObject({ created: false, status: 'cancelled' });
        expect(claimReplaceIntent(db, { sessionId, intentId: 'late-intent' })).toMatchObject({ claimed: false, status: 'cancelled' });
    });

    test('an intent cannot become ready while registered writes are absent or still running', () => {
        expect(createReplaceIntent(db, { sessionId, intentId: 'replace-1', target: intent })).toMatchObject({ created: true, status: 'preparing' });
        expect(createReplaceIntent(db, { sessionId, intentId: 'replace-1', target: intent })).toMatchObject({ created: false, status: 'preparing' });
        registerIntentWrites(db, { sessionId, intentId: 'replace-1', operationIds: ['old', 'flush'] });
        claimWorkspaceWrite(db, { sessionId, operationId: 'old', kind: 'card' });
        expect(() => markReplaceIntentReady(db, { sessionId, intentId: 'replace-1' })).toThrow();
        finishWorkspaceWrite(db, { sessionId, operationId: 'old', outcome: 'committed' });
        expect(() => markReplaceIntentReady(db, { sessionId, intentId: 'replace-1' })).toThrow();
        fenceWorkspaceWrite(db, { sessionId, operationId: 'flush' });
        expect(markReplaceIntentReady(db, { sessionId, intentId: 'replace-1' })).toMatchObject({ status: 'ready' });
        expect(() => registerIntentWrites(db, { sessionId, intentId: 'replace-1', operationIds: ['another'] })).toThrow();
    });

    test('apply claim and cancellation are mutually exclusive and duplicate apply never executes again', () => {
        createReplaceIntent(db, { sessionId, intentId: 'replace-1', target: intent });
        markReplaceIntentReady(db, { sessionId, intentId: 'replace-1' });
        expect(claimReplaceIntent(db, { sessionId, intentId: 'replace-1' })).toMatchObject({ claimed: true, status: 'running' });
        expect(fenceReplaceIntent(db, { sessionId, intentId: 'replace-1' })).toMatchObject({ status: 'running' });
        expect(claimReplaceIntent(db, { sessionId, intentId: 'replace-1' })).toMatchObject({ claimed: false, status: 'running' });
        finishReplaceIntent(db, { sessionId, intentId: 'replace-1', outcome: 'unknown_partial' });
        expect(claimReplaceIntent(db, { sessionId, intentId: 'replace-1' })).toMatchObject({ claimed: false, status: 'finished', outcome: 'unknown_partial' });
    });

    test('cleanup requires a closed session, no running operations and acknowledged intent', () => {
        createReplaceIntent(db, { sessionId, intentId: 'replace-1', target: intent });
        fenceReplaceIntent(db, { sessionId, intentId: 'replace-1' });
        expect(() => removeSettledWorkspaceWriteDetails(db, { sessionId })).toThrow();
        closeWorkspaceWriteSession(db, { sessionId });
        expect(() => removeSettledWorkspaceWriteDetails(db, { sessionId })).toThrow();
        acknowledgeReplaceIntent(db, { sessionId, intentId: 'replace-1' });
        removeSettledWorkspaceWriteDetails(db, { sessionId });
        expect(getReplaceIntent(db, { sessionId, intentId: 'replace-1' })).toBeNull();
        expect(createReplaceIntent(db, { sessionId, intentId: 'new', target: intent })).toMatchObject({ created: false, status: 'session_closed' });
    });

    test('closing fences registered writes that have not arrived, so a cancelled intent can be acknowledged', () => {
        createReplaceIntent(db, { sessionId, intentId: 'replace-1', target: intent });
        registerIntentWrites(db, { sessionId, intentId: 'replace-1', operationIds: ['never-arrived'] });
        closeWorkspaceWriteSession(db, { sessionId });
        expect(getWorkspaceWrite(db, { sessionId, operationId: 'never-arrived' })).toMatchObject({ status: 'cancelled' });
        expect(acknowledgeReplaceIntent(db, { sessionId, intentId: 'replace-1' })).toMatchObject({ status: 'cancelled', acknowledged: true });
        expect(claimWorkspaceWrite(db, { sessionId, operationId: 'never-arrived', kind: 'chat' })).toMatchObject({ claimed: false, status: 'cancelled' });
    });

    test('unacknowledged intents are discoverable after a page or server restart', () => {
        createReplaceIntent(db, { sessionId, intentId: 'replace-1', target: intent });
        const otherSession = createWorkspaceWriteSession(db).sessionId;
        createReplaceIntent(db, { sessionId: otherSession, intentId: 'replace-2', target: intent });
        fenceReplaceIntent(db, { sessionId: otherSession, intentId: 'replace-2' });
        acknowledgeReplaceIntent(db, { sessionId: otherSession, intentId: 'replace-2' });
        expect(listUnacknowledgedReplaceIntents(db)).toEqual([
            expect.objectContaining({ sessionId, intentId: 'replace-1', status: 'preparing', target: intent }),
        ]);
    });

    test('duplicate registration cannot change an intent target or persist message contents', () => {
        createReplaceIntent(db, { sessionId, intentId: 'replace-1', target: { ...intent, contents: 'secret message' } });
        expect(() => createReplaceIntent(db, { sessionId, intentId: 'replace-1', target: { ...intent, avatar: 'other.png' } })).toThrow();
        markReplaceIntentReady(db, { sessionId, intentId: 'replace-1' });
        claimReplaceIntent(db, { sessionId, intentId: 'replace-1' });
        finishReplaceIntent(db, {
            sessionId,
            intentId: 'replace-1',
            outcome: 'completed',
            areas: { card: 'committed', chat: 'unknown', contents: 'secret message' },
            warnings: ['card_projection_failed'],
        });
        const stored = db.prepare('SELECT target_json, result_json FROM character_replace_intents WHERE intent_id = ?').get('replace-1');
        expect(JSON.stringify(stored)).not.toContain('secret message');
        expect(getReplaceIntent(db, { sessionId, intentId: 'replace-1' }).result).toEqual({
            areas: { card: 'committed', chat: 'unknown' }, warnings: ['card_projection_failed'],
        });
    });

    test('offline interruption preserves uncertainty and does not happen merely by reopening the database', () => {
        createReplaceIntent(db, { sessionId, intentId: 'replace-1', target: intent });
        markReplaceIntentReady(db, { sessionId, intentId: 'replace-1' });
        claimReplaceIntent(db, { sessionId, intentId: 'replace-1' });
        claimWorkspaceWrite(db, { sessionId, operationId: 'pending', kind: 'world' });
        runCanonicalMigrations(db, { strict: true });
        expect(getReplaceIntent(db, { sessionId, intentId: 'replace-1' })).toMatchObject({ status: 'running' });
        interruptWorkspaceWriteSessionOffline(db, { sessionId });
        expect(getReplaceIntent(db, { sessionId, intentId: 'replace-1' })).toMatchObject({ status: 'interrupted', outcome: 'unknown_partial' });
        expect(getWorkspaceWrite(db, { sessionId, operationId: 'pending' })).toMatchObject({ status: 'interrupted', outcome: 'unknown' });
        expect(claimWorkspaceWrite(db, { sessionId, operationId: 'late', kind: 'world' })).toMatchObject({ claimed: false, status: 'session_closed' });
    });

    test('operation IDs are isolated per session', () => {
        const otherSession = createWorkspaceWriteSession(db).sessionId;
        fenceWorkspaceWrite(db, { sessionId, operationId: 'shared-id' });
        expect(claimWorkspaceWrite(db, { sessionId: otherSession, operationId: 'shared-id', kind: 'card' })).toMatchObject({ claimed: true, status: 'running' });
    });
});
