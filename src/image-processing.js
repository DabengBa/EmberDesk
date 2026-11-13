import fs from 'node:fs';
import sharp from 'sharp';
import { decode as decodeBmp } from 'bmp-ts';
import { AVATAR_HEIGHT, AVATAR_WIDTH } from './constants.js';

// Keep the same pixel limit sharp uses for its native decoders. The legacy
// BMP decoder allocates before sharp sees the image, so check its header first.
const MAX_INPUT_PIXELS = 268402689;

function hasSupportedSignature(buffer) {
    if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return true;
    if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return true;
    if (['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) return true;
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return true;
    if (buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 42, 0])) || buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0, 42]))) return true;
    if (buffer.length >= 16 && buffer.toString('ascii', 4, 8) === 'ftyp') {
        const end = Math.min(buffer.readUInt32BE(0), buffer.length);
        for (let offset = 8; offset + 4 <= end; offset += 4) {
            if (['avif', 'avis'].includes(buffer.toString('ascii', offset, offset + 4))) return true;
        }
    }
    return false;
}

function isAnimatedContainer(buffer) {
    if (buffer.length >= 21 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 16) === 'WEBPVP8X') {
        return Boolean(buffer[20] & 2);
    }
    if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
    for (let offset = 8; offset + 12 <= buffer.length;) {
        const length = buffer.readUInt32BE(offset);
        if (length > buffer.length - offset - 12) return false;
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        if (type === 'acTL') return true;
        if (type === 'IEND') return false;
        offset += length + 12;
    }
    return false;
}

function imageInput(input, preserveAnimation = false) {
    const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
    if (preserveAnimation && isAnimatedContainer(buffer)) {
        throw new Error('Animated PNG and WebP cannot be flattened during avatar processing');
    }
    if (buffer.length < 2 || buffer.toString('ascii', 0, 2) !== 'BM') {
        if (!hasSupportedSignature(buffer)) throw new Error('Unsupported image format');
        return sharp(buffer).autoOrient();
    }

    if (buffer.length < 26) throw new Error('Invalid BMP header');
    const width = buffer.readInt32LE(18);
    const height = Math.abs(buffer.readInt32LE(22));
    if (width <= 0 || height <= 0 || width * height > MAX_INPUT_PIXELS) {
        throw new Error('Invalid BMP dimensions');
    }

    // Jimp's former BMP codec uses bmp-ts and converts ABGR to opaque RGBA.
    const decoded = decodeBmp(buffer);
    const data = decoded.data;
    for (let i = 0; i < data.length; i += 4) {
        const blue = data[i + 1];
        const green = data[i + 2];
        const red = data[i + 3];
        data[i] = red;
        data[i + 1] = green;
        data[i + 2] = blue;
        data[i + 3] = 255;
    }
    return sharp(data, { raw: { width: decoded.width, height: decoded.height, channels: 4 } });
}

export async function imageToPng(input) {
    return imageInput(input, true).png().toBuffer();
}

export async function avatarToPngSized(input, width, height) {
    return imageInput(input, true).resize(width, height, { fit: 'cover' }).png().toBuffer();
}

export async function avatarToPng(input, crop) {
    const image = imageInput(input, true);
    if (crop && [crop.x, crop.y, crop.width, crop.height].every(value => typeof value === 'number')) {
        image.extract({ left: Math.round(crop.x), top: Math.round(crop.y), width: Math.round(crop.width), height: Math.round(crop.height) });
        if (crop.want_resize) image.resize(AVATAR_WIDTH, AVATAR_HEIGHT, { fit: 'cover' });
    }
    return image.png().toBuffer();
}

export async function thumbnailImage(input, { width, height, format, quality }) {
    // A caller's animation hint or short header probe must never allow sharp
    // to silently flatten an animated container at the decode boundary.
    let image = imageInput(input, true);
    const metadata = await image.metadata();
    const { width: originalWidth, height: originalHeight } = metadata.autoOrient ?? metadata;
    const aspectRatio = originalHeight > 0 ? originalWidth / originalHeight : 1;
    // Remove alpha in a separate pipeline before resize: libvips otherwise
    // premultiplies RGB (and loses fully transparent colors) while resizing.
    if (format !== 'png' && metadata.hasAlpha) {
        image = sharp(await image.removeAlpha().png().toBuffer());
    }
    image.resize(width, height, { fit: 'cover' });
    const buffer = format === 'png' ? await image.png().toBuffer() : await image.jpeg({ quality }).toBuffer();
    return { buffer, aspectRatio };
}
