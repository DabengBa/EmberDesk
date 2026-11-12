import { beforeEach, expect, jest, test } from '@jest/globals';

const metadata = {};
const settings = { variables: { global: {} } };
const saveMetadata = jest.fn();
const saveSettings = jest.fn();
const convertValueType = jest.fn((value, type) => type === 'number' ? Number(value) : value);
jest.unstable_mockModule('../public/script.js', () => ({ chat_metadata: metadata, saveSettingsDebounced: saveSettings }));
jest.unstable_mockModule('../public/scripts/feature-settings.js', () => ({ feature_settings: settings, saveMetadataDebounced: saveMetadata }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ convertValueType }));
const variables = await import('../public/scripts/variables.js');

beforeEach(() => {
    delete metadata.variables;
    settings.variables.global = {};
    saveMetadata.mockClear();
    saveSettings.mockClear();
    convertValueType.mockClear();
});

test('retains local and global variable operations, index conversion and persistence', () => {
    for (const [scope, save] of [['Local', saveMetadata], ['Global', saveSettings]]) {
        const set = variables[`set${scope}Variable`];
        const get = variables[`get${scope}Variable`];
        set('count', '2');
        expect(get('count')).toBe(2);
        expect(variables[`add${scope}Variable`]('count', 3)).toBe(5);
        expect(variables[`increment${scope}Variable`]('count')).toBe(6);
        expect(variables[`decrement${scope}Variable`]('count')).toBe(5);
        set('object', '42', { index: 'answer', as: 'number' });
        expect(get('object', { index: 'answer' })).toBe(42);
        set('array', '7', { index: 0, as: 'number' });
        expect(get('array', { index: 0 })).toBe(7);
        expect(variables[`exists${scope}Variable`]('count')).toBe(true);
        variables[`delete${scope}Variable`]('count');
        expect(variables[`exists${scope}Variable`]('count')).toBe(false);
        expect(save).toHaveBeenCalledTimes(7);
    }
    expect(convertValueType).toHaveBeenCalledTimes(4);
});

test('legacy variable macros keep local and global side effects', () => {
    const apply = input => variables.getVariableMacros().reduce((value, macro) => value.replace(macro.regex, macro.replace), input);
    expect(apply('{{setvar::x::2}}{{incvar::x}}/{{getvar::x}}')).toBe('3/3');
    expect(apply('{{setglobalvar::x::4}}{{addglobalvar::x::2}}{{decglobalvar::x}}/{{getglobalvar::x}}')).toBe('5/5');
    expect(saveMetadata).toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalled();
});

test('does not expose retired Slash variable APIs', () => {
    expect(variables.registerVariableCommands).toBeUndefined();
    expect(variables.resolveVariable).toBeUndefined();
});
