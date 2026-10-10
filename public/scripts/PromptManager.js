'use strict';

import { eventSource, event_types } from './events.js';
import { substituteParams } from '../script.js';
import { TokenHandler } from './openai.js';
import { uuidv4 } from './utils.js';

const DEFAULT_ORDER = 100;

/**
 * @enum {number}
 */
export const INJECTION_POSITION = {
    RELATIVE: 0,
    ABSOLUTE: 1,
};

/**
 * Register migrations for the prompt manager when settings are loaded or an Open AI preset is loaded.
 */
const registerPromptManagerMigration = () => {
    const migrate = (settings, savePreset = null, presetName = null) => {
        if ('Default' === presetName) return;

        // The target prompts are retired; legacy flat fields are dropped so
        // they don't keep round-tripping through settings.
        const legacyKeys = ['main_prompt', 'nsfw_prompt', 'jailbreak_prompt', 'personality_format', 'scenario_format', 'group_nudge_prompt', 'new_group_chat_prompt'];
        let touched = false;
        for (const key of legacyKeys) {
            if (key in settings) {
                delete settings[key];
                touched = true;
            }
        }

        if (touched && savePreset && presetName) savePreset(presetName, settings, false);
    };

    eventSource.on(event_types.SETTINGS_LOADED_BEFORE, settings => migrate(settings));
    eventSource.on(event_types.OAI_PRESET_CHANGED_BEFORE, event => migrate(event.preset, event.savePreset, event.presetName));
};

/**
 * Represents a prompt.
 */
class Prompt {
    /**
     * Indicates if the prompt is enabled.
     * @type {boolean}
     */
    enabled;

    /**
     * Unique identifier for the prompt.
     * @type {string}
     */
    identifier;

    /**
     * Role of the prompt, e.g., 'system', 'user', etc.
     * @type {string}
     */
    role;

    /**
     * Content of the prompt.
     * @type {string}
     */
    content;

    /**
     * Display name of the prompt.
     * @type {string}
     */
    name;

    /**
     * Indicates if the prompt is a system prompt.
     * @type {boolean}
     */
    system_prompt;

    /**
     * Position of the prompt in the prompt list.
     * @type {string|number}
     */
    position;

    /**
     * Inject position of the prompt (relative = 0 or in-chat = 1)
     * @type {number}
     */
    injection_position;

    /**
     * Depth of the prompt in the chat.
     * @type {number}
     */
    injection_depth;

    /**
     * Order of the prompt in the chat.
     * @type {number}
     */
    injection_order;

    /**
     * Indicates if the prompt should not be overridden.
     * @type {boolean}
     */
    forbid_overrides;

    /**
     * Prompt is added by an extension.
     * @type {boolean}
     */
    extension;

    /**
     * A list of generation type triggers for the prompt injection.
     * @type {string[]}
     */
    injection_trigger;

    /**
     * Indicates if the prompt is a marker prompt.
     * @type {boolean}
     */
    marker;

    /**
     * Create a new Prompt instance.
     *
     * @param {Object} [param0] - Object containing the properties of the prompt.
     * @param {string} [param0.identifier] - The unique identifier of the prompt.
     * @param {string} [param0.role] - The role associated with the prompt.
     * @param {string} [param0.content] - The content of the prompt.
     * @param {string} [param0.name] - The name of the prompt.
     * @param {boolean} [param0.system_prompt] - Indicates if the prompt is a system prompt.
     * @param {string|number} [param0.position] - The position of the prompt in the prompt list.
     * @param {number} [param0.injection_position] - The insert position of the prompt.
     * @param {number} [param0.injection_depth] - The depth of the prompt in the chat.
     * @param {number} [param0.injection_order] - The order of the prompt in the chat.
     * @param {string[]} [param0.injection_trigger] - The generation type trigger for the prompt injection.
     * @param {boolean} [param0.forbid_overrides] - Indicates if the prompt should not be overridden.
     * @param {boolean} [param0.extension] - Prompt is added by an extension.
     */
    constructor({ identifier, role, content, name, system_prompt, position, injection_depth, injection_position, forbid_overrides, extension, injection_order, injection_trigger } = {}) {
        this.identifier = identifier;
        this.role = role;
        this.content = content;
        this.name = name;
        this.system_prompt = system_prompt;
        this.position = position;
        this.injection_depth = injection_depth;
        this.injection_position = injection_position;
        this.forbid_overrides = forbid_overrides;
        this.extension = extension ?? false;
        this.injection_order = injection_order ?? DEFAULT_ORDER;
        this.injection_trigger = injection_trigger ?? [];
    }
}

