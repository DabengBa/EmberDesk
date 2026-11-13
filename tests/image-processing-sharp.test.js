import { describe, expect, test } from '@jest/globals';
import sharp from 'sharp';
import extract from 'png-chunks-extract';
import encode from '../src/png/encode.js';
import { read, write } from '../src/character-card-parser.js';
import { AVATAR_HEIGHT, AVATAR_WIDTH } from '../src/constants.js';
import { avatarToPng, avatarToPngSized, imageToPng, thumbnailImage } from '../src/image-processing.js';
import { makeAnimatedImages } from './helpers/animated-image-fixtures.js';
import PNGtext from 'png-chunk-text';

// A bottom-up 24-bit BMP, red on the left and blue on the right.
function bmpFixture() {
    const bmp = Buffer.alloc(70);
    bmp.write('BM');
    bmp.writeUInt32LE(bmp.length, 2);
    bmp.writeUInt32LE(54, 10);
    bmp.writeUInt32LE(40, 14);
    bmp.writeInt32LE(2, 18);
    bmp.writeInt32LE(2, 22);
    bmp.writeUInt16LE(1, 26);
    bmp.writeUInt16LE(24, 28);
    bmp.writeUInt32LE(16, 34);
    for (const offset of [54, 62]) {
        bmp.set([0, 0, 255, 255, 0, 0], offset);
    }
    return bmp;
}

