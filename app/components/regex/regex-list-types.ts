export type RegexScriptType = 0 | 1 | 2;
export type RegexRuleRef = { groupKey: string; id: string };
export type RegexListGroup = { type: RegexScriptType; key: string; available: boolean; rules: { id: string; scriptName: string; disabled: boolean }[] };
export type RegexListSnapshot = { groups: RegexListGroup[] };
export type RegexListAction =
    | { kind: 'enable'; refs: RegexRuleRef[]; enabled: boolean; authorize?: boolean }
    | { kind: 'reorder'; groupKey: string; ids: string[] }
    | { kind: 'edit' | 'export' | 'delete'; refs: RegexRuleRef[] }
    | { kind: 'move'; refs: RegexRuleRef[]; toType: RegexScriptType };
export type RegexListBridge = {
    getSnapshot(): RegexListSnapshot;
    subscribe(listener: () => void): () => void;
    execute(action: RegexListAction): Promise<'saved' | 'cancelled' | 'unchanged'>;
};
