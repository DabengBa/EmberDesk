/** Runtime prompt domain. Browser dependencies are supplied by the composition root. */
export interface PromptData {
    identifier?: string;
    role?: string;
    content?: string;
    name?: string;
    system_prompt?: boolean;
    position?: string | number;
    injection_position?: number;
    injection_depth?: number;
    injection_order?: number;
    forbid_overrides?: boolean;
    extension?: boolean;
    injection_trigger?: string[];
    marker?: boolean;
    enabled?: boolean;
}

export interface PromptOrderEntry { identifier: string; enabled: boolean }
export interface PromptSettings {
    prompts: PromptData[];
    prompt_order: { character_id: string | number; order: PromptOrderEntry[] }[];
}
interface Character { id: string | number; [key: string]: unknown }
interface CharacterEvent { detail: { id: string | number; character: Record<string, unknown> } }
interface TokenHandler {
    resetCounts(): void;
    getCounts(): Record<string, number>;
    getTotal(): number;
}
interface MessageCollection { getCollection(): { identifier: string; getTokens(): number }[] }
export interface PromptManagerPorts {
    defaults: { prompts: PromptData[] };
    defaultOrder: PromptOrderEntry[];
    removeRetiredExamples(settings: PromptSettings): void;
    subscribe(event: string, callback: (event: CharacterEvent) => void): void;
    eventTypes: { CHAT_LOADED: string; CHARACTER_EDITED: string; CHARACTER_DELETED: string; OAI_PRESET_CHANGED_AFTER: string };
    substitute(text: string, options?: { original: string }): string;
    uuid(): string;
    createTokenHandler(): TokenHandler;
}

