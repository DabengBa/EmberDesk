/** The snapshot used for a token recount, captured before async work starts. */
export interface PromptRecountSnapshot {
    identity: unknown;
    order: ReadonlyArray<{ identifier: string }>;
    prompts: ReadonlyArray<{ identifier: string; marker?: boolean; role?: string | null; content?: string }>;
    lastRunCounts: Readonly<Record<string, number>>;
}

export interface PromptRecountPorts {
    snapshot(): PromptRecountSnapshot;
    identity(): unknown;
    count(message: { role: string; content: string }): Promise<number>;
    changed(): void;
}

/** Debounced token bookkeeping, independent of the shell and React. */
export function createPromptTokenRecount(ports: PromptRecountPorts) {
    let counts: Record<string, number | null> = {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;

    async function recount(version: number): Promise<void> {
        const { identity, order, prompts, lastRunCounts } = ports.snapshot();
        const entries = await Promise.all(order.map(async ({ identifier }): Promise<[string, number | null]> => {
            const prompt = prompts.find(item => item.identifier === identifier);
            if (!prompt) return [identifier, null];
            if (prompt.marker) {
                const lastRun = lastRunCounts[identifier];
                return [identifier, typeof lastRun === 'number' && lastRun > 0 ? lastRun : null];
            }
            try {
                return [identifier, await ports.count({ role: prompt.role ?? 'system', content: prompt.content ?? '' })];
            } catch {
                return [identifier, null];
            }
        }));
        if (version !== generation || !Object.is(identity, ports.identity())) return;
        const next = Object.fromEntries(entries);
        if (Object.keys(next).length === Object.keys(counts).length
            && Object.entries(next).every(([identifier, count]) => counts[identifier] === count)) return;
        counts = next;
        ports.changed();
    }

    return {
        getCounts: () => counts,
        schedule() {
            const version = ++generation;
            clearTimeout(timer);
            timer = setTimeout(() => { void recount(version); }, 400);
        },
        dispose() {
            generation++;
            clearTimeout(timer);
        },
    };
}

type PromptRecord = {
    identifier: string; name?: string; role?: string | null; content?: string; marker?: boolean;
    system_prompt?: boolean; forbid_overrides?: boolean; injection_position?: number;
    injection_depth?: number | null; injection_order?: number | null; injection_trigger?: string[];
};
type OrderEntry = { identifier: string; enabled: boolean };
type PipelineStep = { id?: string; tool?: string; prompt?: string; model?: string; [key: string]: unknown };
type Pipeline = { enabled?: boolean; steps: PipelineStep[]; final?: string; [key: string]: unknown };
type PromptSettings = { preset_settings_openai?: string; prompts?: PromptRecord[]; reply_pipeline?: Pipeline };
type StepRow = { id: string; tool: string; prompt: string; model: string };

export interface PromptPanelPorts {
    settings(): PromptSettings;
    order(): OrderEntry[];
    ensureOrder(): OrderEntry[];
    save(): void;
    syncTools(names: string[], options: { activate: boolean }): void;
    uuid(): string;
    dirty(): boolean;
    normalizePipeline(pipeline: Pipeline | undefined): { enabled: boolean; steps: { tool: string }[] };
    triggerTag(name: string): string;
    toolNames(): string[];
    modelNames(): string[];
    count(message: { role: string; content: string }): Promise<number>;
    lastRunCounts(): Record<string, number>;
    bindEvents(changed: () => void, presetChanged: () => void): void;
    openInspector(): void;
}

/** Prompt state and commands over the existing live settings authority. */
export function createPromptPanelService(ports: PromptPanelPorts) {
    const listeners = new Set<() => void>();
    let cachedState: ReturnType<typeof buildState> | null = null;
    let cachedOrder: OrderEntry[] | null = null;
    let eventsBound = false;
    const identity = () => ports.settings().preset_settings_openai;
    const emit = (schedule = true) => {
        cachedState = null;
        for (const listener of listeners) {
            try { listener(); } catch (error) { console.error('Prompt panel listener failed:', error); }
        }
        if (schedule) recount.schedule();
    };
    const recount = createPromptTokenRecount({
        identity,
        snapshot: () => ({ identity: identity(), order: ports.order(), prompts: ports.settings().prompts ?? [], lastRunCounts: ports.lastRunCounts() }),
        count: ports.count,
        changed: () => emit(false),
    });
    const normalizeTriggers = (triggers: unknown): string[] => {
        const list = Array.isArray(triggers) ? triggers.filter((value): value is string => typeof value === 'string' && (['all', 'normal'].includes(value) || (value.startsWith('pipeline:') && value.length > 'pipeline:'.length))) : [];
        return !list.length || list.includes('all') ? ['all'] : list;
    };
    const rows = (): StepRow[] => (Array.isArray(ports.settings().reply_pipeline?.steps) ? ports.settings().reply_pipeline!.steps : []).map((step, index) => ({
        id: typeof step?.id === 'string' && step.id.length ? step.id : `step-${index + 1}`,
        tool: String(step?.tool ?? ''), prompt: typeof step?.prompt === 'string' ? step.prompt : '', model: typeof step?.model === 'string' ? step.model : '',
    }));
    const ensurePipeline = (): Pipeline => {
        const settings = ports.settings();
        if (!settings.reply_pipeline || typeof settings.reply_pipeline !== 'object' || Array.isArray(settings.reply_pipeline)) settings.reply_pipeline = { enabled: false, steps: [] };
        if (!Array.isArray(settings.reply_pipeline.steps)) settings.reply_pipeline.steps = [];
        return settings.reply_pipeline;
    };
    const syncFinal = (pipeline: Pipeline) => { pipeline.final = String(pipeline.steps.at(-1)?.tool ?? ''); };
    const persist = () => { ports.save(); emit(); };
    function buildState() {
        const settings = ports.settings();
        const promptsById: Record<string, { identifier: string; name: string; role: string | null; content: string; marker: boolean; system_prompt: boolean; forbid_overrides: boolean; injection_position: number; injection_depth: number | null; injection_order: number | null; injection_trigger: string[] }> = {};
        for (const prompt of Array.isArray(settings.prompts) ? settings.prompts : []) {
            if (!prompt?.identifier) continue;
            promptsById[prompt.identifier] = { identifier: prompt.identifier, name: prompt.name ?? prompt.identifier, role: prompt.role ?? null, content: prompt.content ?? '', marker: Boolean(prompt.marker), system_prompt: Boolean(prompt.system_prompt), forbid_overrides: Boolean(prompt.forbid_overrides), injection_position: prompt.injection_position ?? 0, injection_depth: prompt.injection_depth ?? null, injection_order: prompt.injection_order ?? null, injection_trigger: normalizeTriggers(prompt.injection_trigger) };
        }
        const order = ports.order().map(entry => ({ identifier: entry.identifier, enabled: Boolean(entry.enabled) }));
        if (!cachedOrder || cachedOrder.length !== order.length || !cachedOrder.every((entry, index) => entry.identifier === order[index].identifier && entry.enabled === order[index].enabled)) cachedOrder = order;
        const pipeline = ports.normalizePipeline(settings.reply_pipeline);
        return { promptsById, order: cachedOrder, tokenCounts: { ...recount.getCounts() }, presetDirty: ports.dirty(), presetName: identity(), pipelineTriggerTags: pipeline.enabled ? [...new Set(pipeline.steps.map(step => ports.triggerTag(step.tool)))] : [], pipeline: { enabled: Boolean(settings.reply_pipeline?.enabled), steps: rows() }, bindingToolNames: ports.toolNames(), pipelineModelNames: ports.modelNames() };
    }
    return {
        subscribe(listener: () => void) {
            if (!eventsBound) { eventsBound = true; ports.bindEvents(() => emit(), () => emit()); }
            recount.schedule();
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        getState() { return cachedState ??= buildState(); },
        setPromptEnabled(identifier: string, enabled: boolean) { const entry = ports.order().find(item => item.identifier === identifier); if (!entry) return; entry.enabled = Boolean(enabled); persist(); },
        movePrompt(identifier: string, targetIndex: number) { const order = ports.order(); const index = order.findIndex(item => item.identifier === identifier); if (index < 0 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= order.length || index === targetIndex) return; order.splice(targetIndex, 0, ...order.splice(index, 1)); persist(); },
        updatePrompt(identifier: string, patch: Partial<PromptRecord>, expected?: { presetName?: string }) {
            if (expected && expected.presetName !== identity()) return;
            const prompt = ports.settings().prompts?.find(item => item?.identifier === identifier);
            if (!prompt || prompt.marker) return;
            if (patch && Object.prototype.hasOwnProperty.call(patch, 'injection_trigger')) patch = { ...patch, injection_trigger: normalizeTriggers(patch.injection_trigger) };
            Object.assign(prompt, patch); persist();
        },
        addPrompt() { const settings = ports.settings(); if (!Array.isArray(settings.prompts)) settings.prompts = []; const identifier = ports.uuid(); settings.prompts.push({ identifier, name: 'New Prompt', role: 'system', system_prompt: false, marker: false, content: '', injection_position: 0, injection_depth: 4, injection_order: 100, injection_trigger: ['all'] }); ports.ensureOrder().push({ identifier, enabled: true }); persist(); return identifier; },
        deletePrompt(identifier: string) { const settings = ports.settings(); const prompts = Array.isArray(settings.prompts) ? settings.prompts : []; const prompt = prompts.find(item => item?.identifier === identifier); if (!prompt || prompt.marker) return; settings.prompts = prompts.filter(item => item?.identifier !== identifier); const order = ports.order(); const index = order.findIndex(item => item.identifier === identifier); if (index >= 0) order.splice(index, 1); persist(); },
        setPipelineEnabled(enabled: boolean) { const pipeline = ensurePipeline(); pipeline.enabled = Boolean(enabled); if (enabled) ports.syncTools(pipeline.steps.map(step => String(step.tool ?? '')), { activate: true }); persist(); },
        addPipelineStep() { const pipeline = ensurePipeline(); pipeline.steps.push({ id: `step-${ports.uuid().slice(0, 8)}`, tool: '', prompt: '' }); if (pipeline.steps.length === 1) pipeline.enabled = true; syncFinal(pipeline); persist(); },
        updatePipelineStep(index: number, patch: Partial<StepRow>) { const pipeline = ensurePipeline(); const step = pipeline.steps[index]; if (!step) return; if (Object.prototype.hasOwnProperty.call(patch, 'tool')) { step.tool = String(patch.tool ?? ''); syncFinal(pipeline); } if (Object.prototype.hasOwnProperty.call(patch, 'prompt')) step.prompt = String(patch.prompt ?? ''); if (Object.prototype.hasOwnProperty.call(patch, 'model')) step.model = String(patch.model ?? ''); persist(); },
        commitPipelineStepTool(index: number, name: string, expected: { presetName?: string; id: string; tool: string }) { const current = rows()[index]; if (!expected || expected.presetName !== identity() || current?.id !== expected.id || current?.tool !== expected.tool) return; const pipeline = ensurePipeline(); if (!pipeline.steps[index]) return; pipeline.steps[index].tool = String(name ?? '').trim(); syncFinal(pipeline); ports.syncTools([pipeline.steps[index].tool!], { activate: true }); persist(); },
        deletePipelineStep(index: number) { const pipeline = ensurePipeline(); if (index < 0 || index >= pipeline.steps.length) return; pipeline.steps.splice(index, 1); syncFinal(pipeline); persist(); },
        movePipelineStep(index: number, targetIndex: number) { const pipeline = ensurePipeline(); if (index < 0 || index >= pipeline.steps.length || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= pipeline.steps.length || index === targetIndex) return; pipeline.steps.splice(targetIndex, 0, ...pipeline.steps.splice(index, 1)); syncFinal(pipeline); persist(); },
        openPromptInspector: ports.openInspector,
    };
}
