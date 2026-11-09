const operationVersions = new WeakMap();
const pendingOperations = new WeakMap();

// Capture the local lifecycle clock before issuing a rename request. The
// destination is not known until the response arrives.
export function captureCharacterAuthorizationClock(settings) {
    return new Map(operationVersions.get(settings) ?? []);
}

export function characterAuthorizationChangedSince(settings, characterId, clock) {
    return (operationVersions.get(settings)?.get(characterId)?.version ?? 0) !== (clock.get(characterId)?.version ?? 0)
        || (pendingOperations.get(settings)?.get(characterId) ?? 0) > 0;
}

export function hasPendingCharacterAuthorizationRevoke(settings, characterId) {
    return (pendingOperations.get(settings)?.get(characterId) ?? 0) > 0
        && operationVersions.get(settings)?.get(characterId)?.allowed === false;
}

export function isCharacterAuthorizationRetired(settings, characterId) {
    return operationVersions.get(settings)?.get(characterId)?.retired === true;
}

// A snapshot received for an already pending operation becomes its rollback
// baseline, while its optimistic state remains visible until it settles.
export function reconcileCharacterAuthorizationBaseline(settings, key, reported, clock, excludedIds) {
    for (const [characterId, current] of operationVersions.get(settings) ?? []) {
        if (!excludedIds.includes(characterId) && current.baseline && current.version === clock.get(characterId)?.version
            && (pendingOperations.get(settings)?.get(characterId) ?? 0) > 0) {
            current.baseline[key] = reported.includes(characterId);
        }
    }
}

function versionsFor(settings) {
    let versions = operationVersions.get(settings);
    if (!versions) operationVersions.set(settings, versions = new Map());
    return versions;
}

/**
 * Retire in-flight authorization requests for an avatar whose identity is
 * changing (rename, delete, or canonical identity replacement). A later
 * failure of one of those requests must never restore the old avatar key.
 */
export function invalidateCharacterExternalMediaAuthorization(settings, characterId, { newCharacterId = null } = {}) {
    if (!settings || typeof settings !== 'object' || typeof characterId !== 'string' || !characterId) return false;
    const versions = versionsFor(settings);
    const current = versions.get(characterId);
    versions.set(characterId, {
        version: (current?.version ?? 0) + 1,
        newCharacterId: typeof newCharacterId === 'string' && newCharacterId ? newCharacterId : null,
        successorVersion: versions.get(newCharacterId)?.version ?? 0,
        retired: true,
    });
    return true;
}