export function createPromptManagerDomain(ports: PromptManagerPorts) {
    class Prompt implements PromptData {
        identifier?: string;
        role?: string;
        content?: string;
        name?: string;
        system_prompt?: boolean;
        position?: string | number;
        injection_depth?: number;
        injection_position?: number;
        forbid_overrides?: boolean;
        extension: boolean;
        injection_order: number;
        injection_trigger: string[];
        enabled?: boolean;
        marker?: boolean;
        constructor({ identifier, role, content, name, system_prompt, position, injection_depth, injection_position, forbid_overrides, extension, injection_order, injection_trigger }: PromptData = {}) {
            this.identifier = identifier; this.role = role; this.content = content; this.name = name;
            this.system_prompt = system_prompt; this.position = position; this.injection_depth = injection_depth;
            this.injection_position = injection_position; this.forbid_overrides = forbid_overrides;
            this.extension = extension ?? false; this.injection_order = injection_order ?? 100;
            this.injection_trigger = injection_trigger ?? [];
        }
    }

    class PromptCollection {
        collection: Prompt[] = [];
        overriddenPrompts: (string | undefined)[] = [];
        constructor(...prompts: Prompt[]) { this.add(...prompts); }
        checkPromptInstance(...prompts: Prompt[]) {
            for (const prompt of prompts) if (!(prompt instanceof Prompt)) throw new Error('Only Prompt instances can be added to PromptCollection');
        }
        add(...prompts: Prompt[]) { this.checkPromptInstance(...prompts); this.collection.push(...prompts); }
        set(prompt: Prompt, position: number) { this.checkPromptInstance(prompt); this.collection[position] = prompt; }
        get(identifier: string) { return this.collection.find(prompt => prompt.identifier === identifier); }
        index(identifier: string) { return this.collection.findIndex(prompt => prompt.identifier === identifier); }
        has(identifier: string) { return this.index(identifier) !== -1; }
        override(prompt: Prompt, position: number) { this.set(prompt, position); this.overriddenPrompts.push(prompt.identifier); }
    }

    class PromptManager {
        configuration: { promptOrder: { strategy: string; dummyId: number } } = { promptOrder: { strategy: 'global', dummyId: 100000 } };
        serviceSettings: PromptSettings = null!;
        activeCharacter: Character | null = null;
        tokenHandler: TokenHandler = null!;
        saveServiceSettings: () => Promise<unknown> = () => Promise.resolve();

        init(moduleConfiguration: Partial<PromptManager['configuration']>, serviceSettings: PromptSettings) {
            this.configuration = Object.assign(this.configuration, moduleConfiguration);
            this.tokenHandler = this.tokenHandler || ports.createTokenHandler();
            this.serviceSettings = serviceSettings;
            if (this.configuration.promptOrder.strategy === 'global') this.activeCharacter = { id: this.configuration.promptOrder.dummyId };
            this.sanitizeServiceSettings();
            ports.subscribe(ports.eventTypes.CHAT_LOADED, event => { this.handleCharacterSelected(event); this.saveServiceSettings(); });
            ports.subscribe(ports.eventTypes.CHARACTER_EDITED, event => { this.handleCharacterUpdated(event); this.saveServiceSettings(); });
            ports.subscribe(ports.eventTypes.CHARACTER_DELETED, event => { this.handleCharacterDeleted(event); this.saveServiceSettings(); });
            ports.subscribe(ports.eventTypes.OAI_PRESET_CHANGED_AFTER, () => this.sanitizeServiceSettings());
            this.log('Initialized');
        }
        isPromptDisabledForActiveCharacter(identifier: string) {
            const entry = this.getPromptOrderEntry(this.activeCharacter, identifier);
            return entry ? !entry.enabled : false;
        }
        sanitizeServiceSettings() {
            this.serviceSettings.prompts = Array.isArray(this.serviceSettings.prompts) ? this.serviceSettings.prompts : [];
            this.serviceSettings.prompt_order = Array.isArray(this.serviceSettings.prompt_order) ? this.serviceSettings.prompt_order : [];
            this.normalizeRetiredPromptIdentifiers();
            if (this.configuration.promptOrder.strategy === 'global') {
                const character = { id: this.configuration.promptOrder.dummyId };
                if (this.getPromptOrderForCharacter(character).length === 0) {
                    const bucket = this.serviceSettings.prompt_order.find(list => String(list.character_id) === String(character.id));
                    if (bucket) bucket.order = structuredClone(ports.defaultOrder);
                    else this.addPromptOrderForCharacter(character, ports.defaultOrder);
                }
            }
            if (this.serviceSettings.prompts.length === 0) this.setPrompts(structuredClone(ports.defaults.prompts));
            else this.checkForMissingPrompts(this.serviceSettings.prompts);
            this.serviceSettings.prompts.forEach(prompt => prompt && (prompt.identifier = prompt.identifier ?? this.getUuidv4()));
            if (this.activeCharacter) {
                const references = this.getPromptOrderForCharacter(this.activeCharacter);
                for (let i = references.length - 1; i >= 0; i--) {
                    const reference = references[i];
                    if (reference && !this.serviceSettings.prompts.some(prompt => prompt.identifier === reference.identifier)) {
                        references.splice(i, 1); this.log('Removed unused reference: ' + reference.identifier);
                    }
                }
            }
        }
        private normalizeRetiredPromptIdentifiers() {
            ports.removeRetiredExamples(this.serviceSettings);
            const retired = new Set(['main', 'nsfw', 'jailbreak', 'enhanceDefinitions', 'summary', 'authorsNote', 'vectorsMemory', 'vectorsDataBank', 'smartContext', 'scenario', 'personaDescription', 'charPersonality', 'worldInfoBefore', 'worldInfoAfter']);
            const merged = new Set(['worldInfoBefore', 'worldInfoAfter']);
            for (const list of this.serviceSettings.prompt_order) {
                if (!Array.isArray(list?.order)) continue;
                const seen = new Map<string, PromptOrderEntry>();
                list.order = list.order.flatMap(entry => {
                    if (!entry || typeof entry.identifier !== 'string') return [];
                    const identifier = merged.has(entry.identifier) ? 'worldInfo' : entry.identifier;
                    if (retired.has(identifier)) return [];
                    const previous = seen.get(identifier);
                    if (previous) { if (identifier === 'worldInfo') previous.enabled ||= entry.enabled; return []; }
                    const mapped = identifier === entry.identifier ? entry : { ...entry, identifier };
                    seen.set(identifier, mapped); return [mapped];
                });
            }
            let worldInfoCarried = this.serviceSettings.prompts.some(prompt => prompt?.identifier === 'worldInfo');
            this.serviceSettings.prompts = this.serviceSettings.prompts.flatMap(prompt => {
                if (!prompt || !retired.has(prompt.identifier ?? '')) return [prompt];
                if (merged.has(prompt.identifier ?? '') && !worldInfoCarried) {
                    worldInfoCarried = true; return [{ ...prompt, identifier: 'worldInfo', name: 'World Info' }];
                }
                return [];
            });
        }
        checkForMissingPrompts(prompts: PromptData[]) {
            const missing = ports.defaults.prompts.map(prompt => prompt.identifier).filter(identifier => !prompts.some(prompt => prompt.identifier === identifier));
            missing.forEach(identifier => {
                const prompt = ports.defaults.prompts.find(item => item?.identifier === identifier);
                if (prompt) { prompts.push(structuredClone(prompt)); this.log(`Missing system prompt: ${prompt.identifier}. Added default.`); }
            });
        }
        handleCharacterDeleted(event: CharacterEvent) {
            if (this.configuration.promptOrder.strategy === 'global') return;
            this.removePromptOrderForCharacter(this.activeCharacter!);
            if (this.activeCharacter!.id === event.detail.id) this.activeCharacter = null;
        }
        handleCharacterSelected(event: CharacterEvent) {
            if (this.configuration.promptOrder.strategy === 'global') this.activeCharacter = { id: this.configuration.promptOrder.dummyId };
            else if (this.configuration.promptOrder.strategy === 'character') {
                this.activeCharacter = { id: event.detail.id, ...event.detail.character };
                if (this.getPromptOrderForCharacter(this.activeCharacter).length === 0) this.addPromptOrderForCharacter(this.activeCharacter, ports.defaultOrder);
            } else throw new Error('Unsupported prompt order mode.');
        }
        handleCharacterUpdated(event: CharacterEvent) {
            if (this.configuration.promptOrder.strategy === 'global') this.activeCharacter = { id: this.configuration.promptOrder.dummyId };
            else if (this.configuration.promptOrder.strategy === 'character') this.activeCharacter = { id: event.detail.id, ...event.detail.character };
            else throw new Error('Prompt order strategy not supported.');
        }
        getPromptOrderForCharacter(character: Character | null) { return !character ? [] : (this.serviceSettings.prompt_order.find(list => String(list.character_id) === String(character.id))?.order ?? []); }
        setPrompts(prompts: PromptData[]) { this.serviceSettings.prompts = prompts; }
        removePromptOrderForCharacter(character: Character) {
            const index = this.serviceSettings.prompt_order.findIndex(list => String(list.character_id) === String(character.id));
            if (index !== -1) this.serviceSettings.prompt_order.splice(index, 1);
        }
        addPromptOrderForCharacter(character: Character, promptOrder: PromptOrderEntry[]) { this.serviceSettings.prompt_order.push({ character_id: character.id, order: structuredClone(promptOrder) }); }
        getPromptOrderEntry(character: Character | null, identifier: string) { return this.getPromptOrderForCharacter(character).find(entry => entry.identifier === identifier) ?? null; }
        getPromptById(identifier: string) { return this.serviceSettings.prompts.find(item => item && item.identifier === identifier) ?? null; }
        preparePrompt(prompt: PromptData, original: string | null = null) {
            const prepared = new Prompt(prompt);
            prepared.content = typeof original === 'string' ? ports.substitute(prompt.content ?? '', { original }) : ports.substitute(prompt.content ?? '');
            return prepared;
        }
        isValidName(name: string) { return /^[a-zA-Z0-9_]{1,64}$/.test(name); }
        sanitizeName(name: string) { return name.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 64); }
        getPromptCollection(generationType: string, extraTriggerTags: string[] = []) {
            generationType = String(generationType || 'normal').toLowerCase().trim();
            const collection = new PromptCollection();
            this.getPromptOrderForCharacter(this.activeCharacter).forEach(entry => {
                const prompt = this.getPromptById(entry.identifier);
                const allowed = entry.enabled && this.shouldTrigger(prompt, generationType, extraTriggerTags);
                if (prompt && allowed) collection.add(this.preparePrompt(prompt));
            });
            return collection;
        }
        shouldTrigger(prompt: PromptData | null, generationType: string, extraTriggerTags: string[] = []) {
            if (!Array.isArray(prompt?.injection_trigger) || !prompt.injection_trigger.length) return true;
            return prompt.injection_trigger.includes('all') || prompt.injection_trigger.includes(generationType) || extraTriggerTags.some(tag => prompt.injection_trigger!.includes(tag));
        }
        setChatCompletion(completion: { getMessages(): MessageCollection }) { this.populateTokenCounts(completion.getMessages()); }
        populateTokenCounts(messages: MessageCollection) {
            this.tokenHandler.resetCounts(); const counts = this.tokenHandler.getCounts();
            messages.getCollection().forEach(message => { counts[message.identifier] = message.getTokens(); });
            this.log('Updated token usage with ' + this.tokenHandler.getTotal());
        }
        getUuidv4() { return ports.uuid(); }
        log(output: string) { console.debug('[PromptManager] ' + output); }
    }
    return { Prompt, PromptCollection, PromptManager };
}
