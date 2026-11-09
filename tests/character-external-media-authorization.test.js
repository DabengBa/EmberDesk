import { describe, expect, jest, test } from '@jest/globals';
import { invalidateCharacterExternalMediaAuthorization, setCharacterExternalMediaAuthorization } from '../public/scripts/character-external-media-authorization.js';

describe('character external media authorization', () => {
    test('failed revoke restores only its identity without undoing another character grant', async () => {
        const settings = { external_media_allowed_overrides: ['alice.png'], external_media_authorization_canonical_ids: { 'alice.png': 'alice-id' } };
        let reject;
        let selected = 'alice.png';
        const ids = { 'alice.png': 'alice-id', 'bob.png': 'bob-id' };
        const pending = new Promise((_, r) => { reject = r; });
        const first = setCharacterExternalMediaAuthorization({ settings, characterId: 'alice.png', canonicalId: 'alice-id', allowed: false, getCurrentCharacterId: () => selected, getCurrentCharacterCanonicalId: avatar => ids[avatar ?? selected], refresh: () => {}, save: () => pending });
        selected = 'bob.png';
        await setCharacterExternalMediaAuthorization({ settings, characterId: 'bob.png', canonicalId: 'bob-id', allowed: true, getCurrentCharacterId: () => 'bob.png', getCurrentCharacterCanonicalId: () => 'bob-id', refresh: () => {}, save: async () => {} });
        reject(new Error('offline'));
        await first;
        expect(settings.external_media_authorization_canonical_ids).toEqual({ 'alice.png': 'alice-id', 'bob.png': 'bob-id' });
        expect(settings.external_media_allowed_overrides).toEqual(expect.arrayContaining(['alice.png', 'bob.png']));
    });
    test('a late failure cannot undo a newer operation or another character', async () => {
        const settings = { external_media_allowed_overrides: ['alice.png'], external_media_forbidden_overrides: [] };
        let reject;
        const pending = new Promise((_, r) => { reject = r; });
        const options = { settings, getCurrentCharacterId: () => 'alice.png', refresh: jest.fn() };
        const first = setCharacterExternalMediaAuthorization({ ...options, characterId: 'alice.png', allowed: false, save: () => pending });
        await setCharacterExternalMediaAuthorization({ ...options, characterId: 'alice.png', allowed: true, save: async () => {} });
        settings.external_media_allowed_overrides.push('bob.png');
        reject(new Error('offline'));
        await first;
        expect(settings.external_media_allowed_overrides).toEqual(['alice.png', 'bob.png']);
    });

    test('rollback restores only the failed character', async () => {
        const settings = { external_media_allowed_overrides: ['alice.png'] };
        let reject;
        const pending = new Promise((_, r) => { reject = r; });
        const first = setCharacterExternalMediaAuthorization({ settings, characterId: 'alice.png', allowed: false, getCurrentCharacterId: () => 'alice.png', refresh: jest.fn(), save: () => pending });
        settings.external_media_allowed_overrides.push('bob.png');
        reject(new Error('offline'));
        await first;
        expect(settings.external_media_allowed_overrides).toEqual(expect.arrayContaining(['alice.png', 'bob.png']));
    });
    test('a failed old grant cannot undo a newer revoke', async () => {
        const settings = { external_media_allowed_overrides: [] };
        let reject;
        const pending = new Promise((_, r) => { reject = r; });
        const options = { settings, characterId: 'alice.png', getCurrentCharacterId: () => 'alice.png', refresh: jest.fn() };
        const first = setCharacterExternalMediaAuthorization({ ...options, allowed: true, save: () => pending });
        await setCharacterExternalMediaAuthorization({ ...options, allowed: false, save: async () => {} });
        reject(new Error('offline'));
        await first;
        expect(settings.external_media_allowed_overrides).toEqual([]);
    });
    test('waits for persistence and restores local authorization when save fails', async () => {
        const settings = { external_media_allowed_overrides: ['alice.png'] };
        const refresh = jest.fn();
        const save = jest.fn(async () => { throw new Error('offline'); });
        await expect(setCharacterExternalMediaAuthorization({ settings, characterId: 'alice.png', allowed: false, getCurrentCharacterId: () => 'alice.png', save, refresh })).resolves.toBe(false);
        expect(settings.external_media_allowed_overrides).toEqual(['alice.png']);
        expect(refresh).toHaveBeenCalled();
    });
    test('does not restore an old avatar after its character identity changes', async () => {
        const settings = { external_media_allowed_overrides: ['old.png'] };
        let current = { avatar: 'old.png', canonicalId: 'old-id' };
        let reject;
        const pending = new Promise((_, r) => { reject = r; });
        const first = setCharacterExternalMediaAuthorization({
            settings,
            characterId: 'old.png',
            canonicalId: 'old-id',
            allowed: false,
            getCurrentCharacterId: () => current.avatar,
            getCurrentCharacterCanonicalId: () => current.canonicalId,
            refresh: jest.fn(),
            save: () => pending,
        });
        current = { avatar: 'new.png', canonicalId: 'old-id' };
        invalidateCharacterExternalMediaAuthorization(settings, 'old.png');
        reject(new Error('offline'));
        await first;
        expect(settings.external_media_allowed_overrides).toEqual([]);
    });
    test('does not restore a revoked grant when the save reports the identity is gone', async () => {
        const settings = { external_media_allowed_overrides: ['alice.png'] };
        const error = new Error('CSS authorization save failed: 404');
        error.retireAuthorization = true;
        const saved = await setCharacterExternalMediaAuthorization({
            settings,
            characterId: 'alice.png',
            allowed: false,
            getCurrentCharacterId: () => 'alice.png',
            save: async () => { throw error; },
            refresh: () => {},
        });
        expect(saved).toBe(false);
        expect(settings.external_media_allowed_overrides).toEqual([]);
    });

    test('a delayed 404 for a replaced identity cannot remove its reused avatar grant', async () => {
        const settings = { external_media_allowed_overrides: [], external_media_forbidden_overrides: [] };
        let currentCanonicalId = 'old-id';
        let rejectOldSave;
        const oldSave = new Promise((_, reject) => { rejectOldSave = reject; });
        const options = {
            settings,
            characterId: 'reused.png',
            getCurrentCharacterId: () => 'reused.png',
            getCurrentCharacterCanonicalId: () => currentCanonicalId,
            refresh: () => {},
        };
        const oldGrant = setCharacterExternalMediaAuthorization({
            ...options,
            canonicalId: 'old-id',
            allowed: true,
            save: () => oldSave,
        });

        currentCanonicalId = 'new-id';
        await setCharacterExternalMediaAuthorization({
            ...options,
            canonicalId: 'new-id',
            allowed: true,
            save: async () => {},
        });

        const notFound = new Error('identity no longer exists');
        notFound.retireAuthorization = true;
        rejectOldSave(notFound);
        await oldGrant;

        expect(settings.external_media_allowed_overrides).toEqual(['reused.png']);
    });

    test('preserves old grants, saves changes and refreshes rendering on grant and revoke', async () => {
        const settings = { external_media_allowed_overrides: ['alice.png', 'bob.png'], external_media_forbidden_overrides: ['alice.png'] };
        const save = jest.fn();
        const refresh = jest.fn();
        const options = { settings, getCurrentCharacterId: () => 'alice.png', save, refresh };
        await setCharacterExternalMediaAuthorization({ ...options, characterId: 'alice.png', allowed: false });
        expect(settings.external_media_allowed_overrides).toEqual(['bob.png']);
        await setCharacterExternalMediaAuthorization({ ...options, characterId: 'alice.png', allowed: true });
        expect(settings.external_media_allowed_overrides).toEqual(['bob.png', 'alice.png']);
        expect(settings.external_media_forbidden_overrides).toEqual([]);
        expect(save).toHaveBeenCalledTimes(2);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    test('fails closed for malformed old settings and rejects stale character controls', async () => {
        const settings = { external_media_allowed_overrides: 'alice.png' };
        const save = jest.fn();
        const refresh = jest.fn();
        const options = { settings, getCurrentCharacterId: () => 'bob.png', save, refresh };
        expect(await setCharacterExternalMediaAuthorization({ ...options, characterId: 'alice.png', allowed: true })).toBe(false);
        expect(save).not.toHaveBeenCalled();
        expect(await setCharacterExternalMediaAuthorization({ ...options, characterId: 'bob.png', allowed: true })).toBe(true);
        expect(settings.external_media_allowed_overrides).toEqual(['bob.png']);
    });
});