/**
 * Representing a collection of prompts.
 */
export class PromptCollection {
    /**
     * List of Prompts in the collection.
     * @type {Prompt[]}
     */
    collection = [];

    /**
     * List of identifiers of prompts that have been overridden.
     * @type {string[]}
     */
    overriddenPrompts = [];

    /**
     * Create a new PromptCollection instance.
     *
     * @param {...Prompt} prompts - An array of Prompt instances.
     */
    constructor(...prompts) {
        this.add(...prompts);
    }

    /**
     * Checks if the provided instances are of the Prompt class.
     *
     * @param {...Prompt} prompts - Instances to check.
     * @throws Will throw an error if one or more instances are not of the Prompt class.
     */
    checkPromptInstance(...prompts) {
        for (let prompt of prompts) {
            if (!(prompt instanceof Prompt)) {
                throw new Error('Only Prompt instances can be added to PromptCollection');
            }
        }
    }

    /**
     * Adds new Prompt instances to the collection.
     *
     * @param {...Prompt} prompts - An array of Prompt instances.
     */
    add(...prompts) {
        this.checkPromptInstance(...prompts);
        this.collection.push(...prompts);
    }

    /**
     * Sets a Prompt instance at a specific position in the collection.
     *
     * @param {Prompt} prompt - The Prompt instance to set.
     * @param {number} position - The position in the collection to set the Prompt instance.
     */
    set(prompt, position) {
        this.checkPromptInstance(prompt);
        this.collection[position] = prompt;
    }

    /**
     * Retrieves a Prompt instance from the collection by its identifier.
     *
     * @param {string} identifier - The identifier of the Prompt instance to retrieve.
     * @returns {Prompt} The Prompt instance with the provided identifier, or undefined if not found.
     */
    get(identifier) {
        return this.collection.find(prompt => prompt.identifier === identifier);
    }

    /**
     * Retrieves the index of a Prompt instance in the collection by its identifier.
     *
     * @param {string} identifier - The identifier of the Prompt instance to find.
     * @returns {number} The index of the Prompt instance in the collection, or -1 if not found.
     */
    index(identifier) {
        return this.collection.findIndex(prompt => prompt.identifier === identifier);
    }

    /**
     * Checks if a Prompt instance exists in the collection by its identifier.
     *
     * @param {string} identifier - The identifier of the Prompt instance to check.
     * @returns {boolean} true if the Prompt instance exists in the collection, false otherwise.
     */
    has(identifier) {
        return this.index(identifier) !== -1;
    }

    /**
     * Overrides a prompt at a specific position in the collection.
     *
     * @param {Prompt} prompt - The Prompt instance to override.
     * @param {number} position - The position in the collection to override the Prompt instance.
     */
    override(prompt, position) {
        this.set(prompt, position);
        this.overriddenPrompts.push(prompt.identifier);
    }
}

class PromptManager {
    constructor() {
        this.configuration = {
            promptOrder: {
                strategy: 'global',
                dummyId: 100000,
            },
        };

        // Chatcompletion configuration object
        this.serviceSettings = null;

        // Currently selected character
        this.activeCharacter = null;

        // The current token handler instance
        this.tokenHandler = null;

        /** Called to persist the configuration, must return a promise */
        this.saveServiceSettings = () => { return Promise.resolve(); };
    }


