/**
 * Seeded characters reserved for external-media authorization E2E tests.
 *
 * Playwright runs files and tests in parallel against one shared data root, so
 * authorization tests must never share a character: a grant/revoke in one test
 * would otherwise race the persisted state asserted by another. These seeded
 * avatars (dev-character-041.png .. dev-character-047.png) are intentionally
 * not used by any other E2E test. Do not rename or delete them elsewhere.
 */
const FIXTURE_INDEX = {
    staleSettingsSave: 41,
    immediateReload: 42,
    failedAuthorizationRollback: 43,
    renameSource: 44,
    renameTarget: 45,
    scopedAuthorization: 46,
    scopedAuthorizationOther: 47,
};

/** @param {number} index 1-based seeded character number. */
const seededCharacter = index => `Dev Character ${String(index).padStart(3, '0')}`;

export const AUTHORIZATION_FIXTURES = Object.fromEntries(
    Object.entries(FIXTURE_INDEX).map(([key, index]) => [key, seededCharacter(index)]),
);

/** Stable avatar for a seeded character, e.g. dev-character-041.png. */
export const seededAvatar = name => `${name.toLowerCase().replaceAll(' ', '-')}.png`;
