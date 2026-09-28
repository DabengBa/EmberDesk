import { describe, expect, test } from '@jest/globals';

import { resolvePersistedCurrentVersion, resolveStartupSettingsPlan } from '../public/scripts/startup-helpers.js';

describe('resolveStartupSettingsPlan', () => {
    test('preserves startup flags without an extension loading plan', () => {
        const plan = resolveStartupSettingsPlan({
            data: {
                settings: JSON.stringify({
                    currentVersion: '1.0.0',
                    feature_settings: {
                        apiUrl: 'http://localhost:5100',
                    },
                    firstRun: false,
                }),
            },
            currentVersion: '1.1.0',
        });

        expect(plan.settings).toEqual(expect.objectContaining({
            currentVersion: '1.0.0',
            firstRun: false,
        }));
        expect(plan.firstRun).toBe(false);
        expect(plan.extensionPlan).toBeUndefined();
    });

    test('firstRun is reported independently of legacy extension flags', () => {
        const plan = resolveStartupSettingsPlan({
            data: {
                settings: JSON.stringify({
                    currentVersion: '1.0.0',
                    firstRun: true,
                }),
            },
            currentVersion: '1.0.0',
        });

        expect(plan.firstRun).toBe(true);
        expect(plan.extensionPlan).toBeUndefined();
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
