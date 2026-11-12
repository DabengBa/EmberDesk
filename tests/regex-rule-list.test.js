import { describe, expect, jest, test } from '@jest/globals';
import { createRegexListBridge } from '../public/scripts/extensions/regex/regex-list-bridge.js';

function setup() {
    const targets = [{ type: 0 }, { type: 2, apiId: 'openai', name: 'A' }, { type: 1, avatar: 'a.png' }];
    const lists = new Map(targets.map(target => [target, []]));
    lists.set(targets[0], [{ id: 'same', scriptName: 'Global', disabled: false }, { id: 'two', scriptName: 'Second', disabled: false }]);
    lists.set(targets[1], [{ id: 'same', scriptName: 'Preset', disabled: false }]);
    const save = jest.fn(async (rules, type, target) => { lists.set(target, rules); });
    const authorize = jest.fn(async () => {});
    const confirm = jest.fn(async () => true);
    const edit = jest.fn(async () => 'saved');
    const exportScripts = jest.fn();
    const bridge = createRegexListBridge({ capture: type => targets.find(target => target.type === type), read: target => lists.get(target), save, authorize, confirm, edit, exportScripts, afterChange: jest.fn(async () => {}) });
    bridge.refresh();
    const ref = type => ({ groupKey: bridge.getSnapshot().groups.find(group => group.type === type).key, id: 'same' });
    return { bridge, targets, lists, save, authorize, confirm, edit, exportScripts, ref };
}

