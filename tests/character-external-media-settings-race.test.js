import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

test('a stale settings response cannot restore a revoked authorization or overwrite unrelated runtime settings', () => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('        saveSettings: (settings) => {');
    const end = source.indexOf('\n        connectProvider:', start);
    expect(start).toBeGreaterThan(-1);
    const commandSource = source.slice(start, end).trim().replace(/,$/, '');
    const context = { powerUserSettings: { external_media_allowed_overrides: [], external_media_forbidden_overrides: ['a.png'], unrelated: 'live' }, chatCompletionSettings: {}, featureSettings: {} };
    const create = new Function('getContext', 'eventSource', 'event_types', 'forceCharacterEditorTokenize', `return ({ ${commandSource} }).saveSettings;`);
    const command = create(() => context, { emit: jest.fn() }, {}, jest.fn());
    command({ power_user: { external_media_allowed_overrides: ['a.png'], external_media_forbidden_overrides: [], unrelated: 'saved' } });
    expect(context.powerUserSettings.external_media_allowed_overrides).toEqual([]);
    expect(context.powerUserSettings.external_media_forbidden_overrides).toEqual(['a.png']);
    expect(context.powerUserSettings.unrelated).toBe('saved');
});
