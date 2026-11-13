import type { ProviderConnectionInput, ProviderConnectionResult } from '@/lib/provider-connection-service';
import type { SettingsWriteOwner } from '@/lib/settings-write-owner';

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
    saveSettings(settings: SettingsDocument, baseline?: SettingsDocument, revision?: number): Promise<void>;
    connectProvider(input: ProviderConnectionInput): Promise<ProviderConnectionResult>;
    testProviderConnection(input: ProviderConnectionInput): Promise<ProviderConnectionResult>;
}

export interface RuntimePort {
    getSettingsWriteOwner?(): SettingsWriteOwner | undefined;
    getSnapshot(): RuntimeSnapshot;
    getChatCompletionSettings(): SettingsDocument;
    getSettingsSnapshot(): SettingsDocument;
    hasSettingsConflict?(): boolean;
    downloadSettingsRecovery?(): void;
    subscribe(listener: () => void): () => void;
    commands: RuntimeCommands;
}
