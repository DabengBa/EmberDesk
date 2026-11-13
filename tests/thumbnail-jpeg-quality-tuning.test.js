import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { USER_DIRECTORY_TEMPLATE } from '../src/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const tempRoots = [];

function makeDirectories(prefix) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);

    const directories = {};
    for (const [key, relativePath] of Object.entries(USER_DIRECTORY_TEMPLATE)) {
        directories[key] = key === 'root' ? root : path.join(root, relativePath);
        fs.mkdirSync(directories[key], { recursive: true });
    }

    return directories;
}

function getOriginalDirectory(directories, type) {
    switch (type) {
        case 'bg':
            return directories.backgrounds;
        case 'avatar':
            return directories.characters;
        default:
            throw new Error(`Unsupported thumbnail type: ${type}`);
    }
}

async function runGenerationScenario({ type = 'avatar', format = 'jpg', quality } = {}) {
    jest.resetModules();

    const config = { format, quality };
    const mockThumbnailImage = jest.fn(async (_input, options) => ({
        aspectRatio: 4 / 3,
        buffer: Buffer.from(JSON.stringify(options)),
    }));

    jest.unstable_mockModule('../src/util.js', () => ({
        getConfigValue: (key, defaultValue = null) => {
            switch (key) {
                case 'thumbnails.enabled':
                    return true;
                case 'thumbnails.quality':
                    return config.quality ?? defaultValue;
                case 'thumbnails.format':
                    return config.format ?? defaultValue;
                default:
                    return defaultValue;
            }
        },
        invalidateFirefoxCache: () => {},
    }));

    jest.unstable_mockModule('../src/express-common.js', () => ({
        isFirefox: () => false,
    }));

    jest.unstable_mockModule('../src/image-processing.js', () => ({ thumbnailImage: mockThumbnailImage }));

    jest.unstable_mockModule('write-file-atomic', () => ({
        sync: (targetPath, buffer) => fs.writeFileSync(targetPath, buffer),
    }));

    const { generateThumbnail } = await import('../src/endpoints/thumbnails.js');

    const directories = makeDirectories('emberdesk-thumbnail-quality-');
    const originalDirectory = getOriginalDirectory(directories, type);
    const fileName = 'fixture.bmp';
    fs.writeFileSync(path.join(originalDirectory, fileName), Buffer.from('fixture'));

    const result = await generateThumbnail(directories, type, fileName, true, false);
    const outputBuffer = result.path ? fs.readFileSync(result.path) : null;

    return {
        result,
        outputBuffer,
        mockThumbnailImage,
    };
}

afterEach(() => {
    while (tempRoots.length > 0) {
        const root = tempRoots.pop();
        fs.rmSync(root, { recursive: true, force: true });
    }

    jest.resetModules();
});

describe('thumbnail jpeg quality tuning', () => {
    test('default config ships thumbnail quality 85', () => {
        const configSource = fs.readFileSync(path.join(repoRoot, 'default/config.yaml'), 'utf8');

        expect(configSource).toMatch(/# JPG thumbnail quality \(0-100\)\s+quality:\s*85/);
        expect(configSource).not.toMatch(/dimensions:.*['\"]bg['\"]/);
    });

    test.each(['avatar'])('jpg mode uses quality 85 for new %s thumbnails', async (type) => {
        const { result, outputBuffer, mockThumbnailImage } = await runGenerationScenario({
            type,
            format: 'jpg',
            quality: 85,
        });

        expect(result.path).toBeTruthy();
        expect(mockThumbnailImage).toHaveBeenCalledWith(expect.any(Buffer), { width: 96, height: 144, format: 'jpg', quality: 85 });

        expect(outputBuffer).toEqual(Buffer.from(JSON.stringify({
            width: 96, height: 144, format: 'jpg', quality: 85,
        })));
    });

    test('retired background thumbnail generation is rejected', async () => {
        await expect(runGenerationScenario({ type: 'bg' })).rejects.toThrow('Invalid thumbnail type');
    });

    test('existing explicit quality 95 remains untouched as an override', async () => {
        const { mockThumbnailImage } = await runGenerationScenario({
            type: 'avatar',
            format: 'jpg',
            quality: 95,
        });

        expect(mockThumbnailImage).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ format: 'jpg', quality: 95 }));
    });

    test('missing quality key uses the runtime fallback 85', async () => {
        const { mockThumbnailImage } = await runGenerationScenario({
            type: 'avatar',
            format: 'jpg',
        });

        expect(mockThumbnailImage).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ format: 'jpg', quality: 85 }));
    });

    test('png mode ignores jpeg quality settings', async () => {
        const { mockThumbnailImage, outputBuffer } = await runGenerationScenario({
            type: 'avatar',
            format: 'png',
            quality: 95,
        });

        expect(mockThumbnailImage).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ format: 'png', quality: 95 }));
        expect(outputBuffer).toEqual(Buffer.from(JSON.stringify({
            width: 96, height: 144, format: 'png', quality: 95,
        })));
    });
});
