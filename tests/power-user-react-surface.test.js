import { describe, expect, test } from '@jest/globals';
import { readRepoFile } from './helpers/frontend-compatibility-contract.js';

describe('merged message-rendering settings (former user-settings drawer)', () => {
    test('Frontend Frames fields are bound into the settings form; the separate drawer is gone', () => {
        const surface = readRepoFile('app/components/settings/SettingsSurface.tsx');
        const helpers = readRepoFile('app/lib/settings-helpers.js');
        const indexHtml = readRepoFile('public/index.html');
        const powerUser = readRepoFile('public/scripts/power-user.js');
        const script = readRepoFile('public/script.js');

        // Every former drawer control is now a React-bound form field on the
        // providers tab, mapped to power_user.frontend_frames.* in the doc.
        for (const settingsPath of [
            'power_user.frontend_frames.enabled',
            'power_user.frontend_frames.depth',
            'power_user.frontend_frames.depth_ignore_hidden',
            'power_user.frontend_frames.collapse_code_block',
            'power_user.frontend_frames.skip_highlight',
            'power_user.frontend_frames.use_blob_url',
            'power_user.frontend_frames.allow_streaming',
        ]) {
            expect(helpers).toContain(`settingsPath: '${settingsPath}'`);
        }
        for (const formPath of [
            'rendering.frontendFramesEnabled',
            'rendering.frontendFramesDepth',
            'rendering.frontendFramesDepthIgnoreHidden',
            'rendering.frontendFramesCollapseCodeBlock',
            'rendering.frontendFramesSkipHighlight',
            'rendering.frontendFramesUseBlobUrl',
            'rendering.frontendFramesAllowStreaming',
        ]) {
            expect(surface).toContain(`name="${formPath}"`);
        }

        // The retired drawer host, icon, mount path, and legacy per-element
        // bindings are gone; the runtime openWorkspaceDrawer command went with
        // them.
        expect(indexHtml).not.toContain('id="user-settings-block"');
        expect(indexHtml).not.toContain('id="user-settings-button"');
        expect(powerUser).not.toContain('mountPowerUserPanel');
        expect(powerUser).not.toContain("$('#frontend_frames_");
        expect(script).not.toContain('mountPowerUserPanel');
        expect(script).not.toContain('USNavOpened');
        expect(script).not.toContain('openWorkspaceDrawer');

        // In-memory normalization stays: consumers read
        // power_user.frontend_frames without a settings-form round-trip.
        expect(powerUser).toContain('normalizeFrontendFramesSettings');
        expect(powerUser).toContain('DEFAULT_FRONTEND_FRAME_SETTINGS');
    });
});
