import { describe, expect, jest, test } from '@jest/globals';
import { createSortSaveGuard } from '../public/scripts/character-sort-save-guard.js';

function setup() {
    const listeners = new Set();
    const window = {
        addEventListener: (_, fn) => listeners.add(fn),
        removeEventListener: (_, fn) => listeners.delete(fn),
    };
    const guard = createSortSaveGuard(window);
    return { guard, listeners };
}

describe('character sort save guard', () => {
    test('warns while dirty and removes only its own listener after successful save', () => {
        const { guard, listeners } = setup();
        const other = () => {};
        listeners.add(other);
        guard.changed();
        const event = { preventDefault: jest.fn(), returnValue: undefined };
        [...listeners].find(fn => fn !== other)(event);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.returnValue).toBe(true);
        const save = guard.begin();
        guard.finish(save, 1);
        expect([...listeners]).toEqual([other]);
    });

    test('old saves and failed saves cannot clear a newer change', () => {
        const { guard, listeners } = setup();
        guard.changed();
        const old = guard.begin();
        guard.changed();
        guard.finish(old, 1);
        expect(listeners.size).toBe(1);
        const failed = guard.begin();
        guard.finish(failed);
        expect(listeners.size).toBe(1);
        const retry = guard.begin();
        guard.finish(retry, 2);
        expect(listeners.size).toBe(0);
    });

    test('waits for overlapping requests and uses server revision, not response arrival order', () => {
        const { guard, listeners } = setup();
        const old = guard.begin();
        guard.changed();
        const current = guard.begin();
        guard.finish(current, 2);
        expect(listeners.size).toBe(1);
        guard.finish(old, 1);
        expect(listeners.size).toBe(0);
    });

    test('does not claim success if an older snapshot is the latest server revision', () => {
        const { guard, listeners } = setup();
        const old = guard.begin();
        guard.changed();
        const current = guard.begin();
        guard.finish(current, 1);
        guard.finish(old, 2);
        expect(listeners.size).toBe(1);
    });

    test('an ambiguous legacy overlap keeps the warning until a later isolated save succeeds', () => {
        const { guard, listeners } = setup();
        guard.changed();
        const first = guard.begin();
        const second = guard.begin();
        guard.finish(first, null);
        guard.finish(second, null);
        expect(listeners.size).toBe(1);
        const retry = guard.begin();
        guard.finish(retry, null);
        expect(listeners.size).toBe(0);
    });

    test('a revision-confirmed current save releases without waiting for an obsolete request', () => {
        const { guard, listeners } = setup();
        guard.changed();
        const old = guard.begin(1);
        guard.changed();
        const current = guard.begin(1);
        guard.finish(current, 2);
        expect(listeners.size).toBe(0);
        guard.finish(old, undefined);
        expect(listeners.size).toBe(0);
    });

    test('does not ignore active requests without a provably stale expected revision', () => {
        const { guard, listeners } = setup();
        guard.changed();
        const unknown = guard.begin();
        const current = guard.begin(1);
        guard.finish(current, 2);
        expect(listeners.size).toBe(1);
        guard.finish(unknown, undefined);
        expect(listeners.size).toBe(0);
    });

    test('a request based on the successful revision can still overwrite it', () => {
        const { guard, listeners } = setup();
        guard.changed();
        const current = guard.begin(1);
        const potentialOverwrite = guard.begin(2);
        guard.finish(current, 2);
        expect(listeners.size).toBe(1);
        guard.finish(potentialOverwrite, undefined);
        expect(listeners.size).toBe(0);
    });
});
