import { expect, test } from '@jest/globals';
import { Buffer } from 'node:buffer';
import { extractImageData, read, write } from '../src/character-card-parser.ts';

// A one-pixel PNG from public/img/__transparent.png with known chunk CRCs.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('rewrites card metadata without changing image bytes and reads ccv3 first', () => {
    const oldCard = write(png, JSON.stringify({ name: 'Old' }));
    const card = write(oldCard, JSON.stringify({ name: '新角色' }));

    expect(JSON.parse(read(card))).toEqual({ name: '新角色', spec: 'chara_card_v3', spec_version: '3.0' });
    expect(extractImageData(oldCard)).toEqual(png);
    expect(extractImageData(card)).toEqual(png);
});

test('rejects an invalid signature, a damaged IDAT, and a missing IEND', () => {
    const badSignature = Buffer.from(png);
    badSignature[0] = 0;
    const badIdat = Buffer.from(png);
    badIdat[badIdat.indexOf('IDAT') + 4] ^= 1;

    expect(() => extractImageData(badSignature)).toThrow(/header/i);
    expect(() => extractImageData(badIdat)).toThrow(/CRC.*IDAT/i);
    expect(() => extractImageData(png.subarray(0, -12))).toThrow(/IEND/);
});
