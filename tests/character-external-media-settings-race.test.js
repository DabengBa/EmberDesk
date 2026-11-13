import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

test('a stale settings response preserves authorization and concurrent edits while applying unchanged fields', () => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    const start = source.indexOf('        saveSettings: (settings, baseline, revision) => {');
    const end = source.indexOf('\n        hasSettingsConflict:', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const commandSource = source.slice(start, end).trim().replace(/,$/, '');
    const context = { powerUserSettings: { external_media_allowed_overrides: [], external_media_forbidden_overrides: ['a.png'], unchanged: 'before', concurrent: 'newer' }, chatCompletionSettings: {}, featureSettings: {} };
    const baseline = { power_user: { external_media_allowed_overrides: ['a.png'], external_media_forbidden_overrides: [], unchanged: 'before', concurrent: 'before' } };
    const create = new Function('getContext', 'eventSource', 'event_types', 'forceCharacterEditorTokenize', 'runtimeSettingsConflict', 'refreshOpenAIPresetService', `let settingsDocumentRevision = 1; return ({ ${commandSource} }).saveSettings;`);
    const refresh = jest.fn();
    const command = create(() => context, { emit: jest.fn() }, {}, jest.fn(), { hasConflict: () => false }, refresh);
    command({ power_user: { external_media_allowed_overrides: ['a.png'], external_media_forbidden_overrides: [], unchanged: 'saved', concurrent: 'stale' } }, baseline, 2);
    expect(context.powerUserSettings.external_media_allowed_overrides).toEqual([]);
    expect(context.powerUserSettings.external_media_forbidden_overrides).toEqual(['a.png']);
    expect(context.powerUserSettings.unchanged).toBe('saved');
    expect(context.powerUserSettings.concurrent).toBe('newer');
    expect(refresh).toHaveBeenCalledTimes(1);
});