/** Update the historical per-avatar allow list, ignoring stale authoring controls. */
export async function setCharacterExternalMediaAuthorization({ settings, characterId, canonicalId, allowed, getCurrentCharacterId, getCurrentCharacterCanonicalId, save, refresh }) {
    if (!settings || typeof settings !== 'object' || !characterId || characterId !== getCurrentCharacterId() || typeof allowed !== 'boolean') return false;
    const versions = versionsFor(settings);
    const version = (versions.get(characterId)?.version ?? 0) + 1;
    const baseline = {
        external_media_allowed_overrides: Array.isArray(settings.external_media_allowed_overrides) && settings.external_media_allowed_overrides.includes(characterId),
        external_media_forbidden_overrides: Array.isArray(settings.external_media_forbidden_overrides) && settings.external_media_forbidden_overrides.includes(characterId),
    };
    versions.set(characterId, { version, newCharacterId: null, retired: false, allowed, baseline });
    let pending = pendingOperations.get(settings);
    if (!pending) pendingOperations.set(settings, pending = new Map());
    pending.set(characterId, (pending.get(characterId) ?? 0) + 1);
    const identity = typeof canonicalId === 'string' && canonicalId && typeof getCurrentCharacterCanonicalId === 'function'
        ? canonicalId
        : null;
    const identityChanged = () => identity !== null && getCurrentCharacterCanonicalId(characterId) !== identity;
    const previousAllowed = settings.external_media_allowed_overrides;
    const previousForbidden = settings.external_media_forbidden_overrides;
    const previousIdentities = settings.external_media_authorization_canonical_ids;
    const hadPreviousIdentity = previousIdentities && typeof previousIdentities === 'object' && !Array.isArray(previousIdentities) && Object.hasOwn(previousIdentities, characterId);
    const previousIdentity = hadPreviousIdentity ? previousIdentities[characterId] : undefined;
    const grants = Array.isArray(settings.external_media_allowed_overrides) ? settings.external_media_allowed_overrides : [];
    settings.external_media_allowed_overrides = grants.filter(id => id !== characterId);
    if (allowed) settings.external_media_allowed_overrides.push(characterId);
    if (Array.isArray(settings.external_media_forbidden_overrides)) {
        settings.external_media_forbidden_overrides = settings.external_media_forbidden_overrides.filter(id => id !== characterId);
    }
    const identities = settings.external_media_authorization_canonical_ids;
    if (identities && typeof identities === 'object' && !Array.isArray(identities)) {
        if (allowed && identity) identities[characterId] = identity;
        else delete identities[characterId];
    } else if (allowed && identity) {
        settings.external_media_authorization_canonical_ids = { [characterId]: identity };
    }
    // Attach a handler immediately: the save can reject while refresh runs,
    // and the rejection is awaited later.
    const pendingSave = Promise.resolve().then(() => save({ characterId, canonicalId: identity, allowed }));
    pendingSave.catch(() => {});
    try {
        await refresh();
    } catch {
        // Rendering refresh is best-effort; it must not fail the save.
    }
    try {
        await pendingSave;
        return true;
    } catch (error) {
        const current = versions.get(characterId);
        const superseded = (current?.version ?? 0) > version;
        const retired = current?.retired === true;
        // A route that reports the identity as gone (404) retires the request
        // exactly like a local rename/delete does.
        const identityChangedNow = identityChanged() || error?.retireAuthorization === true;
        const movedTo = typeof current?.newCharacterId === 'string' ? current.newCharacterId : null;
        // A later operation owns this avatar key, even when this older
        // request reports that its canonical identity is gone. In particular,
        // a recreated character can legitimately reuse the same avatar name;
        // an old 404 must not clear the replacement's successful grant.
        if (error?.retireAuthorization === true && !superseded) {
            invalidateCharacterExternalMediaAuthorization(settings, characterId);
            for (const key of ['external_media_allowed_overrides', 'external_media_forbidden_overrides']) {
                if (Array.isArray(settings[key])) settings[key] = settings[key].filter(id => id !== characterId);
            }
        } else if (superseded && !retired) {
            // The newer operation's optimistic state and eventual response
            // are authoritative for this avatar key.
        } else if (!retired && !identityChangedNow) {
            // Nothing replaced this request: roll the optimistic write back.
            for (const key of ['external_media_allowed_overrides', 'external_media_forbidden_overrides']) {
                const overrides = settings[key];
                if (!Array.isArray(overrides)) continue;
                const restored = overrides.filter(id => id !== characterId);
                if (baseline[key]) restored.push(characterId);
                settings[key] = restored;
            }
            const currentIdentities = settings.external_media_authorization_canonical_ids;
            const restoredIdentities = currentIdentities && typeof currentIdentities === 'object' && !Array.isArray(currentIdentities) ? { ...currentIdentities } : {};
            if (hadPreviousIdentity) restoredIdentities[characterId] = previousIdentity;
            else delete restoredIdentities[characterId];
            if (Object.keys(restoredIdentities).length) settings.external_media_authorization_canonical_ids = restoredIdentities;
            else delete settings.external_media_authorization_canonical_ids;
        } else if ((retired || identityChangedNow) && allowed) {
            // A lifecycle change retired this avatar while the request was in
            // flight. Never restore the old avatar key, and undo the optimistic
            // grant at the renamed successor unless the grant predates it.
            // A newer operation merely superseding this one owns the local
            // state and must not be second-guessed here.
            for (const [key, previous] of [['external_media_allowed_overrides', previousAllowed], ['external_media_forbidden_overrides', previousForbidden]]) {
                const overrides = settings[key];
                if (!Array.isArray(overrides)) continue;
                const heldSuccessor = Array.isArray(previous) && previous.includes(movedTo);
                const heldOld = Array.isArray(previous) && previous.includes(characterId);
                settings[key] = overrides.filter(id => {
                    if (id === characterId) return false;
                    if (movedTo && id === movedTo) return (versions.get(movedTo)?.version ?? 0) !== current.successorVersion || heldSuccessor || heldOld;
                    return true;
                });
            }
        }
        try {
            await refresh();
        } catch {
            // Rendering refresh is best-effort; it must not change the result.
        }
        return false;
    } finally {
        const count = pending.get(characterId) - 1;
        if (count) pending.set(characterId, count);
        else pending.delete(characterId);
    }
}
