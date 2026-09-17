/**
 * Leaf-level pure utilities with zero module dependencies.
 * Safe to import from domain modules without pulling the utils.js graph.
 */

/**
 * cyrb53 (c) 2018 bryc ({@link https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js|github.com/bryc})
 * License: Public domain (or MIT if needed). Attribution appreciated.
 * A fast and simple 53-bit string hash function with decent collision resistance.
 * Largely inspired by MurmurHash2/3, but with a focus on speed/simplicity.
 * @param {string} str The string to hash.
 * @param {number} [seed=0] The seed to use for the hash.
 * @returns {number} The hash code.
 */
export function getStringHash(str, seed = 0) {
    if (typeof str !== 'string') {
        return 0;
    }

    let h1 = 0xdeadbeef ^ seed,
        h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Sets a value in a nested object at the given dot-separated path.
 * @param {object} obj Object to set the value on
 * @param {string} path Dot-separated key path (e.g. "data.extensions.myKey")
 * @param {any} value The value to set
 */
export function setValueByPath(obj, path, value) {
    const keyParts = path.split('.');
    let currentObject = obj;

    for (let i = 0; i < keyParts.length - 1; i++) {
        const part = keyParts[i];

        if (!Object.hasOwn(currentObject, part)) {
            currentObject[part] = {};
        }

        currentObject = currentObject[part];
    }

    currentObject[keyParts[keyParts.length - 1]] = value;
}

/**
 * Generates a stable id for an option from its text/value.
 * @param {string|object} option Option or option text
 * @returns {string} Option id
 */
export function getOptionId(option) {
    return String(getStringHash(option));
}
