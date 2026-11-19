import { getRequestHeaders } from './request-context.js';

// Targeted patches can load a version when the roster only contains a shallow row.
// Full-form edits must instead retain the version captured when the form was filled.
export async function getCharacterPatchVersion(character) {
    if (typeof character?.canonical_card_version === 'string' && character.canonical_card_version) {
        return character.canonical_card_version;
    }
    const response = await fetch('/api/characters/get', {
        method: 'POST', headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: character.avatar }),
    });
    if (!response.ok) throw new Error(`Failed to load character: ${response.status}`);
    const snapshot = await response.json();
    if (typeof snapshot.canonical_card_version !== 'string' || !snapshot.canonical_card_version) throw new Error('Character version unavailable');
    return snapshot.canonical_card_version;
}
