import { afterEach, describe, expect, test } from '@jest/globals';
import archiver from 'archiver';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
        const archive = archiver('zip');
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
    const archive = archiver('zip');

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