    /**
     * Initializes the PromptManager with provided configuration and service settings.
     *
     * Prompts and prompt orders are runtime state for generation; the legacy
     * editing drawer is retired, so init only wires the service lifecycle.
     *
     * @param {Object} moduleConfiguration - Configuration object for the PromptManager.
     * @param {Object} serviceSettings - Service settings object for the PromptManager.
     */
    init(moduleConfiguration, serviceSettings) {
        this.configuration = Object.assign(this.configuration, moduleConfiguration);
        this.tokenHandler = this.tokenHandler || new TokenHandler(() => { throw new Error('Token handler not set'); });
        this.serviceSettings = serviceSettings;

        if ('global' === this.configuration.promptOrder.strategy) this.activeCharacter = { id: this.configuration.promptOrder.dummyId };

        this.sanitizeServiceSettings();

        // Service lifecycle: keep prompt orders in sync with the active
        // character and persist changes; the retired drawer no longer renders.
        eventSource.on(event_types.CHAT_LOADED, (event) => {
            this.handleCharacterSelected(event);
            this.saveServiceSettings();
        });

        eventSource.on(event_types.CHARACTER_EDITED, (event) => {
            this.handleCharacterUpdated(event);
            this.saveServiceSettings();
        });

        // Sanitize settings after character has been deleted.
        eventSource.on(event_types.CHARACTER_DELETED, (event) => {
            this.handleCharacterDeleted(event);
            this.saveServiceSettings();
        });

        // Re-normalize prompts after an openai preset change.
        eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => {
            this.sanitizeServiceSettings();
        });

