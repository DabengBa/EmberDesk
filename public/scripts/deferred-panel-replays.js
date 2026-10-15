export function buildWorldInfoReplayState({
    worldNames = [],
    selectedWorldInfo = [],
    editorSelectedName = '',
} = {}) {
    return {
        globalOptions: worldNames.map((name) => ({
            text: name,
            value: name,
            selected: selectedWorldInfo.includes(name),
        })),
        editorOptions: worldNames.map((name) => ({
            text: name,
            value: name,
            selected: editorSelectedName === name,
        })),
    };
}

export function getCharacterCardTagId(tagId) {
    return String(tagId);
}
