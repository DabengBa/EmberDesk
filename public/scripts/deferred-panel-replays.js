export function buildWorldInfoReplayState({
    worldNames = [],
    selectedWorldInfo = [],
    editorSelectedName = '',
} = {}) {
    return {
        globalOptions: worldNames.map((name, index) => ({
            text: name,
            value: String(index),
            selected: selectedWorldInfo.includes(name),
        })),
        editorOptions: worldNames.map((name, index) => ({
            text: name,
            value: String(index),
            selected: editorSelectedName === name,
        })),
    };
}

export function getCharacterCardTagId(tagId) {
    return String(tagId);
}
