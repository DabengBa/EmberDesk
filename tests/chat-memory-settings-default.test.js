import { expect, test } from '@jest/globals';
import { buildSettingsFormDefaults } from '../app/lib/settings-helpers.js';

test('settings default to enabling chat memory without overriding an explicit disabled choice', () => {
    expect(buildSettingsFormDefaults({}).memory.enabled).toBe(true);
    expect(buildSettingsFormDefaults({ oai_settings: { chat_memory_enabled: null } }).memory.enabled).toBe(true);
    expect(buildSettingsFormDefaults({ oai_settings: { chat_memory_enabled: false } }).memory.enabled).toBe(false);
});
