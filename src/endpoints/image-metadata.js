/**
 * Shared thumbnail geometry and animation-format helpers.
 *
 * The image metadata HTTP service was retired; these pure helpers remain here
 * for avatar and persona thumbnail generation.
 */

import { getConfigValue } from '../util.js';

/**
 * @typedef {'avatar' | 'persona'} ThumbnailType
 */

/** @type {Record<string, number[]>} */
export const thumbnailDimensions = {
    avatar: getConfigValue('thumbnails.dimensions.avatar', [96, 144]),
    persona: getConfigValue('thumbnails.dimensions.persona', [96, 144]),
};

/**
 * Gets the configured resolution for a given thumbnail type.
 * @param {ThumbnailType} type Thumbnail type
 * @returns {number} Resolution (width * height)
 */
export function getThumbnailResolution(type) {
    const dims = thumbnailDimensions[type];
    if (Array.isArray(dims) && dims.length >= 2) {
        return Number(dims[0]) * Number(dims[1]);
    }
    return 0;
}

/**
 * Checks if a buffer contains an animated PNG (APNG) by looking for the 'acTL' chunk.
 * @param {Buffer} buffer The file buffer.
 * @returns {boolean}
 */
export function isAnimatedApng(buffer) {
    return buffer.subarray(0, 200).includes('acTL');
}

/**
 * Checks if a WebP buffer is animated by looking for 'ANIM' or 'ANMF' chunks.
 * @param {Buffer} buffer The WebP file buffer (can be full file or header)
 * @returns {boolean} True if the WebP is animated
 */
export function isAnimatedWebP(buffer) {
    const headerBuffer = buffer.length > 200 ? buffer.subarray(0, 200) : buffer;
    return headerBuffer.includes('ANIM') || headerBuffer.includes('ANMF');
}
