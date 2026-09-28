// Compatibility stub for the retired Author's Note feature.
// The active feature (floating prompt UI, /note commands, authorsNote macros)
// is removed; this module keeps only the symbols first-party code still imports.
// '2_floating_prompt' remains the extension-prompt slot used as the injection
// vehicle for World Info AN-position entries and persona TOP_AN/BOTTOM_AN.

export const NOTE_MODULE_NAME = '2_floating_prompt'; // <= Deliberate, for sorting lower than memory

/** @deprecated Author's Note is retired; AN-position WI entries now always inject. */
export var shouldWIAddPrompt = false;

export const metadata_keys = {
    prompt: 'note_prompt',
    interval: 'note_interval',
    depth: 'note_depth',
    position: 'note_position',
    role: 'note_role',
};
