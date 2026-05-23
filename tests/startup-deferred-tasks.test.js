import { describe, expect, test } from '@jest/globals';

import { createSingleFlightTask } from '../public/scripts/startup-helpers.js';

describe('createSingleFlightTask', () => {
    test('should reuse the same in-flight promise and cache the settled value', async () => {
        let calls = 0;
        let release;
        const gate = new Promise(resolve => {
            release = resolve;
        });

        const task = createSingleFlightTask(async () => {
            calls++;
            await gate;
            return `value-${calls}`;
        });

        const first = task.ensure();
        const second = task.ensure();

        expect(first).toBe(second);
        expect(task.isPending()).toBe(true);

        release();

        await expect(first).resolves.toBe('value-1');
        await expect(task.ensure()).resolves.toBe('value-1');
        expect(calls).toBe(1);

        await expect(task.refresh()).resolves.toBe('value-2');
        expect(calls).toBe(2);
    });

    test('should allow retries after a failed attempt', async () => {
        let shouldFail = true;

        const task = createSingleFlightTask(async () => {
            if (shouldFail) {
                shouldFail = false;
                throw new Error('boom');
            }

            return 'ok';
        });

        await expect(task.ensure()).rejects.toThrow('boom');
        expect(task.isComplete()).toBe(false);
        await expect(task.ensure()).resolves.toBe('ok');
        expect(task.isComplete()).toBe(true);
    });

    test('should queue a fresh run when refresh is requested during an in-flight run', async () => {
        let calls = 0;
        let releaseFirstRun;
        const firstRunGate = new Promise(resolve => {
            releaseFirstRun = resolve;
        });

        const task = createSingleFlightTask(async () => {
            calls++;
            if (calls === 1) {
                await firstRunGate;
            }

            return `value-${calls}`;
        });

        const first = task.ensure();
        const refreshed = task.refresh();

        expect(refreshed).not.toBe(first);

        releaseFirstRun();

        await expect(first).resolves.toBe('value-1');
        await expect(refreshed).resolves.toBe('value-2');
        expect(calls).toBe(2);
    });

    test('should clear the cached value when reset is called after completion', async () => {
        let calls = 0;

        const task = createSingleFlightTask(async () => {
            calls++;
            return `value-${calls}`;
        });

        await expect(task.ensure()).resolves.toBe('value-1');
        task.reset();
        await expect(task.ensure()).resolves.toBe('value-2');
        expect(calls).toBe(2);
    });
});
