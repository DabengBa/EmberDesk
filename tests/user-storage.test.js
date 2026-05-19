import { describe, test, expect } from '@jest/globals';
import { toKey, toAvatarKey, getAccountVersion, KEY_PREFIX } from '../src/user-storage.js';

describe('toKey', () => {
    test('prefixes handle with KEY_PREFIX', () => {
        expect(toKey('alice')).toBe('user:alice');
        expect(toKey('')).toBe('user:');
    });

    test('KEY_PREFIX is "user:"', () => {
        expect(KEY_PREFIX).toBe('user:');
    });
});

describe('toAvatarKey', () => {
    test('prefixes handle with "avatar:"', () => {
        expect(toAvatarKey('alice')).toBe('avatar:alice');
        expect(toAvatarKey('')).toBe('avatar:');
    });
});

describe('getAccountVersion', () => {
    const user = { handle: 'alice', password: 'hash123', salt: 'salt456' };

    test('returns consistent hash for same input', () => {
        const v1 = getAccountVersion(user);
        const v2 = getAccountVersion(user);
        expect(v1).toBe(v2);
    });

    test('returns hex string of expected length (shake256 8 bytes = 16 hex chars)', () => {
        const v = getAccountVersion(user);
        expect(v).toMatch(/^[0-9a-f]{16}$/);
    });

    test('changes when password changes', () => {
        const v1 = getAccountVersion(user);
        const v2 = getAccountVersion({ ...user, password: 'different' });
        expect(v1).not.toBe(v2);
    });

    test('changes when handle changes', () => {
        const v1 = getAccountVersion(user);
        const v2 = getAccountVersion({ ...user, handle: 'bob' });
        expect(v1).not.toBe(v2);
    });
});