        this.log('Initialized');
    }

    isPromptDisabledForActiveCharacter(identifier) {
        const promptOrderEntry = this.getPromptOrderEntry(this.activeCharacter, identifier);
        if (promptOrderEntry) return !promptOrderEntry.enabled;
        return false;
    }


    /**
     * Sanitize the service settings, ensuring each prompt has a unique identifier.
     * @returns {void}
     */
    sanitizeServiceSettings() {
        this.serviceSettings.prompts = Array.isArray(this.serviceSettings.prompts) ? this.serviceSettings.prompts : [];
        this.serviceSettings.prompt_order = Array.isArray(this.serviceSettings.prompt_order) ? this.serviceSettings.prompt_order : [];

        // Retired built-in identifiers are remapped or dropped on every load so
        // presets authored against the old prompt set keep working.
        this.#normalizeRetiredPromptIdentifiers();

        if ('global' === this.configuration.promptOrder.strategy) {
            const dummyCharacter = { id: this.configuration.promptOrder.dummyId };
            const promptOrder = this.getPromptOrderForCharacter(dummyCharacter);

            if (0 === promptOrder.length) {
                // Fill the existing bucket in place when it survives with an
                // empty order (e.g. all-retired foreign presets); pushing a
                // duplicate bucket would be shadowed by the empty one.
                const existingBucket = this.serviceSettings.prompt_order.find(list => String(list.character_id) === String(dummyCharacter.id));
                if (existingBucket) {
                    existingBucket.order = structuredClone(promptManagerDefaultPromptOrder);
                } else {
                    this.addPromptOrderForCharacter(dummyCharacter, promptManagerDefaultPromptOrder);
                }
            }
        }

        // Check whether the referenced prompts are present.
        if (this.serviceSettings.prompts.length === 0) {
            this.setPrompts(structuredClone(chatCompletionDefaultPrompts.prompts));
        } else {
            this.checkForMissingPrompts(this.serviceSettings.prompts);
        }

        // Add identifiers if there are none assigned to a prompt
        this.serviceSettings.prompts.forEach(prompt => prompt && (prompt.identifier = prompt.identifier ?? this.getUuidv4()));

        if (this.activeCharacter) {
            const promptReferences = this.getPromptOrderForCharacter(this.activeCharacter);
            for (let i = promptReferences.length - 1; i >= 0; i--) {
                const reference = promptReferences[i];
                if (reference && -1 === this.serviceSettings.prompts.findIndex(prompt => prompt.identifier === reference.identifier)) {
                    promptReferences.splice(i, 1);
                    this.log('Removed unused reference: ' + reference.identifier);
                }
            }
        }
    }

    /**
     * Remaps or drops retired prompt identifiers in loaded settings.
     * `worldInfoBefore`/`worldInfoAfter` collapse into the merged `worldInfo`
     * marker; every other retired identifier is dropped from prompt orders and
     * the prompt library so foreign presets are ignored gracefully.
     */
    #normalizeRetiredPromptIdentifiers() {
        const RETIRED_IDENTIFIERS = new Set([
            'main', 'nsfw', 'jailbreak', 'enhanceDefinitions',
            'summary', 'authorsNote', 'vectorsMemory', 'vectorsDataBank', 'smartContext',
            'scenario', 'personaDescription', 'charPersonality',
            'worldInfoBefore', 'worldInfoAfter',
        ]);
        const MERGED_WORLD_INFO = new Set(['worldInfoBefore', 'worldInfoAfter']);

        for (const orderList of this.serviceSettings.prompt_order) {
            if (!Array.isArray(orderList?.order)) continue;
            const seen = new Map();
            orderList.order = orderList.order.flatMap(entry => {
                if (!entry || typeof entry.identifier !== 'string') return [];
                const identifier = MERGED_WORLD_INFO.has(entry.identifier) ? 'worldInfo' : entry.identifier;
                if (RETIRED_IDENTIFIERS.has(identifier)) return [];
                if (seen.has(identifier)) {
                    // The merged worldInfo marker stays enabled when any of the
                    // legacy before/after buckets had it enabled.
                    if (identifier === 'worldInfo') seen.get(identifier).enabled ||= entry.enabled;
                    return [];
                }
                const mapped = identifier === entry.identifier ? entry : { ...entry, identifier };
                seen.set(identifier, mapped);
                return [mapped];
            });
        }

        let worldInfoCarried = this.serviceSettings.prompts.some(prompt => prompt?.identifier === 'worldInfo');
        this.serviceSettings.prompts = this.serviceSettings.prompts.flatMap(prompt => {
            if (!prompt || !RETIRED_IDENTIFIERS.has(prompt.identifier)) return [prompt];
            // Transplant the first legacy WI marker onto the merged identifier
            // so custom role/depth/order overrides survive the fold.
            if (MERGED_WORLD_INFO.has(prompt.identifier) && !worldInfoCarried) {
                worldInfoCarried = true;
                return [{ ...prompt, identifier: 'worldInfo', name: 'World Info' }];
            }
            return [];
        });
    }

    /**
     * Checks whether entries of a characters prompt order are orphaned
     * and if all mandatory system prompts for a character are present.
     *
     * @param prompts
     */
    checkForMissingPrompts(prompts) {
        const defaultPromptIdentifiers = chatCompletionDefaultPrompts.prompts.reduce((list, prompt) => { list.push(prompt.identifier); return list; }, []);

        const missingIdentifiers = defaultPromptIdentifiers.filter(identifier =>
            !prompts.some(prompt => prompt.identifier === identifier),
        );

        missingIdentifiers.forEach(identifier => {
            const defaultPrompt = chatCompletionDefaultPrompts.prompts.find(prompt => prompt?.identifier === identifier);
            if (defaultPrompt) {
                prompts.push(structuredClone(defaultPrompt));
                this.log(`Missing system prompt: ${defaultPrompt.identifier}. Added default.`);
            }
        });
    }


    /**
     * Handle the deletion of a character by removing their prompt list and nullifying the active character if it was the one deleted.
     * @param {object} event - The event object containing the character's ID.
     * @returns void
     */
    handleCharacterDeleted(event) {
        if ('global' === this.configuration.promptOrder.strategy) return;
        this.removePromptOrderForCharacter(this.activeCharacter);
        if (this.activeCharacter.id === event.detail.id) this.activeCharacter = null;
    }

    /**
     * Handle the selection of a character by setting them as the active character and setting up their prompt list if necessary.
     * @param {object} event - The event object containing the character's ID and character data.
     * @returns {void}
     */
    handleCharacterSelected(event) {
        if ('global' === this.configuration.promptOrder.strategy) {
            this.activeCharacter = { id: this.configuration.promptOrder.dummyId };
        } else if ('character' === this.configuration.promptOrder.strategy) {
            this.activeCharacter = { id: event.detail.id, ...event.detail.character };
            const promptOrder = this.getPromptOrderForCharacter(this.activeCharacter);

            // ToDo: These should be passed as parameter or attached to the manager as a set of default options.
            // Set default prompts and order for character.
            if (0 === promptOrder.length) this.addPromptOrderForCharacter(this.activeCharacter, promptManagerDefaultPromptOrder);
        } else {
            throw new Error('Unsupported prompt order mode.');
        }
    }

    /**
     * Set the most recently selected character
     *
     * @param event
     */
    handleCharacterUpdated(event) {
        if ('global' === this.configuration.promptOrder.strategy) {
            this.activeCharacter = { id: this.configuration.promptOrder.dummyId };
        } else if ('character' === this.configuration.promptOrder.strategy) {
            this.activeCharacter = { id: event.detail.id, ...event.detail.character };
        } else {
            throw new Error('Prompt order strategy not supported.');
        }
    }


    /**
     * Get the order of prompts for a specific character. If no character is specified or the character doesn't have a prompt list, an empty array is returned.
     * @param {object|null} character - The character to get the prompt list for.
     * @returns {Partial<Prompt>[]} The prompt list for the character, or an empty array.
     */
    getPromptOrderForCharacter(character) {
        return !character ? [] : (this.serviceSettings.prompt_order.find(list => String(list.character_id) === String(character.id))?.order ?? []);
    }

    /**
     * Set the prompts for the manager.
     * @param {Partial<Prompt>[]} prompts - The prompts to be set.
     * @returns {void}
     */
    setPrompts(prompts) {
        this.serviceSettings.prompts = prompts;
    }

    /**
     * Remove the prompt list for a specific character.
     * @param {object} character - The character whose prompt list will be removed.
     * @returns {void}
     */
    removePromptOrderForCharacter(character) {
        const index = this.serviceSettings.prompt_order.findIndex(list => String(list.character_id) === String(character.id));
        if (-1 !== index) this.serviceSettings.prompt_order.splice(index, 1);
    }

    /**
     * Adds a new prompt list for a specific character.
     * @param {Object} character - Object with at least an `id` property
     * @param {Array<Object>} promptOrder - Array of prompt objects
     */
    addPromptOrderForCharacter(character, promptOrder) {
        this.serviceSettings.prompt_order.push({
            character_id: character.id,
            order: structuredClone(promptOrder),
        });
    }

    /**
     * Searches for a prompt list entry for a given character and identifier.
     * @param {Object} character - Character object
     * @param {string} identifier - Identifier of the prompt list entry
     * @returns {Object|null} The prompt list entry object, or null if not found
     */
    getPromptOrderEntry(character, identifier) {
        return this.getPromptOrderForCharacter(character).find(entry => entry.identifier === identifier) ?? null;
    }

    /**
     * Finds and returns a prompt by its identifier.
     * @param {string} identifier - Identifier of the prompt
     * @returns {Prompt|null} The prompt object, or null if not found
     */
    getPromptById(identifier) {
        return this.serviceSettings.prompts.find(item => item && item.identifier === identifier) ?? null;
    }


    /**
     * Enriches a generic object, creating a new prompt object in the process
     *
     * @param {Partial<Prompt>} prompt - Prompt object
     * @param original
     * @returns {Prompt} An object with "role" and "content" properties
     */
    preparePrompt(prompt, original = null) {
        const preparedPrompt = new Prompt(prompt);

        if (typeof original === 'string') {
            preparedPrompt.content = substituteParams(prompt.content ?? '', { original });
        } else {
            preparedPrompt.content = substituteParams(prompt.content ?? '');
        }

        return preparedPrompt;
    }

    /**
     * Checks if a given name is accepted by OpenAi API
     * @link https://platform.openai.com/docs/api-reference/chat/create
     *
     * @param name
     * @returns {boolean}
     */
    isValidName(name) {
        const regex = /^[a-zA-Z0-9_]{1,64}$/;

        return regex.test(name);
    }

    sanitizeName(name) {
        return name.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 64);
    }


    /**
     * Returns a full list of prompts whose content markers have been substituted.
     * @param {string} generationType - The type of generation, e.g., 'continue' or 'quiet'.
     * @returns {PromptCollection} A PromptCollection object
     */
    getPromptCollection(generationType) {
        generationType = String(generationType || 'normal').toLowerCase().trim();
        const promptCollection = new PromptCollection();
        const promptOrder = this.getPromptOrderForCharacter(this.activeCharacter);

        promptOrder.forEach(entry => {
            const prompt = this.getPromptById(entry.identifier);
            const allowedTrigger = entry.enabled && this.shouldTrigger(prompt, generationType);

            if (!prompt) {
                return;
            }

            if (allowedTrigger) {
                promptCollection.add(this.preparePrompt(prompt));
            }
        });

        return promptCollection;
    }

    /**
     * Checks if a prompt should be triggered based on its injection triggers.
     * @param {Prompt} prompt - The prompt to check.
     * @param {string} generationType - The type of generation to check against.
     * @returns {boolean} True if the prompt should be triggered, false otherwise.
     */
    shouldTrigger(prompt, generationType) {
        if (!Array.isArray(prompt?.injection_trigger)) return true;
        if (!prompt.injection_trigger.length) return true;
        return prompt.injection_trigger.includes(generationType);
    }

    /**
     * Set and process a finished chat completion object
     *
     * @param {import('./openai.js').ChatCompletion} chatCompletion
     */
    setChatCompletion(chatCompletion) {
        this.populateTokenCounts(chatCompletion.getMessages());
    }

    /**
     * Populates the token handler
     *
     * @param {import('./openai.js').MessageCollection} messages
     */
    populateTokenCounts(messages) {
        this.tokenHandler.resetCounts();
        const counts = this.tokenHandler.getCounts();
        messages.getCollection().forEach(message => {
            counts[message.identifier] = message.getTokens();
        });

        this.log('Updated token usage with ' + this.tokenHandler.getTotal());
    }

    /**
     * Quick uuid4 implementation
     * @returns {string} A string representation of an uuid4
     */
    getUuidv4() {
        return uuidv4();
    }

    /**
     * Write to console with prefix
     *
     * @param output
     */
    log(output) {
        console.debug('[PromptManager] ' + output);
    }
}

const chatCompletionDefaultPrompts = {
    'prompts': [
        {
            'identifier': 'dialogueExamples',
            'name': 'Chat Examples',
            'system_prompt': true,
            'marker': true,
        },
        {
            'identifier': 'chatHistory',
            'name': 'Chat History',
            'system_prompt': true,
            'marker': true,
        },
        {
            'identifier': 'worldInfo',
            'name': 'World Info',
            'system_prompt': true,
            'marker': true,
        },
        {
            'identifier': 'charDescription',
            'name': 'Char Description',
            'system_prompt': true,
            'marker': true,
        },
    ],
};

const promptManagerDefaultPromptOrders = {
    'prompt_order': [],
};

const promptManagerDefaultPromptOrder = [
    {
        'identifier': 'worldInfo',
        'enabled': true,
    },
    {
        'identifier': 'charDescription',
        'enabled': true,
    },
    {
        'identifier': 'dialogueExamples',
        'enabled': true,
    },
    {
        'identifier': 'chatHistory',
        'enabled': true,
    },
];

export {
    PromptManager,
    registerPromptManagerMigration,
    chatCompletionDefaultPrompts,
    promptManagerDefaultPromptOrders,
    Prompt,
};
