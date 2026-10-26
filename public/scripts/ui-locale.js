/**
 * UI locale authority.
 *
 * One storage key, one supported-locale list, one fallback rule. Lives under
 * `public/scripts/` because that is the only directory the browser shell serves
 * as static assets; both the legacy shell (`public/scripts/i18n.js`) and the
 * React surfaces import this single module, so neither side keeps its own copy
 * of the list or the default.
 */

export const UI_LOCALE_STORAGE_KEY = 'language';
export const DEFAULT_UI_LOCALE = 'zh-cn';

/** @type {{ id: string, label: string }[]} */
export const uiLocaleOptions = [
    { id: 'zh-cn', label: '简体中文' },
    { id: 'en', label: 'English' },
];

/**
 * Resolves a saved language value to a supported locale id. Missing, empty, and
 * unknown values (including languages retired before this contract) fall back
 * to Simplified Chinese.
 * @param {string|null|undefined} language Saved language value
 * @returns {string} Supported locale id
 */
export function resolveUiLocale(language) {
    const normalized = String(language ?? '').trim().toLowerCase();
    return uiLocaleOptions.some(option => option.id === normalized) ? normalized : DEFAULT_UI_LOCALE;
}

/**
 * Reads the saved UI locale.
 * @returns {string} Supported locale id
 */
export function readStoredUiLocale() {
    try {
        return resolveUiLocale(globalThis.localStorage?.getItem(UI_LOCALE_STORAGE_KEY));
    } catch {
        return DEFAULT_UI_LOCALE;
    }
}

/**
 * Persists the UI language and reloads so every surface re-initializes against
 * the new locale data.
 * @param {string} language Locale id
 * @returns {void}
 */
export function setUiLocale(language) {
    localStorage.setItem(UI_LOCALE_STORAGE_KEY, resolveUiLocale(language));
    location.reload();
}
