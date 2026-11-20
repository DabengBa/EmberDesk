import { Buffer } from 'node:buffer';

export function encode(keyword: string, text: string): { name: string; data: Buffer } {
    if (keyword.length > 79 || !/^[\x01-\xFF]+$/.test(keyword) || !/^[\x01-\xFF]+$/.test(text)) {
        throw new Error('Invalid PNG tEXt keyword or content');
    }
    return { name: 'tEXt', data: Buffer.from(`${keyword}\0${text}`, 'latin1') };
}

export function decode(data: Buffer): { keyword: string; text: string } {
    const separator = data.indexOf(0);
    if (separator === -1) {
        return { keyword: data.toString('latin1'), text: '' };
    }
    if (data.indexOf(0, separator + 1) !== -1) {
        throw new Error('Invalid NULL character found. 0x00 character is not permitted in tEXt content');
    }
    return { keyword: data.toString('latin1', 0, separator), text: data.toString('latin1', separator + 1) };
}
