import sharp from 'sharp';
import extract from 'png-chunks-extract';
import encode from '../../src/png/encode.js';

export async function makeAnimatedImages() {
    const red = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ff0000' } }).png().toBuffer();
    const blue = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#0000ff' } }).png().toBuffer();
    const first = extract(red);
    const second = extract(blue);
    const control = sequence => {
        const bytes = Buffer.alloc(26);
        bytes.writeUInt32BE(sequence, 0);
        bytes.writeUInt32BE(2, 4);
        bytes.writeUInt32BE(2, 8);
        bytes.writeUInt16BE(1, 20);
        bytes.writeUInt16BE(10, 22);
        return bytes;
    };
    const animation = Buffer.alloc(8);
    animation.writeUInt32BE(2, 0);
    const secondFrame = Buffer.concat([Buffer.from([0, 0, 0, 2]), Buffer.concat(second.filter(chunk => chunk.name === 'IDAT').map(chunk => Buffer.from(chunk.data)))]);
    const chunks = [
        first[0],
        { name: 'acTL', data: animation },
        { name: 'fcTL', data: control(0) },
        ...first.slice(1, -1),
        { name: 'fcTL', data: control(1) },
        { name: 'fdAT', data: secondFrame },
        first.at(-1),
    ];
    const frames = Buffer.from([
        ...Array(4).fill([255, 0, 0, 255]).flat(),
        ...Array(4).fill([0, 0, 255, 255]).flat(),
    ]);
    const raw = { width: 2, height: 4, channels: 4, pageHeight: 2 };
    return {
        apng: Buffer.from(encode(chunks)),
        gif: await sharp(frames, { raw }).gif().toBuffer(),
        webp: await sharp(frames, { raw }).webp().toBuffer(),
    };
}

export function makeBmp() {
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
    for (const offset of [54, 62]) bmp.set([0, 0, 255, 255, 0, 0], offset);
    return bmp;
}
