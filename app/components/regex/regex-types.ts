import type { RegexScriptType } from './regex-list-types';

export type RegexScript = { id: string; scriptName: string; findRegex: string; replaceString: string; trimStrings: string[]; disabled: boolean; markdownOnly: boolean; promptOnly: boolean; runOnEdit: boolean; substituteRegex: number; minDepth: number | null; maxDepth: number | null; placement: number[] };
export type RegexEditorHandle = { validate(): boolean; getDraft(): RegexScript };
export type RegexDebugGroup = { key: string; label: string; type?: RegexScriptType; rules: { id: string; name: string; enabled?: boolean; pattern?: string }[] };
export type RegexDebugResult = { steps: { label: string; html: string; id?: string }[]; final: string; finalHtml?: string };
export type RegexDebuggerHandle = { refresh(): void };
export type RegexPresetController = { list(): { presets: { id: string; name: string }[]; selected: string }; select(id: string): unknown; create(): unknown; update(): unknown; apply(): unknown; delete(): unknown; subscribe?(listener: () => void): () => void };
export type RegexToolbar = { openEditor(type: RegexScriptType): unknown; openDebugger(): unknown; importFiles(files: File[]): unknown; setScopedAllowed(value: boolean): unknown; setPresetAllowed(value: boolean): unknown; scopedAllowed: boolean; presetAllowed: boolean; onError(message: string): void };
