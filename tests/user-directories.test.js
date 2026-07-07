import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'node:path';
import { getUserDirectories } from '../src/user-directories.js';

const ORIGINAL_DATA_ROOT = globalThis.DATA_ROOT;

beforeAll(() => {
    globalThis.DATA_ROOT = '/tmp/test-data';
});

afterAll(() => {
    globalThis.DATA_ROOT = ORIGINAL_DATA_ROOT;
});

describe('getUserDirectories', () => {
    test('returns object with all expected keys', () => {
        const dirs = getUserDirectories('alice');
        expect(dirs).toHaveProperty('root');
        expect(dirs).toHaveProperty('thumbnails');
        expect(dirs).toHaveProperty('characters');
        expect(dirs).toHaveProperty('chats');
        expect(dirs).toHaveProperty('avatars');
        expect(dirs).toHaveProperty('backups');
        expect(dirs).toHaveProperty('sysprompt');
        expect(dirs).toHaveProperty('storage');
    });

    test('all paths are under DATA_ROOT/<handle>/', () => {
        const dirs = getUserDirectories('alice');
        for (const dir of Object.values(dirs)) {
            expect(dir).toContain(path.join('/tmp/test-data', 'alice'));
        }
    });

    test('root directory is DATA_ROOT/<handle>/', () => {
        const dirs = getUserDirectories('alice');
        expect(dirs.root).toBe(path.join('/tmp/test-data', 'alice', ''));
    });

    test('storage directory is DATA_ROOT/<handle>/storage', () => {
        const dirs = getUserDirectories('alice');
        expect(dirs.storage).toBe(path.join('/tmp/test-data', 'alice', 'storage'));
    });

    test('second call returns cached object (same reference)', () => {
        const d1 = getUserDirectories('bob');
        const d2 = getUserDirectories('bob');
        expect(d1).toBe(d2);
    });

    test('different handles get different directories', () => {
        const d1 = getUserDirectories('alice');
        const d2 = getUserDirectories('charlie');
        expect(d1.root).not.toBe(d2.root);
    });
});