describe('production image conversion', () => {
    test('decodes existing BMP avatars without swapping red and blue', async () => {
        const png = await imageToPng(bmpFixture());
        const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        expect([info.width, info.height]).toEqual([2, 2]);
        expect([...data.subarray(0, 6)]).toEqual([255, 0, 0, 0, 0, 255]);
    });

    test('applies crop and requested avatar dimensions and writes readable card metadata', async () => {
        const png = await avatarToPng(bmpFixture(), { x: 0, y: 0, width: 1, height: 2, want_resize: true });
        const metadata = await sharp(png).metadata();
        expect([metadata.width, metadata.height]).toEqual([AVATAR_WIDTH, AVATAR_HEIGHT]);
        const pixel = await sharp(png).removeAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
        expect([...pixel]).toEqual([255, 0, 0]);
        const card = write(png, JSON.stringify({ name: 'Avatar', data: { name: 'Avatar' } }));
        expect(JSON.parse(read(card))).toMatchObject({ name: 'Avatar', data: { name: 'Avatar' } });
    });

    test('without requested resize crop keeps its dimensions', async () => {
        const png = await avatarToPng(bmpFixture(), { x: 1, y: 0, width: 1, height: 2, want_resize: false });
        const metadata = await sharp(png).metadata();
        expect([metadata.width, metadata.height]).toEqual([1, 2]);
    });

    test.each(['png', 'jpeg', 'webp', 'gif', 'tiff', 'avif'])('converts supported %s input to PNG', async format => {
        const input = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#15a040' } }).toFormat(format).toBuffer();
        expect(await sharp(await imageToPng(input)).metadata()).toMatchObject({ format: 'png', width: 4, height: 3 });
    });

    test('GIF avatar conversion uses the first frame', async () => {
        const frames = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
        const animation = await sharp(frames, { raw: { width: 1, height: 2, channels: 4, pageHeight: 1 } }).gif().toBuffer();
        const png = await avatarToPng(animation);
        expect(await sharp(png).metadata()).toMatchObject({ width: 1, height: 1 });
        expect([...await sharp(png).removeAlpha().raw().toBuffer()]).toEqual([255, 0, 0]);
    });

    test('thumbnail has original aspect ratio and configured dimensions and formats', async () => {
        const jpeg = await thumbnailImage(bmpFixture(), { width: 96, height: 144, format: 'jpg', quality: 85 });
        expect(jpeg.aspectRatio).toBe(1);
        expect(await sharp(jpeg.buffer).metadata()).toMatchObject({ format: 'jpeg', width: 96, height: 144 });
        const png = await thumbnailImage(bmpFixture(), { width: 96, height: 144, format: 'png', quality: 95 });
        expect(await sharp(png.buffer).metadata()).toMatchObject({ format: 'png', width: 96, height: 144 });
    });

    test.each([0, 128, 255])('JPEG thumbnail preserves source RGB at alpha %i', async alpha => {
        const png = await sharp(Buffer.from([255, 0, 0, alpha]), { raw: { width: 1, height: 1, channels: 4 } }).png().toBuffer();
        const { buffer } = await thumbnailImage(png, { width: 8, height: 8, format: 'jpg', quality: 100 });
        const pixel = await sharp(buffer).extract({ left: 3, top: 3, width: 1, height: 1 }).raw().toBuffer();
        expect(pixel[0]).toBeGreaterThanOrEqual(250);
        expect(pixel[1]).toBeLessThanOrEqual(3);
        expect(pixel[2]).toBeLessThanOrEqual(3);
    });

    test('PNG thumbnails retain alpha', async () => {
        const png = await sharp(Buffer.from([255, 0, 0, 128]), { raw: { width: 1, height: 1, channels: 4 } }).png().toBuffer();
        const { buffer } = await thumbnailImage(png, { width: 1, height: 1, format: 'png', quality: 85 });
        expect([...await sharp(buffer).raw().toBuffer()]).toEqual([255, 0, 0, 128]);
    });

    test('avatar upscale keeps transparency and renders a transparent-to-blue transition', async () => {
        const row = [255, 0, 0, 0, 0, 0, 255, 255];
        const png = await sharp(Buffer.from([...row, ...row]), { raw: { width: 2, height: 2, channels: 4 } }).png().toBuffer();
        const result = await avatarToPngSized(png, 3, 3);
        const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
        expect(info).toMatchObject({ width: 3, height: 3, channels: 4, hasAlpha: true });
        expect(data[3]).toBe(0);
        expect(data[7]).toBeGreaterThan(0);
        expect(data[7]).toBeLessThan(data[11]);
        expect(data[11]).toBeGreaterThan(200);
        // Compare visible output on white, not the undefined RGB of transparent pixels.
        const visible = await sharp(result).flatten({ background: '#ffffff' }).raw().toBuffer();
        expect([...visible.subarray(0, 3)]).toEqual([255, 255, 255]);
        expect(visible[3]).toBeGreaterThan(190);
        expect(visible[4]).toBeGreaterThan(190);
        expect(visible[5]).toBeGreaterThan(245);
        expect(visible[6]).toBeLessThan(60);
        expect(visible[7]).toBeLessThan(60);
        expect(visible[8]).toBeGreaterThan(245);
    });

    test('rejects unsupported and corrupt inputs rather than reporting success', async () => {
        await expect(imageToPng(Buffer.from('not an image'))).rejects.toThrow();
    });

    test('does not silently add SVG input support to character imports', async () => {
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>');
        await expect(imageToPng(svg)).rejects.toThrow(/unsupported/i);
    });

    test('does not silently flatten animated WebP when processing an avatar', async () => {
        const frames = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
        const animation = await sharp(frames, { raw: { width: 1, height: 2, channels: 4, pageHeight: 1 } }).webp().toBuffer();
        expect((await sharp(animation, { animated: true }).metadata()).pages).toBe(2);
        await expect(avatarToPng(animation)).rejects.toThrow(/animated/i);
    });

    test('detects PNG animation control chunks before converting an avatar', async () => {
        const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ff0000' } }).png().toBuffer();
        const chunks = extract(png);
        chunks.splice(1, 0, { name: 'acTL', data: Buffer.from([0, 0, 0, 2, 0, 0, 0, 0]) });
        await expect(avatarToPng(Buffer.from(encode(chunks)))).rejects.toThrow(/animated/i);
    });

    test('real two-frame APNG and WebP are not flattened; GIF decodes the first frame', async () => {
        const { apng, gif, webp } = await makeAnimatedImages();
        expect(extract(apng).filter(chunk => chunk.name === 'fcTL')).toHaveLength(2);
        expect(extract(apng).some(chunk => chunk.name === 'fdAT')).toBe(true);
        expect((await sharp(gif, { animated: true }).metadata()).pages).toBe(2);
        expect((await sharp(webp, { animated: true }).metadata()).pages).toBe(2);
        await expect(avatarToPng(apng)).rejects.toThrow(/animated/i);
        await expect(avatarToPng(webp)).rejects.toThrow(/animated/i);
        const png = await avatarToPng(gif);
        expect([...await sharp(png).removeAlpha().raw().toBuffer()]).toEqual(Array(4).fill([255, 0, 0]).flat());
    });

    test('rewrites chara and ccv3 metadata without losing the image or accumulating stale cards', async () => {
        const original = await imageToPng(bmpFixture());
        const first = write(original, JSON.stringify({ spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Before' } }));
        const updated = write(first, JSON.stringify({ spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'After' } }));
        const text = extract(updated).filter(chunk => chunk.name === 'tEXt').map(chunk => PNGtext.decode(chunk.data));
        expect(text.map(chunk => chunk.keyword).sort()).toEqual(['ccv3', 'chara']);
        const decoded = Object.fromEntries(text.map(chunk => [chunk.keyword, JSON.parse(Buffer.from(chunk.text, 'base64').toString('utf8'))]));
        expect(decoded.chara).toMatchObject({ spec: 'chara_card_v2', data: { name: 'After' } });
        expect(decoded.ccv3).toMatchObject({ spec: 'chara_card_v3', spec_version: '3.0', data: { name: 'After' } });
        expect(JSON.parse(read(updated))).toEqual(decoded.ccv3);
        expect(await sharp(updated).removeAlpha().raw().toBuffer()).toEqual(await sharp(original).removeAlpha().raw().toBuffer());
    });

    test('applies JPEG EXIF orientation before avatar crop and thumbnail aspect calculation', async () => {
        const jpeg = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#ff0000' } })
            .jpeg().withMetadata({ orientation: 6 }).toBuffer();
        const png = await avatarToPng(jpeg);
        expect(await sharp(png).metadata()).toMatchObject({ width: 2, height: 3 });
        const cropped = await avatarToPng(jpeg, { x: 0, y: 2, width: 2, height: 1, want_resize: false });
        expect(await sharp(cropped).metadata()).toMatchObject({ width: 2, height: 1 });
        const result = await thumbnailImage(jpeg, { width: 96, height: 144, format: 'jpg', quality: 85 });
        expect(result.aspectRatio).toBe(2 / 3);
    });
});
