export interface RuntimeChatSnapshot {
    readonly id: string | null;
    readonly characterId: string | null;
    readonly title: string;
}

export interface RuntimeGenerationSnapshot {
    readonly phase: string;
}

export interface RuntimeProviderSnapshot {
    readonly status: string;
}

export interface RuntimeSnapshot {
    readonly chat: RuntimeChatSnapshot;
    readonly generation: RuntimeGenerationSnapshot;
    readonly provider: RuntimeProviderSnapshot;
}

export interface SettingsDocument {
    readonly [key: string]: unknown;
}

export interface RuntimeCommands {
    submitMessage(input: string): Promise<void>;
    stopGeneration(): void;
    retryMessage(messageId: string): Promise<void>;
    loadEarlier(anchorId?: string): Promise<void>;
    saveSettings(settings: SettingsDocument): Promise<void>;
    openWorkspaceDrawer(hostId: string): Promise<void>;
    connectProvider(): Promise<void>;
    testProviderConnection(): Promise<void>;
}

export interface RuntimePort {
    getSnapshot(): RuntimeSnapshot;
    subscribe(listener: () => void): () => void;
    commands: RuntimeCommands;
}
