/**
 * i18n bridge for React surfaces.
 *
 * The legacy shell owns locale data (public/scripts/i18n.js): it loads the
 * locale JSON, translates `data-i18n` elements via applyLocale + a
 * MutationObserver, and exposes t/translate/getCurrentLocale through
 * SillyTavern.getContext(). React code must NOT import i18n.js directly —
 * the workspace bundle would inline a second module instance with its own
 * (empty) localeData. This module resolves the live functions through the
 * global context instead.
 *
 * Static markup keeps using data-i18n attributes (the observer translates
 * them). Use t/translate for programmatic strings (computed labels, toast
 * text, props that cannot carry data-i18n).
 *
 * Locale switching reloads the page, so no subscription is needed.
 */

import { useEffect, useReducer } from 'react';

/** @type {{ t: Function, translate: Function, getCurrentLocale: Function } | null} */
let cached = null;

function resolveI18n() {
    if (cached) {
        return cached;
    }
    const ctx = globalThis.SillyTavern?.getContext?.();
    if (typeof ctx?.translate === 'function' && typeof ctx?.t === 'function' && typeof ctx?.getCurrentLocale === 'function') {
        cached = {
            t: ctx.t.bind(ctx),
            translate: ctx.translate.bind(ctx),
            getCurrentLocale: ctx.getCurrentLocale.bind(ctx),
        };
    }
    return cached;
}

/**
 * Translates a given key or text. Falls back to the source text when the
 * legacy context is unavailable (early mounts, tests).
 * @param {string} text
 * @param {string?} [key]
 * @returns {string}
 */
export function translate(text, key = null) {
    const i18n = resolveI18n();
    return i18n ? i18n.translate(text, key) : text;
}

/**
 * Template-literal translation with ${n} placeholders, matching the legacy
 * t`...` semantics. Falls back to plain interpolation when unavailable.
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {string}
 */
export function t(strings, ...values) {
    const i18n = resolveI18n();
    if (i18n) {
        return i18n.t(strings, ...values);
    }
    return strings.reduce((result, str, i) => result + str + (values[i] !== undefined ? String(values[i]) : ''), '');
}

/** Current locale id (e.g. 'zh-cn'); falls back to navigator.language/'en'. */
export function getCurrentLocale() {
    const i18n = resolveI18n();
    return i18n ? i18n.getCurrentLocale() : String(globalThis.navigator?.language || 'en').toLowerCase();
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

/** Test hook: drop the cached function refs. */
export function resetI18nBridgeForTests() {
    cached = null;
}
