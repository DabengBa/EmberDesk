import { describe, expect, test } from '@jest/globals';

import { resolvePersistedCurrentVersion, resolveStartupSettingsPlan } from '../public/scripts/startup-helpers.js';

describe('resolveStartupSettingsPlan', () => {
    test('should keep extension loading deferred while preserving startup flags', () => {
        const plan = resolveStartupSettingsPlan({
            data: {
                settings: JSON.stringify({
                    currentVersion: '1.0.0',
                    extension_settings: {
                        apiUrl: 'http://localhost:5100',
                    },
                    firstRun: false,
                }),
                enable_extensions: true,
                enable_extensions_auto_update: true,
            },
            currentVersion: '1.1.0',
        });

        expect(plan.settings).toEqual(expect.objectContaining({
            currentVersion: '1.0.0',
            firstRun: false,
        }));
        expect(plan.firstRun).toBe(false);
        expect(plan.extensionPlan).toEqual(expect.objectContaining({
            shouldLoadDeferred: true,
            enableAutoUpdate: true,
            isVersionChanged: true,
            disableUi: false,
        }));
    });

    test('should mark extensions disabled without scheduling deferred activation', () => {
        const plan = resolveStartupSettingsPlan({
            data: {
                settings: JSON.stringify({
                    currentVersion: '1.0.0',
                    extension_settings: {
                        disabledExtensions: ['third-party/foo'],
                    },
                    firstRun: true,
                }),
                enable_extensions: false,
                enable_extensions_auto_update: true,
            },
            currentVersion: '1.0.0',
        });

        expect(plan.firstRun).toBe(true);
        expect(plan.extensionPlan).toEqual(expect.objectContaining({
            shouldLoadDeferred: false,
            enableAutoUpdate: false,
            isVersionChanged: false,
            disableUi: true,
        }));
    });

    test('should reuse the last saved version when the current version is still unresolved', () => {
        expect(resolvePersistedCurrentVersion({
            currentVersion: '0.0.0',
            settingsVersion: '1.2.3',
        })).toBe('1.2.3');
    });

    test('should omit the placeholder version when no usable version is available', () => {
        expect(resolvePersistedCurrentVersion({
            currentVersion: '0.0.0',
            settingsVersion: null,
        })).toBeNull();
    });
});
