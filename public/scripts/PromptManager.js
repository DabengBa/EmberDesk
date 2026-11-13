'use strict';

import { eventSource, event_types } from './events.js';
import { substituteParams } from '../script.js';
import { TokenHandler } from './openai.js';
import { uuidv4 } from './utils.js';

/** Drop the retired built-in example marker without touching custom prompts. */
export function removeRetiredExamplePrompts(settings) {
    if (Array.isArray(settings.prompts)) {
        settings.prompts = settings.prompts.filter(prompt => prompt?.identifier !== 'dialogueExamples');
    }
    for (const bucket of Array.isArray(settings.prompt_order) ? settings.prompt_order : []) {
        if (Array.isArray(bucket?.order)) {
            bucket.order = bucket.order.filter(entry => entry?.identifier !== 'dialogueExamples');
        }
    }
}

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

/** Install the typed domain before manager initialization; defaults remain synchronous. */
let promptDomain = null;

export function installPromptManagerDomain(createDomain) {
    if (promptDomain) return;
    promptDomain = createDomain({
        defaults: chatCompletionDefaultPrompts,
        defaultOrder: promptManagerDefaultPromptOrder,
        removeRetiredExamples: removeRetiredExamplePrompts,
        subscribe: (event, listener) => eventSource.on(event, listener),
        eventTypes: event_types,
        substitute: (text, options) => substituteParams(text, options),
        uuid: uuidv4,
        createTokenHandler: () => new TokenHandler(() => { throw new Error('Token handler not set'); }),
    });
}

function requirePromptDomain() {
    if (!promptDomain) throw new Error('Prompt manager domain must be installed before use');
    return promptDomain;
}

class Prompt {
    constructor(...args) { return new (requirePromptDomain().Prompt)(...args); }
    static [Symbol.hasInstance](value) { return Boolean(promptDomain && value instanceof promptDomain.Prompt); }
}

export class PromptCollection {
    constructor(...args) { return new (requirePromptDomain().PromptCollection)(...args); }
    static [Symbol.hasInstance](value) { return Boolean(promptDomain && value instanceof promptDomain.PromptCollection); }
}

class PromptManager {
    constructor(...args) { return new (requirePromptDomain().PromptManager)(...args); }
    static [Symbol.hasInstance](value) { return Boolean(promptDomain && value instanceof promptDomain.PromptManager); }
}

const chatCompletionDefaultPrompts = {
    'prompts': [
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
