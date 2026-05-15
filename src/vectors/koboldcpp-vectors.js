import fetch from 'node-fetch';
import urlJoin from 'url-join';
import { trimV1 } from '../util.js';

/**
 * Gets the vector for the given text from KoboldCpp
 * @param {string[]} texts - The array of texts to get the vectors for
 * @param {string} apiUrl - The API URL
 * @param {import('../users.js').UserDirectoryList} directories - The directories object for the user
 * @returns {Promise<number[][]>} - The array of vectors for the texts
 */
export async function getKoboldCppBatchVector(texts, apiUrl, directories) {
    const url = new URL(urlJoin(trimV1(apiUrl), '/v1/embeddings'));

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: texts }),
    });

    if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`KoboldCpp: Failed to get vector for text: ${response.statusText} ${responseText}`);
    }

    /** @type {any} */
    const data = await response.json();

    if (!Array.isArray(data?.data)) {
        throw new Error('API response was not an array');
    }

    data.data.sort((a, b) => a.index - b.index);

    return data.data.map(x => x.embedding);
}

/**
 * Gets the vector for the given text from KoboldCpp
 * @param {string} text - The text to get the vector for
 * @param {string} apiUrl - The API URL
 * @param {import('../users.js').UserDirectoryList} directories - The directories object for the user
 * @returns {Promise<number[]>} - The vector for the text
 */
export async function getKoboldCppVector(text, apiUrl, directories) {
    const vectors = await getKoboldCppBatchVector([text], apiUrl, directories);
    return vectors[0];
}