describe('React Regex list adapter', () => {
    test('scoped refs with duplicate IDs only change the requested scope and bulk does not authorize', async () => {
        const s = setup();
        await s.bridge.execute({ kind: 'enable', refs: [s.ref(2)], enabled: false });
        expect(s.lists.get(s.targets[1])[0].disabled).toBe(true);
        expect(s.lists.get(s.targets[0])[0].disabled).toBe(false);
        expect(s.authorize).not.toHaveBeenCalled();
        await s.bridge.execute({ kind: 'enable', refs: [s.ref(2)], enabled: true, authorize: true });
        expect(s.authorize).toHaveBeenCalledWith(s.targets[1]);
    });
    test('reorders by IDs, rejects stale orders and publishes failures', async () => {
        const s = setup();
        await s.bridge.execute({ kind: 'reorder', groupKey: s.ref(0).groupKey, ids: ['two', 'same'] });
        expect(s.lists.get(s.targets[0]).map(rule => rule.id)).toEqual(['two', 'same']);
        await expect(s.bridge.execute({ kind: 'reorder', groupKey: s.ref(0).groupKey, ids: ['same'] })).rejects.toThrow();
        s.save.mockRejectedValueOnce(new Error('network'));
        await expect(s.bridge.execute({ kind: 'enable', refs: [s.ref(0)], enabled: false })).rejects.toThrow('network');
    });
    test('captures targets before confirmation and reads live lists after it', async () => {
        const s = setup();
        s.confirm.mockImplementationOnce(async () => {
            s.lists.get(s.targets[0]).push({ id: 'new', scriptName: 'Concurrent' });
            s.targets[2] = { type: 1, avatar: 'b.png' };
            s.lists.set(s.targets[2], []);
            s.bridge.refresh();
            return true;
        });
        const originalTarget = s.targets[2];
        await s.bridge.execute({ kind: 'move', refs: [s.ref(0)], toType: 1 });
        expect(s.lists.get(originalTarget).map(rule => rule.id)).toEqual(['same']);
        expect(s.lists.get(s.targets[2])).toEqual([]);
        expect(s.lists.get(s.targets[0]).map(rule => rule.id)).toEqual(['two', 'new']);
    });
    test('reads source again after destination save so concurrent additions survive', async () => {
        const s = setup();
        s.save.mockImplementation(async (rules, type, target) => {
            s.lists.set(target, rules);
            if (type === 1) s.lists.get(s.targets[0]).push({ id: 'new' });
        });
        await s.bridge.execute({ kind: 'move', refs: [s.ref(0)], toType: 1 });
        expect(s.lists.get(s.targets[0]).map(rule => rule.id)).toEqual(['two', 'new']);
    });
    test('rejects destination collisions and retry after destination succeeded/source failed without duplicating', async () => {
        const s = setup();
        await expect(s.bridge.execute({ kind: 'move', refs: [s.ref(0)], toType: 2 })).rejects.toThrow(/already exists/);
        expect(s.save).not.toHaveBeenCalled();
        s.save.mockImplementation(async (rules, type, target) => {
            if (type === 0) throw new Error('source failed');
            s.lists.set(target, rules);
        });
        await expect(s.bridge.execute({ kind: 'move', refs: [s.ref(0)], toType: 1 })).rejects.toThrow('source failed');
        await expect(s.bridge.execute({ kind: 'move', refs: [s.ref(0)], toType: 1 })).rejects.toThrow(/already exists/);
        expect(s.lists.get(s.targets[2])).toHaveLength(1);
    });
    test('awaits authorization and rejects authorization failure after rule persistence', async () => {
        const s = setup();
        s.authorize.mockRejectedValueOnce(new Error('authorization failed'));
        await expect(s.bridge.execute({ kind: 'enable', refs: [s.ref(2)], enabled: false, authorize: true })).rejects.toThrow('authorization failed');
        expect(s.lists.get(s.targets[1])[0].disabled).toBe(true);
    });
    test('tags a failed write with the failed stage and bound target', async () => {
        const s = setup();
        s.authorize.mockRejectedValueOnce(new Error('authorization failed'));
        const failure = await s.bridge.execute({ kind: 'enable', refs: [s.ref(2)], enabled: false, authorize: true }).catch(error => error);
        expect(failure).toMatchObject({ stage: 'authorize', groupKey: s.ref(2).groupKey });
        s.save.mockRejectedValueOnce(new Error('save failed'));
        const saveFailure = await s.bridge.execute({ kind: 'enable', refs: [s.ref(0)], enabled: false }).catch(error => error);
        expect(saveFailure).toMatchObject({ stage: 'save', groupKey: s.ref(0).groupKey });
    });
    test('keeps a concurrently mutated source instead of deleting the newer change', async () => {
        const s = setup();
        s.save.mockImplementation(async (rules, type, target) => {
            if (type === 1) {
                // An outside controller edits the same rule while the destination
                // write is in flight — deleting the source would lose that edit.
                s.lists.get(s.targets[0]).find(rule => rule.id === 'same').scriptName = 'Changed outside';
            }
            s.lists.set(target, rules);
        });
        await expect(s.bridge.execute({ kind: 'move', refs: [s.ref(0)], toType: 1 })).rejects.toThrow(/changed while moving/);
        expect(s.lists.get(s.targets[0]).map(rule => rule.id)).toEqual(['same', 'two']);
        expect(s.lists.get(s.targets[0]).map(rule => rule.scriptName)).toContain('Changed outside');
        // The destination copy is kept; the operation reports the conflict.
        expect(s.lists.get(s.targets[2]).map(rule => rule.id)).toEqual(['same']);
    });
    test('cancel/delete/export/edit retain the exact referenced targets', async () => {
        const s = setup();
        s.confirm.mockResolvedValueOnce(false);
        await expect(s.bridge.execute({ kind: 'delete', refs: [s.ref(0)] })).resolves.toBe('cancelled');
        await s.bridge.execute({ kind: 'export', refs: [s.ref(2)] });
        expect(s.exportScripts.mock.calls[0][0][0].scriptName).toBe('Preset');
        await s.bridge.execute({ kind: 'edit', refs: [s.ref(2)] });
        expect(s.edit).toHaveBeenCalledWith('same', 2, s.targets[1]);
        await s.bridge.execute({ kind: 'delete', refs: [s.ref(2)] });
        expect(s.lists.get(s.targets[1])).toEqual([]);
        expect(s.lists.get(s.targets[0])).toHaveLength(2);
    });
});
