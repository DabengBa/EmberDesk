export type WorldInfoSelectorSnapshot = {
    worldNames: readonly string[];
    globalActiveNames: readonly string[];
    editorWorldName: string;
};

export type WorldInfoSelectorRuntime = {
    getSnapshot(): WorldInfoSelectorSnapshot;
    subscribe(listener: () => void): () => void;
    setGlobalActiveNames(names: string[]): void;
    selectEditorName(name: string): Promise<void>;
};
