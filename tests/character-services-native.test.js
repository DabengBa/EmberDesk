import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from '@jest/globals';

const moduleUrl = name => new URL(`../src/${name}`, import.meta.url).href;

function runNode(source, ...args) {
    return spawnSync(process.execPath, ['--input-type=module', '--eval', source, ...args], {
        encoding: 'utf8',
        timeout: 10_000,
    });
}

test('Node executes the migrated character services without a loader', () => {
    const result = runNode(`
        import assert from 'node:assert/strict';
        const read = await import(process.argv[1]);
        const write = await import(process.argv[2]);
        const result = await read.readCharacterListPayload({
            directories: {}, shallow: true, dependencies: {},
        });
        assert.equal(result.canonicalUnavailable, 'canonical_storage_disabled');
        assert.deepEqual(result.result, { mode: 'snapshot', data: [] });
        const error = new read.CanonicalReadBlockedError('private-reason', 'canonical_storage_unavailable');
        assert.equal(error.reason, 'private-reason');
        assert.equal(error.safeReason, 'canonical_storage_unavailable');
        for (const name of ['createCharacterCard', 'editCharacterCard', 'renameCharacterCard', 'deleteCharacterCard']) {
            assert.equal(typeof write[name], 'function');
        }
        console.log('character-services:native');
    `, moduleUrl('endpoints/character-read-service.ts'), moduleUrl('endpoints/character-write-service.ts'));
    expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr })
        .toEqual({ status: 0, stderr: '' });
    expect(result.stdout.trim()).toBe('character-services:native');
});

test('Node resolves the real character router, replacement and import graphs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-character-services-native-'));
    try {
        const config = path.join(root, 'config.yaml');
        fs.writeFileSync(config, 'backups:\n  chat:\n    enabled: false\n');
        const result = runNode(`
            import assert from 'node:assert/strict';
            const { setConfigFilePath } = await import(process.argv[1]);
            setConfigFilePath(process.argv[2]);
            globalThis.DATA_ROOT = process.argv[3];
            const { router } = await import(process.argv[4]);
            const { runCharacterTextReplace } = await import(process.argv[5]);
            const { createCharacterImportCoordinator } = await import(process.argv[6]);
            assert.equal(typeof router, 'function');
            assert.equal(typeof runCharacterTextReplace, 'function');
            assert.equal(typeof createCharacterImportCoordinator, 'function');
            console.log('character-callers:native');
        `, moduleUrl('util.js'), config, root, moduleUrl('endpoints/characters.js'),
        moduleUrl('endpoints/character-text-replace-service.js'), moduleUrl('endpoints/character-import-service.js'));
        expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr })
            .toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toContain('character-callers:native');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
