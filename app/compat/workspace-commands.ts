export type CommandResult = Promise<unknown> | unknown;

export type WorkspaceShellSlotKey =
    | 'characterLibrary'
    | 'worldInfo'
    | 'characterAuthoring'
    | 'regex'
    | 'promptManager'
    | 'settings';

export type WorkspaceDockPanelKind =
    | 'characterLibrary'
    | 'worldInfo'
    | 'settings'
    | 'characterAuthoring'
    | 'regex'
    | 'promptManager';

export interface WorkspaceShellCommands {
    openCharacterLibrary(): CommandResult;
    openWorldInfo(): CommandResult;
    openSettings(): CommandResult;
    openCharacterAuthoring(): CommandResult;
    openRegex(): CommandResult;
    openPromptManager(): CommandResult;
    activateWorkspaceShellSlot(slotKey: WorkspaceShellSlotKey): CommandResult;
    deactivateWorkspaceShellSlot(slotKey: WorkspaceShellSlotKey): CommandResult;
    closeWorkspacePanel(kind: WorkspaceDockPanelKind): CommandResult;
    setWorkspaceShellSlotPinned(slotKey: WorkspaceShellSlotKey, pinned: boolean): CommandResult;
}

export type MainChatGenerationKind = 'submitComposer' | 'regenerate';

export interface MainChatGenerationCommand {
    kind: MainChatGenerationKind;
    messageId?: number;
}

export interface MainChatMessageActionsCommand {
    kind: 'open' | 'close';
    messageId?: string;
}

export interface MainChatCommands {
    selectGreeting(index: number, characterId: string, chatId: string): Promise<boolean> | boolean;
    openCharacterLibrary(): CommandResult;
    loadMoreMessages(messagesToLoad?: number | null): CommandResult;
    loadMoreUntilMessage(anchorMessageId: string): CommandResult;
    setSlashVisibleOwner(enabled: boolean): CommandResult;
    selectSlashAutocompleteOption(index: number): CommandResult;
    startMessageEdit(messageUid: string): CommandResult;
    updateMessageEdit(messageUid: string, text: string): CommandResult;
    commitMessageEdit(messageUid: string): CommandResult;
    cancelMessageEdit(messageUid: string): CommandResult;
    setMessageReasoningOpen(messageUid: string, open: boolean): CommandResult;
    copyMessageReasoning(messageUid: string): CommandResult;
    startMessageReasoningEdit(messageUid: string): CommandResult;
    updateMessageReasoningEdit(messageUid: string, text: string): CommandResult;
    commitMessageReasoningEdit(messageUid: string): CommandResult;
    cancelMessageReasoningEdit(messageUid: string): CommandResult;
    deleteMessageReasoning(messageUid: string): CommandResult;
    collapseAllMessageReasoning(): CommandResult;
    copyMessage(messageUid: string): CommandResult;
    duplicateMessage(messageUid: string): CommandResult;
    deleteMessage(messageUid: string): CommandResult;
    moveMessage(messageUid: string, direction: 'up' | 'down'): CommandResult;
    triggerVisibleGeneration(command: MainChatGenerationCommand): CommandResult;
    stopVisibleGeneration(): CommandResult;
    toggleMessageActionsShell(command: MainChatMessageActionsCommand): CommandResult;
}

export interface WorldInfoCommands {
    selectWorld(worldIndex: string): CommandResult;
    applySearchQuery(searchQuery: string): CommandResult;
    applySortOption(sortValue: string): CommandResult;
    setGlobalWorlds(names: string[]): CommandResult;
    createEntry(): CommandResult;
    createWorld(): CommandResult;
    importWorld(): CommandResult;
    exportWorld(): CommandResult;
    renameWorld(): CommandResult;
    duplicateWorld(): CommandResult;
    deleteWorld(): CommandResult;
    refreshWorld(): CommandResult;
    openEntry(uid: string): CommandResult;
    updateEntryFields(uid: string, fields: Record<string, unknown>, worldName?: string): CommandResult;
    clearSelectedEntry(): CommandResult;
    setScanDepth(depth: number): CommandResult;
    backfillMemos(): CommandResult;
    applyCurrentSorting(): CommandResult;
    bulkDeleteEntries(uids: string[]): CommandResult;
    bulkSetEntriesEnabled(uids: string[], enabled: boolean): CommandResult;
    moveOrCopyEntry(uid: string): CommandResult;
}

export type AuthoringKind = 'characterAuthoring';

export interface AuthoringCommands {
    setExternalMediaAllowed?(payload: { characterId: string; allowed: boolean }): CommandResult;
    saveCharacterAuthoring?(payload: Record<string, unknown>): CommandResult;
    cancelAuthoring?(kind: AuthoringKind): CommandResult;
    deleteAuthoring?(kind: AuthoringKind): CommandResult;
    duplicateAuthoring?(kind: AuthoringKind): CommandResult;
    exportAuthoring?(payload?: Record<string, unknown>): CommandResult;
    openWorldInfo?(payload?: Record<string, unknown>): CommandResult;
    openBoundWorldInfo?(payload?: Record<string, unknown>): CommandResult;
    createBoundWorldInfo?(payload?: Record<string, unknown>): CommandResult;
    setAuxWorldBooks?(payload?: Record<string, unknown>): CommandResult;
    openAlternateGreetings?(payload?: Record<string, unknown>): CommandResult;
    runManagementAction?(payload: Record<string, unknown>): CommandResult;
    previewTextReplace?(payload: Record<string, unknown>): CommandResult;
    applyTextReplace?(payload: Record<string, unknown>): CommandResult;
    closeTextReplace?(payload?: Record<string, unknown>): CommandResult;
    queryReplaceIntentOutcome?(payload: { sessionId: string; intentId: string }): Promise<'committed' | 'unknown_partial' | 'not_committed'>;
}

export type WorkspacePanelCommands =
    | WorkspaceShellCommands
    | MainChatCommands
    | WorldInfoCommands
    | AuthoringCommands;
