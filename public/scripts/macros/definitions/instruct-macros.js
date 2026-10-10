import { MacroRegistry, MacroCategory } from '../engine/MacroRegistry.js';
import { power_user } from '../../power-user.js';

/**
 * Registers instruct-mode related {{...}} macros (instruct* and system
 * prompt/context macros) in the MacroRegistry.
 */
export function registerInstructMacros() {
    /**
     * Helper to register macros that just expose a value from power_user.instruct.
     * The first name is the primary, subsequent names become visible aliases.
     * @param {string[]} names - First is primary, rest are aliases.
     * @param {() => string} getValue
     * @param {() => boolean} isEnabled
     * @param {string} description
     * @param {string} [category=MacroCategory.PROMPTS]
     */
    function registerSimple(names, getValue, isEnabled, description, category = MacroCategory.PROMPTS) {
        const [primary, ...aliasNames] = names;
        const aliases = aliasNames.map(alias => ({ alias }));

        MacroRegistry.registerMacro(primary, {
            category,
            description,
            aliases: aliases.length > 0 ? aliases : undefined,
            handler: () => (isEnabled() ? (getValue() ?? '') : ''),
        });
    }

    const instEnabled = () => !!power_user.instruct.enabled;

    // Instruct template macros
    registerSimple(['instructStoryStringPrefix'], () => power_user.instruct.story_string_prefix, instEnabled, 'Instruct story string prefix.');
    registerSimple(['instructStoryStringSuffix'], () => power_user.instruct.story_string_suffix, instEnabled, 'Instruct story string suffix.');

    registerSimple(['instructUserPrefix', 'instructInput'], () => power_user.instruct.input_sequence, instEnabled, 'Instruct input / user prefix sequence.');
    registerSimple(['instructUserSuffix'], () => power_user.instruct.input_suffix, instEnabled, 'Instruct input / user suffix sequence.');

    registerSimple(['instructAssistantPrefix', 'instructOutput'], () => power_user.instruct.output_sequence, instEnabled, 'Instruct output / assistant prefix sequence.');
    registerSimple(['instructAssistantSuffix', 'instructSeparator'], () => power_user.instruct.output_suffix, instEnabled, 'Instruct output / assistant suffix sequence.');

    registerSimple(['instructSystemPrefix'], () => power_user.instruct.system_sequence, instEnabled, 'Instruct system prefix sequence.');
    registerSimple(['instructSystemSuffix'], () => power_user.instruct.system_suffix, instEnabled, 'Instruct system suffix sequence.');

    registerSimple(['instructFirstAssistantPrefix', 'instructFirstOutputPrefix'], () => power_user.instruct.first_output_sequence || power_user.instruct.output_sequence, instEnabled, 'Instruct first assistant / output prefix sequence');
    registerSimple(['instructLastAssistantPrefix', 'instructLastOutputPrefix'], () => power_user.instruct.last_output_sequence || power_user.instruct.output_sequence, instEnabled, 'Instruct last assistant / output prefix sequence.');

    registerSimple(['instructStop'], () => power_user.instruct.stop_sequence, instEnabled, 'Instruct stop sequence.');
    registerSimple(['instructUserFiller'], () => power_user.instruct.user_alignment_message, instEnabled, 'Instruct user alignment filler.');
    registerSimple(['instructSystemInstructionPrefix'], () => power_user.instruct.last_system_sequence, instEnabled, 'Instruct system instruction prefix sequence.');

    registerSimple(['instructFirstUserPrefix', 'instructFirstInput'], () => power_user.instruct.first_input_sequence || power_user.instruct.input_sequence, instEnabled, 'Instruct first user / input prefix sequence.');
    registerSimple(['instructLastUserPrefix', 'instructLastInput'], () => power_user.instruct.last_input_sequence || power_user.instruct.input_sequence, instEnabled, 'Instruct last user / input prefix sequence.');

    // System prompt macros — the global default was retired; these resolve to
    // inert stored instruct values or the character card prompt.
    registerSimple(['defaultSystemPrompt', 'instructSystem', 'instructSystemPrompt'], () => power_user.instruct.system_prompt, instEnabled, 'Default system prompt.');

    MacroRegistry.registerMacro('systemPrompt', {
        category: MacroCategory.PROMPTS,
        description: 'Active system prompt text from the character card',
        handler: ({ env }) => env.character.charPrompt ?? '',
    });

    // Context template macros
    registerSimple(['exampleSeparator', 'chatSeparator'], () => power_user.context.example_separator, () => true, 'Separator used between example chat blocks in text completion prompts.');
    registerSimple(['chatStart'], () => power_user.context.chat_start, () => true, 'Chat start marker used in text completion prompts.');
}

/**
 * Legacy-engine macro table for instruct/sysprompt/context macros.
 * Reads the inert stored `power_user.instruct`/`power_user.context` values so
 * existing prompts keep resolving the same placeholders.
 * @param {Object<string, *>} env - Map of macro names to values or thunks.
 * @returns {import('../../macros.js').Macro[]} Macro objects.
 */
export function getInstructMacros(env) {
    /** @type {{ key: string,value: string, enabled: boolean }[]} */
    const instructMacros = [
        // Instruct template macros
        {
            key: 'instructStoryStringPrefix',
            value: power_user.instruct.story_string_prefix,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructStoryStringSuffix',
            value: power_user.instruct.story_string_suffix,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructInput|instructUserPrefix',
            value: power_user.instruct.input_sequence,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructUserSuffix',
            value: power_user.instruct.input_suffix,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructOutput|instructAssistantPrefix',
            value: power_user.instruct.output_sequence,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructSeparator|instructAssistantSuffix',
            value: power_user.instruct.output_suffix,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructSystemPrefix',
            value: power_user.instruct.system_sequence,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructSystemSuffix',
            value: power_user.instruct.system_suffix,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructFirstOutput|instructFirstAssistantPrefix',
            value: power_user.instruct.first_output_sequence || power_user.instruct.output_sequence,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructLastOutput|instructLastAssistantPrefix',
            value: power_user.instruct.last_output_sequence || power_user.instruct.output_sequence,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructStop',
            value: power_user.instruct.stop_sequence,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructUserFiller',
            value: power_user.instruct.user_alignment_message,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructSystemInstructionPrefix',
            value: power_user.instruct.last_system_sequence,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructFirstInput|instructFirstUserPrefix',
            value: power_user.instruct.first_input_sequence || power_user.instruct.input_sequence,
            enabled: power_user.instruct.enabled,
        },
        {
            key: 'instructLastInput|instructLastUserPrefix',
            value: power_user.instruct.last_input_sequence || power_user.instruct.input_sequence,
            enabled: power_user.instruct.enabled,
        },
        // System prompt macros
        {
            key: 'systemPrompt',
            value: env.charPrompt ?? '',
            enabled: true,
        },
        {
            key: 'defaultSystemPrompt|instructSystem|instructSystemPrompt',
            value: power_user.instruct.system_prompt,
            enabled: power_user.instruct.enabled,
        },
        // Context template macros
        {
            key: 'chatSeparator',
            value: power_user.context.example_separator,
            enabled: true,
        },
        {
            key: 'chatStart',
            value: power_user.context.chat_start,
            enabled: true,
        },
    ];

    const macros = [];

    for (const { key, value, enabled } of instructMacros) {
        const regex = new RegExp(`{{(${key})}}`, 'gi');
        const replace = () => enabled ? value : '';
        macros.push({ regex, replace });
    }

    return macros;
}
