import { Buffer } from 'node:buffer';
import { crc32 } from 'node:zlib';

const signature = Buffer.from('89504e470d0a1a0a', 'hex');

/** Reads PNG chunks and returns views into the source buffer. */
export default function extract(image: Buffer): Array<{ name: string; data: Buffer }> {
    if (!image.subarray(0, signature.length).equals(signature)) {
        throw new Error('Invalid .png file header');
    }

    const chunks: Array<{ name: string; data: Buffer }> = [];
    for (let offset = signature.length; offset + 8 <= image.length;) {
        const typeStart = offset + 4;
        const dataStart = offset + 8;
        const name = image.toString('latin1', typeStart, dataStart);
        if (chunks.length === 0 && name !== 'IHDR') {
            throw new Error('IHDR header missing');
        }
        // Like the legacy reader, stop at IEND without inspecting its payload or CRC.
        if (name === 'IEND') {
            chunks.push({ name, data: image.subarray(dataStart, dataStart) });
            return chunks;
        }

        const dataEnd = dataStart + image.readUInt32BE(offset);
        if (dataEnd + 4 > image.length) {
            throw new Error(`Truncated PNG chunk: ${name}`);
        }
        if (crc32(image.subarray(typeStart, dataEnd)) !== image.readUInt32BE(dataEnd)) {
            throw new Error(`CRC values for ${name} header do not match, PNG file is likely corrupted`);
        }
        chunks.push({ name, data: image.subarray(dataStart, dataEnd) });
        offset = dataEnd + 4;
    }
    throw new Error('.png file ended prematurely: no IEND header was found');
}
