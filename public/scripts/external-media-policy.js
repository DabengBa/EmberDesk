/** Whether a browser resource URL is allowed by the current character policy. */
export function isMediaUrlAllowed(value, allowExternalMedia = false, baseUrl = globalThis.location?.href ?? 'http://localhost/') {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
        const base = new URL(baseUrl);
        const url = new URL(value, base);
        if (url.protocol === 'data:') return true;
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
        return url.origin === base.origin || allowExternalMedia === true;
    } catch {
        return false;
    }
}

/** A grant applies only to the canonical character that received it. */
export function isCharacterExternalMediaAllowed(settings, characterId, canonicalId = null) {
    if (!characterId || !canonicalId || !Array.isArray(settings?.external_media_allowed_overrides)
        || !settings.external_media_allowed_overrides.includes(characterId)) return false;
    const identities = settings.external_media_authorization_canonical_ids;
    return Boolean(identities && typeof identities === 'object' && !Array.isArray(identities)
        && identities[characterId] === canonicalId);
}
