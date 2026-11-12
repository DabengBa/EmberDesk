/** Shared keyword parsing for the scanner and React editor; no shell or UI dependencies. */
import { getOptionId } from './util/primitives.js';

/**
 * Gets a real regex object from a slash-delimited regex string.
 * Delimiter is `/` and each occurrence inside the regex has to be escaped.
 * Flags are optional and limited to JavaScript's `RegExp` flags (`g`, `i`, `m`, `s`, `u`, `y`).
 * @param {string} input - A delimited regex string
 * @returns {RegExp|null} The regex object, or null if not a valid regex
 */
export function parseRegexFromString(input) {
    const match = input.match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
    if (!match) {
        return null;
    }

    let [, pattern, flags] = match;

    if (pattern.match(/(^|[^\\])\//)) {
        return null;
    }

    pattern = pattern.replace('\\/', '/');

    try {
        return new RegExp(pattern, flags);
    } catch {
        return null;
    }
}

/**
 * Validates if a string is a valid slash-delimited regex.
 * @param {string} input - A delimited regex string
 * @returns {boolean} Whether this would be a valid regex that can be parsed and executed
 */
export function isValidRegex(input) {
    return parseRegexFromString(input) !== null;
}

/**
 * Tokenizer parsing input and splitting it into keywords and regexes.
 * @param {{_type: string, term: string}} input - The typed input
 * @param {{options: object}|undefined} _selection - The selection event object
 * @param {(item: {id: string, text: string}) => void} callback - Callback for each parsed item
 * @returns {{term: string}} - The remaining part that is untokenized in the textbox
 */
export function customTokenizer(input, _selection, callback) {
    let current = input.term;

    let insideRegex = false, regexClosed = false;

    for (let i = 0; i < current.length; i++) {
        const char = current[i];

        if (char === '/' && (i === 0 || current[i - 1] !== '\\')) {
            if (!insideRegex) insideRegex = true;
            else if (!regexClosed) regexClosed = true;
        }

        if (char === ',') {
            const token = current.slice(0, i).trim();

            if (insideRegex && !regexClosed) {
                continue;
            }

            if (token) {
                const isRegex = isValidRegex(token);

                if (token.startsWith('/') && !isRegex) {
                    const tokens = token.split(',').map(x => x.trim());
                    tokens.forEach(x => callback({ id: getOptionId(x), text: x }));
                } else {
                    callback({ id: getOptionId(token), text: token });
                }
            }

            current = current.slice(i + 1);
            insideRegex = false;
            regexClosed = false;
            // The loop increments next; rescan the new first character too.
            i = -1;
        }
    }

    return { term: current };
}

/**
 * Splits a given input string that contains one or more keywords or regexes, separated by commas.
 * @param {string} input - One or multiple keywords or regexes, separated by commas
 * @returns {string[]} An array of keywords and regexes
 */
export function splitKeywordsAndRegexes(input) {
    /** @type {string[]} */
    const keywordsAndRegexes = [];

    const addFindCallback = (item) => {
        keywordsAndRegexes.push(item.text);
    };

    const { term } = customTokenizer({ _type: 'custom_call', term: input }, undefined, addFindCallback);
    const finalTerm = term.trim();
    if (finalTerm) {
        addFindCallback({ id: getOptionId(finalTerm), text: finalTerm });
    }

    return keywordsAndRegexes;
}
