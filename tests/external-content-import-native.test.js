import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@jest/globals';

const moduleUrl = name => new URL(`../src/${name}`, import.meta.url).href;

test('native Node imports the service and production callers without a loader or network', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-external-content-native-'));
    try {
        const config = path.join(root, 'config.yaml');
        fs.writeFileSync(config, 'backups:\n  chat:\n    enabled: false\n');
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
            import assert from 'node:assert/strict';
            const { setConfigFilePath } = await import(process.argv[1]);
            setConfigFilePath(process.argv[2]);
            globalThis.DATA_ROOT = process.argv[3];
            const service = await import(process.argv[4]);
            const content = await import(process.argv[5]);
            const assets = await import(process.argv[6]);
            assert.equal(typeof content.router, 'function');
            assert.equal(typeof assets.router, 'function');
            assert.equal(service.classifyExternalContentUrl('https://chub.ai/characters/a/b').descriptor.id, 'a/b');
            assert.equal(service.classifyExternalContentUrl('https://chub.ai.evil.test/a/b').failure.kind, 'unsupported_host');
            const response = { ok: false, status: 503, statusText: 'Unavailable' };
            const fetched = await service.fetchExternalResource({ url: 'https://example.test/', fetchImpl: async () => response });

            assert.equal(fetched.ok, true);
            assert.equal(fetched.failure.kind, 'provider_non_2xx');
            console.log('external-content:native');
        `, moduleUrl('util.js'), config, root, moduleUrl('endpoints/external-content-import-service.ts'),
        moduleUrl('endpoints/content-manager.js'), moduleUrl('endpoints/assets.js')], { encoding: 'utf8', timeout: 10_000 });
        expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr })
            .toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toContain('external-content:native');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('strict consumers can narrow results and reject mismatched descriptors', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-external-content-types-'));
    try {
        const repo = fileURLToPath(new URL('../', import.meta.url));
        const entry = path.join(root, 'consumer.ts');
        const config = path.join(root, 'tsconfig.json');
        const service = JSON.stringify(path.join(repo, 'src/endpoints/external-content-import-service.ts'));
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
        fs.writeFileSync(entry, `
            import { classifyExternalContentUrl, classifyExternalContentId, fetchExternalResource, downloadExternalAsset, downloadExternalContentArtifact } from ${service};
            import type { ExternalContentDescriptor } from ${service};
            const result = classifyExternalContentUrl('https://chub.ai/characters/a/b');
            if (result.ok) {
                const host: string = result.descriptor.host;
                if (result.descriptor.source === 'chub_lorebook') {
                    const type: 'lorebook' = result.descriptor.type;
                    void type;
                }
                void host;
            } else if (result.failure.kind === 'unsupported_host') {
                const host: string = result.failure.host;
                void host;
            }
            const id = classifyExternalContentId('AICC/a/b');
            if (!id.ok) { const source: 'aicc_character' = id.failure.source; void source; }
            const fetched = await fetchExternalResource();
            if (!fetched.ok && fetched.response === null) {
                const kind: 'network_error' = fetched.failure.kind;
                void kind;
            }
            const asset = await downloadExternalAsset();
            if (asset.ok) { const host: string = asset.host; void host; }
            const artifact = await downloadExternalContentArtifact();
            if (artifact.ok) {
                // @ts-expect-error missing Content-Type can produce null
                const mime: string | undefined = artifact.artifact.fileType;
                void mime;
            }
            // @ts-expect-error lorebook descriptors cannot identify a character source
            const invalid: ExternalContentDescriptor = { source: 'chub_character', type: 'lorebook', id: 'x' };
            void invalid;
        `);
        fs.writeFileSync(config, JSON.stringify({
            extends: path.join(repo, 'tsconfig.server.json'),
            compilerOptions: { typeRoots: [path.join(repo, 'node_modules/@types')] },
            files: [entry, path.join(repo, 'index.d.ts')], include: [],
        }));
        const result = spawnSync(process.execPath, [path.join(repo, 'node_modules/typescript/bin/tsc'), '-p', config, '--pretty', 'false'], {
            encoding: 'utf8', timeout: 15_000,
        });
        expect({ status: result.status, diagnostics: result.stdout + result.stderr })
            .toEqual({ status: 0, diagnostics: '' });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
