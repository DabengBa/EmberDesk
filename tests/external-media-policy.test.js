import { describe, expect, test } from '@jest/globals';
import { isCharacterExternalMediaAllowed, isMediaUrlAllowed } from '../public/scripts/external-media-policy.js';

describe('external media policy', () => {
    const base = 'https://app.example:8443/chat';
    test('compares parsed origins, not string prefixes', () => {
        for (const url of ['/local.png', 'local.png', 'https://app.example:8443/a', 'data:image/png;base64,AA']) {
            expect(isMediaUrlAllowed(url, false, base)).toBe(true);
        }
        for (const url of ['//evil.example/a', 'https://app.example:8443.evil.example/a', 'https://app.example/a', 'javascript:alert(1)', 'http:\\evil.example/x']) {
            expect(isMediaUrlAllowed(url, false, base)).toBe(false);
        }
        expect(isMediaUrlAllowed('https://evil.example/a', true, base)).toBe(true);
    });
    test('requires a matching canonical identity and fails closed on invalid or legacy data', () => {
        expect(isCharacterExternalMediaAllowed({ external_media_allowed_overrides: ['alice.png'] }, 'alice.png')).toBe(false);
        expect(isCharacterExternalMediaAllowed({ external_media_allowed_overrides: ['alice.png'], external_media_authorization_canonical_ids: { 'alice.png': 'id-1' } }, 'alice.png', 'id-1')).toBe(true);
        expect(isCharacterExternalMediaAllowed({ external_media_allowed_overrides: ['alice.png'] }, 'bob.png')).toBe(false);
        expect(isCharacterExternalMediaAllowed({ external_media_allowed_overrides: 'alice.png' }, 'alice.png')).toBe(false);
        expect(isCharacterExternalMediaAllowed({}, null)).toBe(false);
    });
    test('a stale avatar grant cannot authorize a replacement canonical identity', () => {
        const settings = { external_media_allowed_overrides: ['alice.png'] };
        expect(isCharacterExternalMediaAllowed(settings, 'alice.png', 'replacement-id')).toBe(false);
    });
});
