import type { ProviderConnectionInput, ProviderConnectionResult } from '@/lib/provider-connection-service';

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
    loadEarlier(anchorId?: string): Promise<void>;
    saveSettings(settings: SettingsDocument): Promise<void>;
    connectProvider(input: ProviderConnectionInput): Promise<ProviderConnectionResult>;
    testProviderConnection(input: ProviderConnectionInput): Promise<ProviderConnectionResult>;
}

export interface RuntimePort {
    getSnapshot(): RuntimeSnapshot;
    getChatCompletionSettings(): SettingsDocument;
    subscribe(listener: () => void): () => void;
    commands: RuntimeCommands;
}
