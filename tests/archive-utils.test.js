import { afterEach, describe, expect, test } from '@jest/globals';
import { ZipArchive } from 'archiver';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
    extractFileFromZipBuffer,
    extractFilesFromZipBuffer,
    getImageBuffers,
} from '../src/archive-utils.js';
import {
    extractFileFromZipBuffer as extractFileFromZipBufferViaUtil,
    extractFilesFromZipBuffer as extractFilesFromZipBufferViaUtil,
    getImageBuffers as getImageBuffersViaUtil,
} from '../src/util.js';

const tmpRoots = [];
const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
    'base64',
);

afterEach(() => {
    for (const root of tmpRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

async function createZipBuffer(entries) {
    return await new Promise((resolve, reject) => {
        const archive = new ZipArchive();
        const chunks = [];

        archive.on('warning', reject);
        archive.on('error', reject);
        archive.on('data', (chunk) => {
            chunks.push(Buffer.from(chunk));
        });
        archive.on('end', () => {
            resolve(Buffer.concat(chunks));
        });

        for (const entry of entries) {
            archive.append(entry.data, { name: entry.name });
        }

        archive.finalize();
    });
}

async function createZipFile(entries, fileName = 'archive.zip') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-archive-utils-'));
    tmpRoots.push(root);

    const archivePath = path.join(root, fileName);
    const output = fs.createWriteStream(archivePath);
    const archive = new ZipArchive();

    await new Promise((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', reject);
        archive.on('warning', reject);
        archive.on('error', reject);
        archive.pipe(output);

        for (const entry of entries) {
            archive.append(entry.data, { name: entry.name });
        }

        archive.finalize();
    });

    return archivePath;
}

describe('archive utils', () => {
    test.each(['character.json', 'cards/character.json'])('BYAF resolves an image relative to %s', async characterPath => {
        const { ByafParser } = await import('../src/byaf.js');
        const archiveBuffer = await createZipBuffer([
            { name: path.posix.join(path.posix.dirname(characterPath), 'images/avatar.png'), data: pngBuffer },
        ]);
        const previousCwd = process.cwd();
        try {
            process.chdir(fileURLToPath(new URL('..', import.meta.url)));
            const images = await new ByafParser(archiveBuffer).getCharacterImages({
                images: [{ path: 'images/avatar.png', label: 'Portrait' }],
            }, characterPath);
            expect(images).toEqual([{ filename: 'avatar.png', image: pngBuffer, label: 'Portrait' }]);
        } finally {
            process.chdir(previousCwd);
        }
    });

    test('native Node resolves the format TypeScript and real caller graph without a loader', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emberdesk-format-native-'));
        tmpRoots.push(root);
        const config = path.join(root, 'config.yaml');
        fs.writeFileSync(config, 'backups:\n  chat:\n    enabled: false\n');
        const url = name => new URL(`../src/${name}`, import.meta.url).href;
        const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
            import assert from 'node:assert/strict';
            const util = await import(process.argv[1]);
            util.setConfigFilePath(process.argv[2]);
            globalThis.DATA_ROOT = process.argv[3];
            const archive = await import(process.argv[4]);
            const encode = await import(process.argv[5]);
            const parser = await import(process.argv[6]);
            const card = await import(process.argv[7]);
            const validator = await import(process.argv[8]);
            const router = await import(process.argv[9]);
            const byaf = await import(process.argv[10]);
            const charx = await import(process.argv[11]);
            assert.equal(util.normalizeZipEntryPath, archive.normalizeZipEntryPath);
            assert.equal(archive.normalizeZipEntryPath('../bad'), null);
            assert.equal(typeof encode.default, 'function');
            const png = Buffer.from(encode.default([{name:'IHDR', data:new Uint8Array(13)}, {name:'IEND', data:new Uint8Array()}]));
            assert.equal(JSON.parse(parser.read(parser.write(png, '{"name":"Native"}'))).name, 'Native');
            assert.equal(typeof card.getCharaCardV2, 'function');
            assert.equal(new validator.TavernCardValidator({name:'x', description:'', scenario:'', first_mes:'', mes_example:''}).validate(), 1);
            assert.equal(typeof router.router, 'function');
            assert.equal(typeof byaf.ByafParser, 'function');
            assert.equal(typeof charx.CharXParser, 'function');
        `, url('util.js'), config, root, url('archive-utils.ts'), url('png/encode.ts'),
        url('character-card-parser.ts'), url('endpoints/character-card-v2.ts'),
        url('validator/TavernCardValidator.ts'), url('endpoints/characters.js'), url('byaf.js'), url('charx.js')], {
            encoding: 'utf8', timeout: 10_000,
        });
        expect({ status: result.status, stderr: result.status === 0 ? '' : result.stderr })
            .toEqual({ status: 0, stderr: '' });
    });

    test('extractFileFromZipBuffer finds the requested archive entry through both modules', async () => {
        const archiveBuffer = await createZipBuffer([
            { name: '__MACOSX/ignored/card.json', data: '{"ignored":true}' },
            { name: 'folder/card.json', data: '{"name":"card"}' },
        ]);

        const directResult = await extractFileFromZipBuffer(archiveBuffer, 'card.json');
        const utilResult = await extractFileFromZipBufferViaUtil(archiveBuffer, 'card.json');

        expect(directResult?.toString()).toBe('{"name":"card"}');
        expect(utilResult?.toString()).toBe('{"name":"card"}');
    });

    test('extractFilesFromZipBuffer normalizes targets and rejects traversal entries', async () => {
        const archiveBuffer = await createZipBuffer([
            { name: './sprites/happy.png', data: pngBuffer },
            { name: 'sprites/angry.png', data: Buffer.from('angry') },
            { name: '../sprites/escape.png', data: Buffer.from('escape') },
        ]);

        const directResult = await extractFilesFromZipBuffer(archiveBuffer, [
            './sprites/happy.png',
            'sprites/angry.png',
            '../sprites/escape.png',
        ]);
        const utilResult = await extractFilesFromZipBufferViaUtil(archiveBuffer, [
            './sprites/happy.png',
            'sprites/angry.png',
            '../sprites/escape.png',
        ]);

        expect([...directResult.keys()]).toEqual(['sprites/happy.png', 'sprites/angry.png']);
        expect([...utilResult.keys()]).toEqual(['sprites/happy.png', 'sprites/angry.png']);
        expect(directResult.get('sprites/happy.png')).toEqual(pngBuffer);
        expect(utilResult.get('sprites/angry.png')?.toString()).toBe('angry');
    });

    test('getImageBuffers returns only image entries through both modules', async () => {
        const archivePath = await createZipFile([
            { name: '__MACOSX/ignored.png', data: pngBuffer },
            { name: 'sprites/happy.png', data: pngBuffer },
            { name: 'sprites/notes.txt', data: Buffer.from('hello') },
        ]);

        const directResult = await getImageBuffers(archivePath);
        const utilResult = await getImageBuffersViaUtil(archivePath);

        expect(directResult).toHaveLength(1);
        expect(directResult[0][0]).toBe('happy.png');
        expect(directResult[0][1]).toEqual(pngBuffer);
        expect(utilResult).toEqual(directResult);
    });
});
