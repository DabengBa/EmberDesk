import { createToolAction, createToolFormatMessage, ensurePipelineToolBindings, normalizeToolBindings } from '../../public/scripts/tool-bindings-core.js';

export type ToolBinding = {
    id: string; enabled: boolean; name: string; displayName: string; description: string;
    parameters: object; actionBody: string; formatMessageBody: string; stealth: boolean;
};
export type BindingToolRegistration = {
    name: string; displayName: string; description: string; parameters: object; stealth: boolean;
    action: (args: object) => Promise<unknown>;
    formatMessage?: (parameters: object) => Promise<string | null>;
    shouldRegister: () => boolean;
};
export type ToolBindingsPorts = {
    settings: { tool_bindings?: unknown; tool_choice_required?: boolean };
    save: () => void;
    names: () => string[];
    register: (tool: BindingToolRegistration) => void;
    unregister: (name: string) => void;
    ownedNames?: Set<string>;
};
export function createToolBindingsService(ports: ToolBindingsPorts) {
    const owned = ports.ownedNames ?? new Set<string>();
    const listeners = new Set<() => void>();
    const getBindings = (): ToolBinding[] => normalizeToolBindings(ports.settings.tool_bindings) as ToolBinding[];
    const store = (): ToolBinding[] => {
        if (!Array.isArray(ports.settings.tool_bindings)) ports.settings.tool_bindings = [];
        return ports.settings.tool_bindings as ToolBinding[];
    };
    let snapshot = { bindings: getBindings(), forceTool: Boolean(ports.settings.tool_choice_required) };
    function refresh() {
        for (const name of owned) ports.unregister(name);
        owned.clear();
        for (const binding of getBindings()) {
            if (!binding.enabled || ports.names().includes(binding.name)) continue;
            ports.register({
                name: binding.name, displayName: binding.displayName || binding.name,
                description: binding.description, parameters: binding.parameters, stealth: binding.stealth,
                action: createToolAction(binding.actionBody),
                formatMessage: createToolFormatMessage(binding.formatMessageBody) ?? undefined,
                shouldRegister: () => getBindings().some(candidate => candidate.name === binding.name && candidate.enabled),
            });
            owned.add(binding.name);
        }
        snapshot = { bindings: getBindings(), forceTool: Boolean(ports.settings.tool_choice_required) };
        listeners.forEach(listener => listener());
    }
    function save(binding: ToolBinding) {
        const list = store();
        const index = list.findIndex(entry => entry?.id === binding.id);
        if (index < 0) list.push(binding); else list[index] = binding;
        ports.save(); refresh();
    }
    return {
        getSnapshot: () => snapshot,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        getBindings, refresh, save,
        delete(id: string) { const list = store(); const index = list.findIndex(entry => entry?.id === id); if (index >= 0) list.splice(index, 1); ports.save(); refresh(); },
        setForceTool(value: boolean) { ports.settings.tool_choice_required = value; ports.save(); refresh(); },
        syncPipeline(names: string[], { activate = false } = {}) {
            const changed = ensurePipelineToolBindings(store(), names, { activate, registeredNames: ports.names().filter(name => !owned.has(name)) });
            if (changed) ports.save();
            refresh();
        },
    };
}
export type ToolBindingsService = ReturnType<typeof createToolBindingsService>;
