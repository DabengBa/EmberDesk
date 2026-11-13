import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, jest, test } from '@jest/globals';
import sharp from 'sharp';
import extract from 'png-chunks-extract';
import PNGtext from 'png-chunk-text';
import encode from '../src/png/encode.js';
import { write as writeCard } from '../src/character-card-parser.js';
import { makeAnimatedImages, makeBmp } from './helpers/animated-image-fixtures.js';

jest.unstable_mockModule('../src/util.js', () => ({
    getConfigValue: (_key, fallback) => fallback,
    invalidateFirefoxCache: () => {},
}));
jest.unstable_mockModule('../src/express-common.js', () => ({ isFirefox: () => false }));

const { generateThumbnail } = await import('../src/endpoints/thumbnails.js');
const roots = [];

function directories() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sharp-thumbnail-'));
    roots.push(root);
    const result = { characters: path.join(root, 'characters'), thumbnailsAvatar: path.join(root, 'thumbs') };
    Object.values(result).forEach(dir => fs.mkdirSync(dir));
    return result;
}

afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

test('real thumbnail pipeline atomically writes decodable JPEG and reports original geometry', async () => {
    const dirs = directories();
    const original = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#ff0000' } }).png().toBuffer();
    fs.writeFileSync(path.join(dirs.characters, 'avatar.png'), original);
    const result = await generateThumbnail(dirs, 'avatar', 'avatar.png', true, false);
    expect(result).toMatchObject({ path: path.join(dirs.thumbnailsAvatar, 'avatar.png'), aspectRatio: 2, resolution: 96 * 144 });    expect(await sharp(fs.readFileSync(result.path)).metadata()).toMatchObject({ format: 'jpeg', width: 96, height: 144 });
    expect(fs.readdirSync(dirs.thumbnailsAvatar)).toEqual(['avatar.png']);
});

test('animated WebP bypasses thumbnail generation and preserves the source', async () => {
    const dirs = directories();
    const frames = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
    const original = await sharp(frames, { raw: { width: 1, height: 2, channels: 4, pageHeight: 1 } }).webp().toBuffer();
    fs.writeFileSync(path.join(dirs.characters, 'animated.webp'), original);
    expect(await generateThumbnail(dirs, 'avatar', 'animated.webp', true)).toEqual({ path: null, aspectRatio: null, resolution: null });
    expect(fs.readFileSync(path.join(dirs.characters, 'animated.webp'))).toEqual(original);
    expect(fs.readdirSync(dirs.thumbnailsAvatar)).toEqual([]);
});

test.each(['apng', 'gif', 'webp'])('real two-frame %s bypasses thumbnail generation and preserves its bytes', async format => {
    const dirs = directories();
    const original = (await makeAnimatedImages())[format];
    const file = format === 'apng' ? 'animated.png' : `animated.${format}`;
    fs.writeFileSync(path.join(dirs.characters, file), original);
    expect(await generateThumbnail(dirs, 'avatar', file, true)).toEqual({ path: null, aspectRatio: null, resolution: null });
    expect(fs.readFileSync(path.join(dirs.characters, file))).toEqual(original);
    expect(fs.readdirSync(dirs.thumbnailsAvatar)).toEqual([]);
});

test('card pregeneration and reread never flatten APNG with a late animation chunk', async () => {
    const dirs = directories();
    const chunks = extract((await makeAnimatedImages()).apng);
    chunks.splice(1, 0, PNGtext.encode('comment', 'x'.repeat(300)));
    const card = writeCard(Buffer.from(encode(chunks)), JSON.stringify({ spec: 'chara_card_v2', data: { name: 'Late animation' } }));
    expect(card.indexOf('acTL')).toBeGreaterThan(200);
    const originalPath = path.join(dirs.characters, 'late.png');
    fs.writeFileSync(originalPath, card);
    const pregen = await generateThumbnail(dirs, 'avatar', 'late.png', true, null);
    expect(pregen.path).toBeNull();
    expect(fs.readdirSync(dirs.thumbnailsAvatar)).toEqual([]);
    expect((await generateThumbnail(dirs, 'avatar', 'late.png')).path).toBeNull();
    expect(fs.readFileSync(originalPath)).toEqual(card);
    expect(fs.readdirSync(dirs.thumbnailsAvatar)).toEqual([]);
});

test('existing static cache for late APNG is still returned by the cache-hit path', async () => {
    const dirs = directories();
    const chunks = extract((await makeAnimatedImages()).apng);
    chunks.splice(1, 0, PNGtext.encode('comment', 'x'.repeat(300)));
    const card = writeCard(Buffer.from(encode(chunks)), JSON.stringify({ spec: 'chara_card_v2', data: { name: 'Late animation' } }));
    expect(card.indexOf('acTL')).toBeGreaterThan(200);
    fs.writeFileSync(path.join(dirs.characters, 'late.png'), card);
    const cache = path.join(dirs.thumbnailsAvatar, 'late.png');
    const jpeg = await sharp({ create: { width: 96, height: 144, channels: 3, background: '#f00' } }).jpeg().toBuffer();
    fs.writeFileSync(cache, jpeg);
    // Document the existing cache limitation; this does not assert desirable animation behavior.
    expect((await generateThumbnail(dirs, 'avatar', 'late.png')).path).toBe(cache);
    expect(fs.readFileSync(cache)).toEqual(jpeg);
});

test('animation text in a static PNG is not mistaken for an animation chunk', async () => {
    const dirs = directories();
    const original = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#f00' } }).png().toBuffer();
    const chunks = extract(original);
    chunks.splice(1, 0, PNGtext.encode('comment', 'x'.repeat(300) + 'acTL'));
    fs.writeFileSync(path.join(dirs.characters, 'static.png'), Buffer.from(encode(chunks)));
    const result = await generateThumbnail(dirs, 'avatar', 'static.png', true, null);
    expect(result.path).toBe(path.join(dirs.thumbnailsAvatar, 'static.png'));
    expect(await sharp(fs.readFileSync(result.path)).metadata()).toMatchObject({ format: 'jpeg', width: 96, height: 144 });
});
test('a malformed oversized PNG chunk is rejected without creating a cached thumbnail', async () => {
    const dirs = directories();
    const original = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#f00' } }).png().toBuffer();
    original.writeUInt32BE(0xffffffff, 8);
    fs.writeFileSync(path.join(dirs.characters, 'broken.png'), original);
    expect((await generateThumbnail(dirs, 'avatar', 'broken.png', true, null)).path).toBeNull();
    expect(fs.readdirSync(dirs.thumbnailsAvatar)).toEqual([]);
});

test('BMP thumbnail follows the real filesystem pipeline', async () => {
    const dirs = directories();
    fs.writeFileSync(path.join(dirs.characters, 'avatar.bmp'), makeBmp());
    const result = await generateThumbnail(dirs, 'avatar', 'avatar.bmp', true);
    expect(result).toMatchObject({ path: path.join(dirs.thumbnailsAvatar, 'avatar.bmp'), aspectRatio: 1 });
    expect(await sharp(fs.readFileSync(result.path)).metadata()).toMatchObject({ format: 'jpeg', width: 96, height: 144 });
});
