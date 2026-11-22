/**
 * i18n bridge for React surfaces.
 *
 * There is exactly one runtime locale context per page:
 *
 * - Workspace pages load the legacy shell. It owns the locale data
 *   (public/scripts/i18n.js), translates `data-i18n` markup, and exposes
 *   t/translate/getCurrentLocale through the workspace entry. That entry
 *   passes the original native module; bundling it here would create a second
 *   instance with empty locale data.
 * - Standalone pages (/login, /setup, /settings) never load the shell, so
 *   nothing else would provide that context. For those entry points
 *   `initializeUiLocale()` installs the same contract (translate/t/
 *   getCurrentLocale) backed by the same locale JSON, so every surface keeps
 *   reading one authoritative locale without importing shell modules.
 *
 * Static markup keeps using data-i18n attributes (the observer translates
 * them). Use t/translate for programmatic strings (computed labels, toast
 * text, props that cannot carry data-i18n).
 *
 * Locale switching reloads the page, so no subscription is needed.
 */

import { useEffect, useReducer } from 'react';
import { DEFAULT_UI_LOCALE, readStoredUiLocale } from '../../public/scripts/ui-locale.js';

// English ships no resource (source text is the English copy), so only the
// non-English locales are reachable here. Vite rewrites each static import into
// its own chunk; a bundle whose entry never reaches this module (the workspace
// panels resolve the shell context instead) never carries the dictionary.
const localeResources = {
    'zh-cn': () => import('../../public/locales/zh-cn.json'),
};

/** Locale data installed by initializeUiLocale(); null while the shell owns it. */
let standaloneLocaleData = null;
let standaloneLocale = DEFAULT_UI_LOCALE;

function translateWith(data, text, key = null) {
    const translationKey = key || text;
    return data?.[translationKey] ?? text;
}

function tWith(data, strings, values) {
    const template = strings.reduce(
        (result, string, index) => result + string + (values[index] !== undefined ? `\${${index}}` : ''),
        '',
    );
    return translateWith(data, template).replace(/\$\{(\d+)\}/g, (match, index) => (
        values[Number(index)] !== undefined ? String(values[Number(index)]) : match
    ));
}

/**
 * Installs the locale contract for bundles that do not load the legacy shell.
 * Loads the saved locale's resource before the first render so no surface
 * mounts untranslated and then flips. English needs no resource: source text is
 * the English copy.
 * @returns {Promise<void>}
 */
export async function initializeUiLocale() {
    standaloneLocale = readStoredUiLocale();
    const load = localeResources[standaloneLocale];
    if (!load) {
        return;
    }

    try {
        const module = await load();
        standaloneLocaleData = module.default ?? module;
    } catch {
        console.warn(`Locale data for ${standaloneLocale} could not be loaded; falling back to source text.`);
        standaloneLocaleData = null;
    }
}

/** @typedef {Pick<typeof import('../../public/scripts/i18n.js'), 't' | 'translate' | 'getCurrentLocale'>} WorkspaceI18n */
/** @type {WorkspaceI18n | null} */
let workspaceI18n = null;

/** @param {WorkspaceI18n} i18n */
export function installWorkspaceI18n(i18n) {
    workspaceI18n = i18n;
}

/**
 * Translates a given key or text. Falls back to the source text when the
 * legacy context is unavailable (early mounts, tests).
 * @param {string} text
 * @param {string?} [key]
 * @returns {string}
 */
export function translate(text, key = null) {
    if (workspaceI18n) {
        return workspaceI18n.translate(text, key);
    }
    return translateWith(standaloneLocaleData, text, key);
}

/**
 * Template-literal translation with ${n} placeholders, matching the legacy
 * t`...` semantics. Falls back to plain interpolation when unavailable.
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {string}
 */
export function t(strings, ...values) {
    if (workspaceI18n) {
        return workspaceI18n.t(strings, ...values);
    }
    return tWith(standaloneLocaleData, strings, values);
}

/** Current locale id: the shell's when loaded, otherwise the saved selection. */
export function getCurrentLocale() {
    return workspaceI18n ? workspaceI18n.getCurrentLocale() : standaloneLocale;
}

/**
 * Passive re-render on `i18n:applied` (fired by legacy applyLocale) for
 * props that cannot carry `data-i18n` (Astryx `tooltip`, computed strings).
 * Mounts run before initLocales, so a plain translate() call would lock in
 * English; the effect-level subscription re-renders once locale data lands.
 *
 * Deliberately NOT useSyncExternalStore: an urgent sync store update fired
 * from applyLocale (inside the jQuery ready startup chain) tears pending
 * workspace-panel mounts on the shared React root — observed as the
 * main-chat message-actions command bridge silently no-op'ing.
 * @param {string} text
 * @param {string?} [key]
 * @returns {string}
 */
export function useTranslated(text, key = null) {
    const [, bumpLocale] = useReducer(v => v + 1, 0);
    useEffect(() => {
        const handler = () => bumpLocale();
        document.addEventListener('i18n:applied', handler);
        return () => document.removeEventListener('i18n:applied', handler);
    }, []);
    return translate(text, key);
}

/** Test hook: restore the uninitialized locale. */
export function resetI18nBridgeForTests() {
    workspaceI18n = null;
    standaloneLocaleData = null;
    standaloneLocale = DEFAULT_UI_LOCALE;
}
