import { describe, expect, jest, test } from '@jest/globals';
import { loadTsModule } from './helpers/load-ts-module.mjs';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createReactRuntimeProvider } from '../public/scripts/react-runtime-provider.js';
import { createSettingsWriteOwner } from '../public/scripts/settings-write-owner.js';

describe('settings write owner', () => {
    test('rejects overlapping form conflicts and preserves a rebased provider otherwise', async () => {
        const { createSettingsWriteOwner } = await loadTsModule('app/lib/settings-write-owner.ts');
        const owner = createSettingsWriteOwner();
        const ports = {
            base: { oai_settings: { model: 'old' } }, local: { oai_settings: { model: 'edited' } },
            remote: { oai_settings: { model: 'old', extra: true } }, values: { depth: 2 }, baseline: { depth: 1 }, revision: 3,
            provider: doc => doc.oai_settings, rebaseProvider: (_base, local, remote) => ({ ...remote, ...local }),
            formDefaults: () => ({ depth: 1 }), formConflict: () => false,
            buildPayload: (remote, _values, options) => ({ ...remote, settings_revision: options.settingsRevision }),
        };
        expect(owner.rebaseForm(ports)).toEqual({ oai_settings: { model: 'edited', extra: true }, settings_revision: 3 });
        expect(owner.rebaseForm({ ...ports, formConflict: () => true })).toBeNull();
        expect(owner.rebaseForm({ ...ports, rebaseProvider: () => null })).toBeNull();
    });
    test('shell uses a synchronous artifact and exposes the same owner without reading boot state', () => {
        const source = readFileSync(new URL('../app/lib/settings-write-owner.ts', import.meta.url), 'utf8');
        const artifact = readFileSync(new URL('../public/scripts/settings-write-owner.js', import.meta.url), 'utf8');
        const normalized = stripTypeScriptTypes(source).replace(/[\t ]+$/gm, '').replace(/\n+$/, '\n');
        expect(artifact).toBe(`/* eslint-disable */\n// Generated from app/lib/settings-write-owner.ts; run node scripts/build-settings-write-owner.mjs.\n${normalized}`);
        expect(artifact).not.toMatch(/[\t ]+$/m);
        expect(artifact).not.toMatch(/\n\n$/);
        const shell = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
        expect(shell).toContain('const runtimeSettingsConflict = createSettingsWriteOwner();');
        expect(shell).toContain('settingsWriteOwner: runtimeSettingsConflict');
        const owner = createSettingsWriteOwner();
        const getContext = jest.fn(() => { throw new Error('not booted'); });
        const provider = createReactRuntimeProvider({ getContext, eventSource: { on() {}, removeListener() {} }, eventTypes: {}, commands: {
            settingsWriteOwner: owner, submitMessage() {}, stopGeneration() {}, loadEarlier() {}, saveSettings() {}, connectProvider() {}, testProviderConnection() {},
        } });
        expect(provider.getSettingsWriteOwner()).toBe(owner);
        expect(getContext).not.toHaveBeenCalled();
    });
    test('rebases form once, but a runtime conflict prevents subsequent writes', async () => {
        const { createSettingsWriteOwner } = await loadTsModule('app/lib/settings-write-owner.ts');
        const owner = createSettingsWriteOwner();
        const post = jest.fn().mockResolvedValueOnce({ ok: false, status: 409 }).mockResolvedValueOnce({ ok: true, status: 200 });
        const rebase = jest.fn().mockResolvedValue({ value: 'merged' });
        const result = await owner.saveForm({ payload: { value: 'draft' }, post, rebase });
        expect(result.payload).toEqual({ value: 'merged' });
        expect(post).toHaveBeenCalledTimes(2);
        await expect(owner.saveRuntime({ post: async () => ({ ok: false, status: 409 }) })).rejects.toThrow('revision conflict');
        expect(owner.hasConflict()).toBe(true);
        await expect(owner.saveForm({ payload: {}, post, rebase })).rejects.toThrow('runtime settings conflict');
        expect(post).toHaveBeenCalledTimes(2);
    });

    test('a runtime conflict during a form rebase prevents the second POST', async () => {
        const { createSettingsWriteOwner } = await loadTsModule('app/lib/settings-write-owner.ts');
        const owner = createSettingsWriteOwner();
        const post = jest.fn().mockResolvedValue({ ok: false, status: 409 });
        let resume;
        const waiting = new Promise(resolve => { resume = resolve; });
        const rebase = jest.fn(async () => { await waiting; return { value: 2 }; });
        const save = owner.saveForm({ payload: { value: 1 }, post, rebase });
        await Promise.resolve();
        await Promise.resolve();
        await expect(owner.saveRuntime({ post: async () => ({ ok: false, status: 409 }) })).rejects.toThrow('revision conflict');
        resume();
        await expect(save).rejects.toThrow('runtime settings conflict');
        expect(post).toHaveBeenCalledTimes(1);
    });
});
