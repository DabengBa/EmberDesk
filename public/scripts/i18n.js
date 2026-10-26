import { registerDebugFunction } from './power-user.js';
import { applyI18nTranslations, parseI18nAttributeSpecs } from './i18n-data.js';
import {
    DEFAULT_UI_LOCALE,
    UI_LOCALE_STORAGE_KEY,
    readStoredUiLocale,
    resolveUiLocale,
} from './ui-locale.js';

// The UI locale comes from the saved language selection; Simplified Chinese is
// the installed default and English is the source text.
const storageKey = UI_LOCALE_STORAGE_KEY;
var langs = [
    { lang: 'zh-cn', display: '简体中文' },
    { lang: 'en', display: 'English' },
];
let localeFile = readStoredUiLocale();
// Don't change to let/const! It will break module loading.
var localeData;

/** @type {Set<string>|null} Array of translations keys if they should be tracked - if not tracked then null */
let trackMissingDynamicTranslate = null;

export const getCurrentLocale = () => localeFile;

/**
 * Persists the UI language and reloads so the whole surface (legacy shell and
 * React panels) re-initializes against the same locale data.
 * @param {string} language Locale id
 */
export function chooseLocale(language) {
    localStorage.setItem(storageKey, resolveUiLocale(language));
    location.reload();
}

/**
 * Adds additional localization data to the current locale file.
 * @param {string} localeId Locale ID (must match the current locale to take effect)
 * @param {Record<string, string>} data Localization data to add
 */
export function addLocaleData(localeId, data) {
    if (!localeData) {
        console.warn('Localization data not loaded yet. Additional data will not be added.');
        return;
    }

    if (localeId !== localeFile) {
        console.debug('Ignoring addLocaleData call for different locale', localeId);
        return;
    }

    for (const [key, value] of Object.entries(data)) {
        // Runtime data never overrides locale file translations
        if (!Object.hasOwn(localeData, key)) {
            localeData[key] = value;
        }
    }
}

/**
 * An observer that will check if any new i18n elements are added to the document
 * @type {MutationObserver}
 */
const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE && node instanceof Element) {
                if (node.hasAttribute('data-i18n')) {
                    translateElement(node);
                }
                node.querySelectorAll('[data-i18n]').forEach(element => {
                    translateElement(element);
                });
            }
        });
        if (mutation.attributeName === 'data-i18n' && mutation.target instanceof Element) {
            translateElement(mutation.target);
        }
    });
});

/**
 * Translates a template string with named arguments
 *
 * Uses the template literal with all values replaced by index placeholder for translation key.
 *
 * @example
 * ```js
 * toastr.warning(t`Tag ${tagName} not found.`);
 * ```
 * Should be translated in the translation files as:
 * ```
 * Tag ${0} not found. -> Tag ${0} nicht gefunden.
 * ```
 *
 * @param {TemplateStringsArray} strings - Template strings array
 * @param  {...any} values - Values for placeholders in the template string
 * @returns {string} Translated and formatted string
 */
export function t(strings, ...values) {
    let str = strings.reduce((result, string, i) => result + string + (values[i] !== undefined ? `\${${i}}` : ''), '');
    let translatedStr = translate(str);

    // Replace indexed placeholders with actual values
    return translatedStr.replace(/\$\{(\d+)\}/g, (match, index) => values[index]);
}

/**
 * Translates a given key or text
 *
 * If the translation is based on a key, that one is used to find a possible translation in the translation file.
 * The original text still has to be provided, as that is the default value being returned if no translation is found.
 *
 * For in-code text translation on a format string, using the template literal `t` is preferred.
 *
 * @param {string} text - The text to translate
 * @param {string?} key - The key to use for translation. If not provided, text is used as the key.
 * @returns {string} - The translated text
 */
export function translate(text, key = null) {
    const translationKey = key || text;
    if (translationKey === null || translationKey === undefined) {
        console.trace('WARN: No translation key provided');
        return '';
    }
    if (trackMissingDynamicTranslate && localeData && !Object.hasOwn(localeData, translationKey)) {
        trackMissingDynamicTranslate.add(translationKey);
    }
    // The translation key doubles as the English source text; when the active
    // locale does not define it, the source text is the fallback.
    return localeData?.[translationKey] ?? text;
}

/**
 * Fetches the locale data for the given language.
 * @param {string} language Language code
 * @returns {Promise<Record<string, string>>} Locale data
 */
async function getLocaleData(language) {
    let supportedLang = findLang(language);
    if (!supportedLang) {
        return {};
    }

    const data = await fetch(`./locales/${language}.json`).then(response => {
        if (!response.ok) {
            console.warn(`Locale data not found at ./locales/${language}.json; falling back to source text.`);
            return {};
        }
        return response.json();
    });

    return data;
}

/**
 * Gets a language object for the given language code.
 * @param {string} language Language code
 */
function findLang(language) {
    const supportedLang = langs.find(x => x.lang === language);

    if (!supportedLang) {
        console.warn(`Unsupported language: ${language}`);
    }
    return supportedLang;
}

