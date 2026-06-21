export class CharacterLibraryFetchError extends Error {
    constructor(response, data) {
        super(`Failed to fetch characters: ${response.status} ${response.statusText}`);
        this.name = 'CharacterLibraryFetchError';
        this.status = response.status;
        this.statusText = response.statusText;
        this.data = data;
    }
}

export async function parseCharacterLibraryFetchResponse(response) {
    if (response.ok) {
        return response.json();
    }

    const data = await response.json().catch(() => null);
    throw new CharacterLibraryFetchError(response, data);
}

export function getCharacterLibraryFetchErrorData(error) {
    return error instanceof CharacterLibraryFetchError ? error.data : null;
}

export function hasCharacterLibraryPayloadChanged(currentCharacters, nextCharacters) {
    return JSON.stringify(currentCharacters) !== JSON.stringify(nextCharacters);
}
