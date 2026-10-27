export interface ChatMemorySettings {
    enabled: boolean;
    keepTurns: number;
    maxTokens: number;
    role: 'system' | 'assistant' | 'user';
    prompt: string;
    wrap: string;
}

export type ChatMemoryOverrides = { [Key in keyof ChatMemorySettings]?: ChatMemorySettings[Key] | null };

export interface ChatMemoryView {
    settings: ChatMemorySettings;
    globalSettings: ChatMemorySettings;
    overrides: ChatMemoryOverrides;
    turns: {
        key: string;
        index: number;
        pinned: boolean;
        eligible: boolean;
        status: string | null;
        summary: { text: string; status?: string } | null;
        running: boolean;
    }[];
    history: { at: number; action: string; turnKey?: string; status: string; error?: string }[];
    stats: { totalTurns: number; verbatimTurns: number; summarizedTurns: number };
    queueDepth: number;
    running: boolean;
}

export interface ChatMemoryPanelBridge {
    getView(): ChatMemoryView | null;
    subscribe(listener: () => void): () => void;
    updateSettings(overrides: ChatMemoryOverrides): Promise<{ ok: boolean; error?: string }>;
    regenerate(turnKey: string): Promise<{ ok: boolean; error?: string }>;
    retry(turnKey: string): Promise<{ ok: boolean; error?: string }>;
    setPinned(turnKey: string, pinned: boolean): Promise<{ ok: boolean; error?: string }>;
    close(): void;
    onDraftDiscarded(): void;
}