/**
 * Translates a given element based on its data-i18n attribute.
 * @param {Element} element The element to translate
 */
function translateElement(element) {
    applyI18nTranslations(element, element.getAttribute('data-i18n'), localeData);
}

/**
 * Checks if the given locale has a translation file.
 * @param {string} [locale=null] The locale to check (defaults to the current locale)
 * @returns {boolean} True if the locale is supported
 */
function isSupportedLocale(locale = null) {
    return !!findLang(locale || localeFile);
}

async function getMissingTranslations() {
    /** @type {Array<{key: string, language: string, value: string}>} */
    const missingData = [];

    if (trackMissingDynamicTranslate) {
        missingData.push(...Array.from(trackMissingDynamicTranslate).map(key => ({ key, language: localeFile, value: key })));
    }

    for (const language of langs) {
        const localeData = await getLocaleData(language.lang);
        $(document).find('[data-i18n]').each(function () {
            for (const entry of parseI18nAttributeSpecs($(this).data('i18n'))) {
                const localizedValue = localeData?.[entry.key];
                if (localizedValue || localizedValue === '') {
                    continue;
                }

                if (entry.attributes.length > 0) {
                    const fallbackAttribute = entry.attributes.find(attribute => $(this).attr(attribute) !== undefined) ?? entry.attributes[0];
                    missingData.push({ key: entry.raw, language: language.lang, value: String($(this).attr(fallbackAttribute) ?? '') });
                    continue;
                }

                missingData.push({ key: entry.raw, language: language.lang, value: $(this).text().trim() });
            }
        });
    }

    // Remove duplicates
    const uniqueMissingData = [];
    for (const { key, language, value } of missingData) {
        if (!uniqueMissingData.some(x => x.key === key && x.language === language && x.value === value)) {
            uniqueMissingData.push({ key, language, value });
        }
    }

    // Sort by language, then key
    uniqueMissingData.sort((a, b) => a.language.localeCompare(b.language) || a.key.localeCompare(b.key));

    // Map to { language: { key: value } }
    const missingDataMap = Object.fromEntries(uniqueMissingData.map(({ key, value }) => [key, value]));

    console.log(`Missing Translations (${uniqueMissingData.length}):`);
    console.table(uniqueMissingData);
    console.log(`Full map of missing data (${Object.keys(missingDataMap).length}):`);
    console.log(missingDataMap);

    if (trackMissingDynamicTranslate) {
        const trackMissingDynamicTranslateMap = Object.fromEntries(Array.from(trackMissingDynamicTranslate).map(key => [key, key]));
        console.log(`Dynamic translations missing (${Object.keys(trackMissingDynamicTranslateMap).length}):`);
        console.log(trackMissingDynamicTranslateMap);
    }

    toastr.success(`Found ${uniqueMissingData.length} missing translations. See browser console for details.`);
}

/**
 * Applies localization to a given root element or HTML string.
 * @param {Document|string} root The root element or HTML string to apply localization to
 * @returns {Document|string} Translated root, in the same format as the input (Document or HTML string)
 */
export function applyLocale(root = document) {
    if (!localeData) {
        return root;
    }

    const $root = root instanceof Document ? $(root) : $(new DOMParser().parseFromString(root, 'text/html'));

    //find all the elements with `data-i18n` attribute
    $root.find('[data-i18n]').each(function () {
        translateElement(this);
    });

    if (root !== document) {
        return $root.get(0).body.innerHTML;
    }

    // React surfaces subscribe to this event to re-render programmatic strings,
    // so it must fire even when the active locale has no translation data.
    document.dispatchEvent(new CustomEvent('i18n:applied'));
}

export async function initLocales() {
    localeData = await getLocaleData(localeFile);
    document.documentElement.lang = localeFile;
    applyLocale();

    observer.observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-i18n'],
    });

    if (localStorage.getItem('trackDynamicTranslate') === 'true' && isSupportedLocale()) {
        trackMissingDynamicTranslate = new Set();
    }

    registerDebugFunction('getMissingTranslations', 'Get missing translations',
        'Detects missing localization data in the current locale and dumps the data into the browser console.',
        getMissingTranslations);
    registerDebugFunction('trackDynamicTranslate', 'Track dynamic translation',
        'Toggles tracking of dynamic translations, which will be dumped into the missing translations translations too. ' +
        'This includes things translated via the t`...` function and translate(). It will only track strings translated <b>after</b> this is toggled on, '
        + 'and when they actually pop up, so refreshing the page and opening popups, etc, is needed.',
        () => {
            const isTracking = localStorage.getItem('trackDynamicTranslate') !== 'true';
            localStorage.setItem('trackDynamicTranslate', isTracking ? 'true' : 'false');
            if (isTracking) {
                trackMissingDynamicTranslate = new Set();
                toastr.success('Dynamic translation tracking enabled.');
            } else {
                trackMissingDynamicTranslate = null;
                toastr.info('Dynamic translation tracking disabled.');
            }
        });
    registerDebugFunction('applyLocale', 'Apply locale', 'Reapplies the currently selected locale to the page.', applyLocale);
}
