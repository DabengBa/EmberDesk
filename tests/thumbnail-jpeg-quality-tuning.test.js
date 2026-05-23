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
        case 'persona':
            return directories.avatars;
        default:
            throw new Error(`Unsupported thumbnail type: ${type}`);
    }
}

async function runGenerationScenario({ type = 'avatar', format = 'jpg', quality } = {}) {
    jest.resetModules();

    const config = { format, quality };
    const mockResize = jest.fn();
    const mockCover = jest.fn();
    const mockGetBuffer = jest.fn(async (mime, options) => Buffer.from(JSON.stringify({
        mime,
        quality: options?.quality ?? null,
        jpegColorSpace: options?.jpegColorSpace ?? null,
    })));

    const fakeThumbImage = {
        resize: mockResize,
        cover: mockCover,
        getBuffer: mockGetBuffer,
    };

    const fakeImage = {
        bitmap: { width: 320, height: 240 },
        clone: jest.fn(() => fakeThumbImage),
    };

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

    jest.unstable_mockModule('../src/jimp.js', () => ({
        Jimp: {
            read: jest.fn(async () => fakeImage),
        },
        JimpMime: {
            png: 'image/png',
            jpeg: 'image/jpeg',
        },
    }));

    jest.unstable_mockModule('../src/endpoints/image-metadata.js', () => ({
        getThumbnailResolution: () => 13824,
        isAnimatedWebP: () => false,
        isAnimatedApng: () => false,
        thumbnailDimensions: {
            bg: [160, 90],
            avatar: [96, 144],
            persona: [96, 144],
        },
    }));

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
        mockResize,
        mockCover,
        mockGetBuffer,
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
    });

    test.each(['avatar', 'persona', 'bg'])('jpg mode uses quality 85 for new %s thumbnails', async (type) => {
        const { result, outputBuffer, mockCover, mockResize, mockGetBuffer } = await runGenerationScenario({
            type,
            format: 'jpg',
            quality: 85,
        });

        expect(result.path).toBeTruthy();
        expect(mockGetBuffer).toHaveBeenCalledWith('image/jpeg', { quality: 85, jpegColorSpace: 'ycbcr' });

        if (type === 'bg') {
            expect(mockResize).toHaveBeenCalledTimes(1);
            expect(mockCover).not.toHaveBeenCalled();
        } else {
            expect(mockCover).toHaveBeenCalledWith({ w: 96, h: 144 });
            expect(mockResize).not.toHaveBeenCalled();
        }

        expect(outputBuffer).toEqual(Buffer.from(JSON.stringify({
            mime: 'image/jpeg',
            quality: 85,
            jpegColorSpace: 'ycbcr',
        })));
    });

    test('existing explicit quality 95 remains untouched as an override', async () => {
        const { mockGetBuffer } = await runGenerationScenario({
            type: 'avatar',
            format: 'jpg',
            quality: 95,
        });

        expect(mockGetBuffer).toHaveBeenCalledWith('image/jpeg', { quality: 95, jpegColorSpace: 'ycbcr' });
    });

    test('missing quality key uses the runtime fallback 85', async () => {
        const { mockGetBuffer } = await runGenerationScenario({
            type: 'avatar',
            format: 'jpg',
        });

        expect(mockGetBuffer).toHaveBeenCalledWith('image/jpeg', { quality: 85, jpegColorSpace: 'ycbcr' });
    });

    test('png mode ignores jpeg quality settings', async () => {
        const { mockGetBuffer, outputBuffer } = await runGenerationScenario({
            type: 'avatar',
            format: 'png',
            quality: 95,
        });

        expect(mockGetBuffer).toHaveBeenCalledWith('image/png');
        expect(outputBuffer).toEqual(Buffer.from(JSON.stringify({
            mime: 'image/png',
            quality: null,
            jpegColorSpace: null,
        })));
    });
});
