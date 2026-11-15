import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, test } from '@jest/globals';
import { resolveCanonicalChatProjectionPath } from '../src/endpoints/canonical-chat-projection-path.ts';

const roots = [];

function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-projection-path-'));
    roots.push(root);
    const directories = { root, chats: path.join(root, 'chats') };
    fs.mkdirSync(directories.chats);
    return directories;
}

function resolve(directories, ownerType, ownerId, sourcePath) {
    return resolveCanonicalChatProjectionPath({ directories, ownerType, ownerId, sourcePath });
}

afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('canonical chat projection paths', () => {
    test('accepts direct character and group JSONL paths, including missing directories and mixed-case extensions', () => {
        const directories = setup();
        expect(resolve(directories, 'character', 'alice', 'chats/alice/a.JSONL'))
            .toBe(path.join(directories.chats, 'alice', 'a.JSONL'));
        expect(resolve(directories, 'group', 'team', 'group chats/team.jsonl'))
            .toBe(path.join(directories.root, 'group chats', 'team.jsonl'));
        expect(resolve(directories, 'character', 42, 'chats/42/a.jsonl'))
            .toBe(path.join(directories.chats, '42', 'a.jsonl'));
    });

    test('requires root, a character chats directory, JSONL and a recognized owner type', () => {
        const directories = setup();
        expect(() => resolve(null, 'character', 'alice', 'a.jsonl')).toThrow('Canonical chat projection root is required.');
        expect(() => resolve({ root: directories.root }, 'character', 'alice', 'a.jsonl')).toThrow('Canonical character chat projection directory is required.');
        expect(() => resolve(directories, 'character', 'alice', 'chats/alice/a.json')).toThrow('Canonical chat projection must be a JSONL file: chats/alice/a.json');
        expect(() => resolve(directories, 'other', 'alice', 'chats/alice/a.jsonl')).toThrow('Canonical chat owner type is invalid: other');
    });

    test('enforces character ownership and rejects nested, sibling and traversal targets', () => {
        const directories = setup();
        for (const [owner, source] of [
            ['alice', 'chats/bob/a.jsonl'],
            ['alice', 'chats/alice/nested/a.jsonl'],
            ['alice', 'chats/alice/../../secrets.jsonl'],
            ['../outside', 'outside/a.jsonl'],
            ['alice', path.join(directories.root, 'chats-other/alice/a.jsonl')],
        ]) {
            expect(() => resolve(directories, 'character', owner, source)).toThrow('Canonical character chat projection path is invalid:');
        }
    });

    test('enforces group directory and filename ownership', () => {
        const directories = setup();
        for (const source of ['group chats/other.jsonl', 'group chats/nested/team.jsonl', 'chats/team.jsonl', 'group chats/../team.jsonl']) {
            expect(() => resolve(directories, 'group', 'team', source)).toThrow('Canonical group chat projection path is invalid:');
        }
    });

    test('rejects symlinked character owner directories and propagates other filesystem errors', () => {
        const directories = setup();
        fs.symlinkSync(directories.root, path.join(directories.chats, 'alice'), 'dir');
        expect(() => resolve(directories, 'character', 'alice', 'chats/alice/a.jsonl'))
            .toThrow('Canonical chat projection path contains a symbolic link:');
        fs.writeFileSync(path.join(directories.chats, 'file'), '');
        expect(() => resolve(directories, 'character', 'file/child', 'chats/file/child/a.jsonl'))
            .toThrow(expect.objectContaining({ code: 'ENOTDIR' }));
    });

    test('preserves existing handling of symlinked roots and terminal files', () => {
        const directories = setup();
        const alice = path.join(directories.chats, 'alice');
        fs.mkdirSync(alice);
        fs.symlinkSync(path.join(directories.root, 'elsewhere.jsonl'), path.join(alice, 'a.jsonl'));
        expect(resolve(directories, 'character', 'alice', 'chats/alice/a.jsonl')).toBe(path.join(alice, 'a.jsonl'));
        fs.symlinkSync(directories.root, path.join(directories.root, 'group chats'), 'dir');
        expect(resolve(directories, 'group', 'team', 'group chats/team.jsonl'))
            .toBe(path.join(directories.root, 'group chats', 'team.jsonl'));
    });

    test('native Node resolves the TypeScript module and all three production consumers without a loader', () => {
        const directories = setup();
        const projection = new URL('../src/endpoints/canonical-chat-projection-path.ts', import.meta.url).href;
        const consumers = [
            '../src/canonical-sqlite-export.js',
            '../src/canonical-sqlite-operator.js',
            '../src/endpoints/canonical-chat-backup-restore-service.ts',
        ].map(file => new URL(file, import.meta.url).href);
        const script = `
            import assert from 'node:assert/strict';
            import { resolveCanonicalChatProjectionPath } from ${JSON.stringify(projection)};
            ${consumers.map(url => `await import(${JSON.stringify(url)});`).join('\n')}
            const directories = JSON.parse(process.argv[1]);
            assert.equal(resolveCanonicalChatProjectionPath({ directories, ownerType: 'character', ownerId: 'alice', sourcePath: 'chats/alice/a.jsonl' }), ${JSON.stringify(path.join(directories.chats, 'alice', 'a.jsonl'))});
            assert.throws(() => resolveCanonicalChatProjectionPath({ directories, ownerType: 'character', ownerId: 'alice', sourcePath: 'chats/bob/a.jsonl' }), /projection path is invalid/);
        `;
        const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(directories)], { encoding: 'utf8' });
        expect({ status: child.status, stderr: child.stderr }).toEqual({ status: 0, stderr: '' });
    });
});
