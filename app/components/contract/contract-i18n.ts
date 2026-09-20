/**
 * Shared i18n helpers for the Astryx contract adapters.
 *
 * Contract elements historically carried `data-i18n` specs like
 * `[title]Send a message;[aria-label]Send message`. Astryx components own
 * their tooltip surface (`tooltip` prop — not a DOM `title` attribute), so
 * adapters translate tooltip text via `useTranslated` and only emit
 * `data-i18n` specs for attributes that still exist on the rendered DOM
 * (textContent, aria-label, placeholder).
 */

export interface I18nSpecParts {
    /** Bare key — translates the element's textContent. */
    text?: string;
    /** `[aria-label]key` spec. */
    ariaLabel?: string;
    /** `[placeholder]key` spec. */
    placeholder?: string;
}

/**
 * Builds a `data-i18n` attribute spec for the DOM attributes a migrated
 * element still owns. `title` is intentionally absent: Astryx tooltips are
 * rendered through the `tooltip` prop, not the `title` attribute — emitting
 * a `[title]` spec would make the legacy observer set a real `title`
 * attribute and produce a double tooltip.
 */
export function i18nSpec(parts: I18nSpecParts): string | undefined {
    const specs: string[] = [];
    if (parts.ariaLabel) {
        specs.push(`[aria-label]${parts.ariaLabel}`);
    }
    if (parts.placeholder) {
        specs.push(`[placeholder]${parts.placeholder}`);
    }
    if (parts.text) {
        specs.push(parts.text);
    }
    return specs.length > 0 ? specs.join(';') : undefined;
}
