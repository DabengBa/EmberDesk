// Indirection keeps command callers independent of the shell handler graph.
let commands;

export function installWorkspaceInteractionCommands(value) {
    commands = value;
}

export function runHistoryRowCommand(...args) { return commands.runHistoryRowCommand(...args); }

export function runDialoguePopupCommand(...args) { return commands.runDialoguePopupCommand(...args); }
export function runDeleteMessageCommand(...args) { return commands.runDeleteMessageCommand(...args); }
