import { expect, jest, test } from '@jest/globals';
import { createRegexImportController } from '../public/scripts/extensions/regex/regex-import-controller.js';

// Unit lane: mocked dependencies, no real server or test files; lane owns
// isolated data/tmp roots, caller cleans them. Unit budget: 10 seconds.
function setup(text) {
    const target = { type: 1, avatar: 'alice.png' };
    const list = [];
    let sequence = 0;
    const deps = {
        getFileText: jest.fn(async () => text), uuid: jest.fn(() => `new-${++sequence}`),
        captureTarget: jest.fn(() => target), getScriptsForTarget: jest.fn(() => list),
        saveScriptsByType: jest.fn(async () => {}), authorizeRegexTarget: jest.fn(async () => {}),
    };
    return { ...createRegexImportController(deps), deps, target, list };
}

test('single object gets new id and save then authorization of captured target', async () => {
    const s = setup('{"id":"old","scriptName":"A"}');
    const file = {};
    await expect(s.importRegexFile(file, 1)).resolves.toEqual({ imported: 1 });
    expect(s.deps.getFileText).toHaveBeenCalledWith(file);
    expect(s.list).toEqual([{ id: 'new-1', scriptName: 'A' }]);
    expect(s.deps.captureTarget.mock.invocationCallOrder[0]).toBeLessThan(s.deps.getFileText.mock.invocationCallOrder[0]);
    expect(s.deps.saveScriptsByType).toHaveBeenCalledWith(s.list, 1, s.target);
    expect(s.deps.saveScriptsByType.mock.invocationCallOrder[0]).toBeLessThan(s.deps.authorizeRegexTarget.mock.invocationCallOrder[0]);
    expect(s.deps.authorizeRegexTarget).toHaveBeenCalledWith(s.target);
});

test('array shares given target, obtains a fresh live list and UUID per item', async () => {
    const s = setup('[{"scriptName":"A","id":"x"},{"scriptName":"B","id":"y"}]');
    await expect(s.importRegexFile({}, 1, { target: s.target })).resolves.toEqual({ imported: 2 });
    expect(s.list.map(x => x.id)).toEqual(['new-1', 'new-2']);
    expect(s.deps.captureTarget).not.toHaveBeenCalled();
    expect(s.deps.getScriptsForTarget).toHaveBeenCalledTimes(2);
    expect(s.deps.saveScriptsByType).toHaveBeenCalledTimes(2);
    expect(s.deps.authorizeRegexTarget).toHaveBeenCalledTimes(2);
});

test('array without a supplied target captures once for all items', async () => {
    const s = setup('[{"scriptName":"A"},{"scriptName":"B"}]');
    await s.importRegexFile({}, 1);
    expect(s.deps.captureTarget).toHaveBeenCalledTimes(1);
    expect(s.deps.saveScriptsByType).toHaveBeenNthCalledWith(2, s.list, 1, s.target);
});

test('parse and invalid name failures have correct stages', async () => {
    const malformed = setup('{');
    await expect(malformed.importRegexFile({}, 1)).rejects.toMatchObject({ stage: 'parse' });
    const invalid = setup('[{"scriptName":"A"},{}]');
    await expect(invalid.importRegexFile({}, 1)).rejects.toMatchObject({ stage: 'validate' });
    expect(invalid.list).toEqual([{ id: 'new-1', scriptName: 'A' }]);
    expect(invalid.deps.saveScriptsByType).toHaveBeenCalledTimes(1);
});

test.each(['save', 'authorize'])('%s failure is tagged and retains earlier successful item', async stage => {
    const s = setup('[{"scriptName":"A"},{"scriptName":"B"},{"scriptName":"C"}]');
    s.deps[stage === 'save' ? 'saveScriptsByType' : 'authorizeRegexTarget']
        .mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));
    await expect(s.importRegexFile({}, 1)).rejects.toMatchObject({ stage, itemName: 'B', message: 'offline' });
    expect(s.list.map(x => x.scriptName)).toEqual(['A', 'B']);
    expect(s.deps.uuid).toHaveBeenCalledTimes(2);
});

test('an explicitly captured target survives a switch while file reading is pending', async () => {
    const s = setup('');
    let finish;
    s.deps.getFileText.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = s.importRegexFile({}, 1, { target: s.target });
    s.deps.captureTarget.mockReturnValue({ type: 1, avatar: 'bob.png' });
    finish('{"scriptName":"A"}');
    await pending;
    expect(s.deps.captureTarget).not.toHaveBeenCalled();
    expect(s.deps.saveScriptsByType).toHaveBeenCalledWith(s.list, 1, s.target);
});
