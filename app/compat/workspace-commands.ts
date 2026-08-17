export type CommandResult = Promise<unknown> | unknown;

export type WorkspaceShellSlotKey =
    | 'characterLibrary'
    | 'worldInfo'
    | 'backgroundLibrary'
    | 'extensionsHost'
    | 'groupChats'
    | 'characterAuthoring';

export type WorkspaceDockPanelKind =
    | 'aiConfig'
    | 'advancedFormatting'
    | 'characterLibrary'
    | 'worldInfo'
    | 'backgroundLibrary'
    | 'extensionsHost'
    | 'settings'
    | 'characterAuthoring';

export interface WorkspaceShellCommands {
    openAIConfig(): CommandResult;
    openFormatting(): CommandResult;
    openCharacterLibrary(): CommandResult;
    openWorldInfo(): CommandResult;
    openBackgrounds(): CommandResult;
    openExtensions(): CommandResult;
    openSettings(): CommandResult;
    openGroupChats(): CommandResult;
    openCharacterAuthoring(): CommandResult;
    activateWorkspaceShellSlot(slotKey: WorkspaceShellSlotKey): CommandResult;
    deactivateWorkspaceShellSlot(slotKey: WorkspaceShellSlotKey): CommandResult;
    closeWorkspacePanel(kind: WorkspaceDockPanelKind): CommandResult;
    setWorkspaceShellSlotPinned(slotKey: WorkspaceShellSlotKey, pinned: boolean): CommandResult;
}

export type MainChatGenerationKind = 'submitComposer' | 'continueLast' | 'retryGeneration' | 'swipeLeft' | 'swipeRight';

export interface MainChatGenerationCommand {
    kind: MainChatGenerationKind;
    messageId?: number;
}

export interface MainChatMessageActionsCommand {
    kind: 'open' | 'close';
    messageId?: number;
}

export interface MainChatCommands {
    openCharacterLibrary(): CommandResult;
    loadMoreMessages(messagesToLoad?: number | null): CommandResult;
    loadMoreUntilMessage(anchorMessageId: string): CommandResult;
    setSlashVisibleOwner(enabled: boolean): CommandResult;
    selectSlashAutocompleteOption(index: number): CommandResult;
    startMessageEdit(messageId: number): CommandResult;
    updateMessageEdit(messageId: number, text: string): CommandResult;
    commitMessageEdit(messageId: number): CommandResult;
    cancelMessageEdit(messageId: number): CommandResult;
    setMessageReasoningOpen(messageId: number, open: boolean): CommandResult;
    copyMessageReasoning(messageId: number): CommandResult;
    startMessageReasoningEdit(messageId: number): CommandResult;
    updateMessageReasoningEdit(messageId: number, text: string): CommandResult;
    commitMessageReasoningEdit(messageId: number): CommandResult;
    cancelMessageReasoningEdit(messageId: number): CommandResult;
    deleteMessageReasoning(messageId: number): CommandResult;
    collapseAllMessageReasoning(): CommandResult;
    copyMessage(messageId: number): CommandResult;
    duplicateMessage(messageId: number): CommandResult;
    deleteMessage(messageId: number): CommandResult;
    moveMessage(messageId: number, direction: 'up' | 'down'): CommandResult;
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
    expandLegacyEntry(uid: string): CommandResult;
    updateEntryFields(uid: string, fields: Record<string, unknown>): CommandResult;
    clearSelectedEntry(): CommandResult;
    toggleActivationRules(open: boolean): CommandResult;
}

export type BackgroundSource = 'global' | 'chat';

export interface BackgroundLibraryCommands {
    applyBackgroundFilter(filterQuery: string): CommandResult;
    applyBackgroundSort(sortValue: string): CommandResult;
    uploadBackground(source: BackgroundSource): CommandResult;
    selectBackground(id: string, source: BackgroundSource): CommandResult;
    lockBackground(): CommandResult;
    unlockBackground(): CommandResult;
    autoBackground(): CommandResult;
    refreshBackgrounds(): CommandResult;
    renameBackground(id: string, nextName: string, source: BackgroundSource): CommandResult;
    deleteBackground(id: string, source: BackgroundSource, deleteFromServer: boolean): CommandResult;
    enterFolder(folderId: string): CommandResult;
    exitFolder(): CommandResult;
}

export interface ExtensionsHostCommands {
    toggleNotifyUpdates(): CommandResult;
    openManageExtensions(): CommandResult;
    openInstallExtension(): CommandResult;
    updateExtrasApiUrl(url: string): CommandResult;
    updateExtrasApiKey(apiKey: string): CommandResult;
    connectExtrasApi(): CommandResult;
    toggleAutoconnect(enabled?: boolean): CommandResult;
    ensureExtensionCompatibilitySlots(owner: string): CommandResult;
    retryDeferredExtensions(): CommandResult;
}

export type AuthoringKind = 'characterAuthoring' | 'groupAuthoring';

export interface AuthoringCommands {
    saveCharacterAuthoring?(payload: Record<string, unknown>): CommandResult;
    saveGroupAuthoring?(payload: Record<string, unknown>): CommandResult;
    cancelAuthoring?(kind: AuthoringKind): CommandResult;
    deleteAuthoring?(kind: AuthoringKind): CommandResult;
    duplicateAuthoring?(kind: AuthoringKind): CommandResult;
    exportAuthoring?(payload?: Record<string, unknown>): CommandResult;
    openWorldInfo?(payload?: Record<string, unknown>): CommandResult;
    openAlternateGreetings?(payload?: Record<string, unknown>): CommandResult;
}

export type WorkspacePanelCommands =
    | WorkspaceShellCommands
    | MainChatCommands
    | WorldInfoCommands
    | BackgroundLibraryCommands
    | ExtensionsHostCommands
    | AuthoringCommands;
