import { MacroRegistry, MacroCategory } from '../engine/MacroRegistry.js';
import { DEFAULT_CONTEXT, INERT_INSTRUCT } from '../../power-user.js';

/**
 * Registers instruct-mode related {{...}} macros (instruct* and system
 * prompt/context macros) in the MacroRegistry.
 */
export function registerInstructMacros() {
    /**
     * Helper to register macros that just expose a value from INERT_INSTRUCT.
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

    const instEnabled = () => !!INERT_INSTRUCT.enabled;

    // Instruct template macros
    registerSimple(['instructStoryStringPrefix'], () => INERT_INSTRUCT.story_string_prefix, instEnabled, 'Instruct story string prefix.');
    registerSimple(['instructStoryStringSuffix'], () => INERT_INSTRUCT.story_string_suffix, instEnabled, 'Instruct story string suffix.');

    registerSimple(['instructUserPrefix', 'instructInput'], () => INERT_INSTRUCT.input_sequence, instEnabled, 'Instruct input / user prefix sequence.');
    registerSimple(['instructUserSuffix'], () => INERT_INSTRUCT.input_suffix, instEnabled, 'Instruct input / user suffix sequence.');

    registerSimple(['instructAssistantPrefix', 'instructOutput'], () => INERT_INSTRUCT.output_sequence, instEnabled, 'Instruct output / assistant prefix sequence.');
    registerSimple(['instructAssistantSuffix', 'instructSeparator'], () => INERT_INSTRUCT.output_suffix, instEnabled, 'Instruct output / assistant suffix sequence.');

    registerSimple(['instructSystemPrefix'], () => INERT_INSTRUCT.system_sequence, instEnabled, 'Instruct system prefix sequence.');
    registerSimple(['instructSystemSuffix'], () => INERT_INSTRUCT.system_suffix, instEnabled, 'Instruct system suffix sequence.');

    registerSimple(['instructFirstAssistantPrefix', 'instructFirstOutputPrefix'], () => INERT_INSTRUCT.first_output_sequence || INERT_INSTRUCT.output_sequence, instEnabled, 'Instruct first assistant / output prefix sequence');
    registerSimple(['instructLastAssistantPrefix', 'instructLastOutputPrefix'], () => INERT_INSTRUCT.last_output_sequence || INERT_INSTRUCT.output_sequence, instEnabled, 'Instruct last assistant / output prefix sequence.');

    registerSimple(['instructStop'], () => INERT_INSTRUCT.stop_sequence, instEnabled, 'Instruct stop sequence.');
    registerSimple(['instructUserFiller'], () => INERT_INSTRUCT.user_alignment_message, instEnabled, 'Instruct user alignment filler.');
    registerSimple(['instructSystemInstructionPrefix'], () => INERT_INSTRUCT.last_system_sequence, instEnabled, 'Instruct system instruction prefix sequence.');

    registerSimple(['instructFirstUserPrefix', 'instructFirstInput'], () => INERT_INSTRUCT.first_input_sequence || INERT_INSTRUCT.input_sequence, instEnabled, 'Instruct first user / input prefix sequence.');
    registerSimple(['instructLastUserPrefix', 'instructLastInput'], () => INERT_INSTRUCT.last_input_sequence || INERT_INSTRUCT.input_sequence, instEnabled, 'Instruct last user / input prefix sequence.');

    // System prompt macros — the global default was retired; these resolve to
    // inert stored instruct values or the character card prompt.
    registerSimple(['defaultSystemPrompt', 'instructSystem', 'instructSystemPrompt'], () => INERT_INSTRUCT.system_prompt, instEnabled, 'Default system prompt.');

    MacroRegistry.registerMacro('systemPrompt', {
        category: MacroCategory.PROMPTS,
        description: 'Active system prompt text from the character card',
        handler: ({ env }) => env.character.charPrompt ?? '',
    });

    // Context template macros
    registerSimple(['exampleSeparator', 'chatSeparator'], () => DEFAULT_CONTEXT.example_separator, () => true, 'Separator used between example chat blocks in text completion prompts.');
    registerSimple(['chatStart'], () => DEFAULT_CONTEXT.chat_start, () => true, 'Chat start marker used in text completion prompts.');
}

/**
 * Legacy-engine macro table for instruct/sysprompt/context macros.
 * The `power_user.instruct`/`power_user.context` fields are retired; the
 * macros resolve against frozen shipped defaults (instruct disabled).
 * @param {Object<string, *>} env - Map of macro names to values or thunks.
 * @returns {import('../../macros.js').Macro[]} Macro objects.
 */
export function getInstructMacros(env) {
    /** @type {{ key: string,value: string, enabled: boolean }[]} */
    const instructMacros = [
        // Instruct template macros
        {
            key: 'instructStoryStringPrefix',
            value: INERT_INSTRUCT.story_string_prefix,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructStoryStringSuffix',
            value: INERT_INSTRUCT.story_string_suffix,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructInput|instructUserPrefix',
            value: INERT_INSTRUCT.input_sequence,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructUserSuffix',
            value: INERT_INSTRUCT.input_suffix,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructOutput|instructAssistantPrefix',
            value: INERT_INSTRUCT.output_sequence,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructSeparator|instructAssistantSuffix',
            value: INERT_INSTRUCT.output_suffix,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructSystemPrefix',
            value: INERT_INSTRUCT.system_sequence,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructSystemSuffix',
            value: INERT_INSTRUCT.system_suffix,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructFirstOutput|instructFirstAssistantPrefix',
            value: INERT_INSTRUCT.first_output_sequence || INERT_INSTRUCT.output_sequence,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructLastOutput|instructLastAssistantPrefix',
            value: INERT_INSTRUCT.last_output_sequence || INERT_INSTRUCT.output_sequence,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructStop',
            value: INERT_INSTRUCT.stop_sequence,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructUserFiller',
            value: INERT_INSTRUCT.user_alignment_message,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructSystemInstructionPrefix',
            value: INERT_INSTRUCT.last_system_sequence,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructFirstInput|instructFirstUserPrefix',
            value: INERT_INSTRUCT.first_input_sequence || INERT_INSTRUCT.input_sequence,
            enabled: INERT_INSTRUCT.enabled,
        },
        {
            key: 'instructLastInput|instructLastUserPrefix',
            value: INERT_INSTRUCT.last_input_sequence || INERT_INSTRUCT.input_sequence,
            enabled: INERT_INSTRUCT.enabled,
        },
        // System prompt macros
        {
            key: 'systemPrompt',
            value: env.charPrompt ?? '',
            enabled: true,
        },
        {
            key: 'defaultSystemPrompt|instructSystem|instructSystemPrompt',
            value: INERT_INSTRUCT.system_prompt,
            enabled: INERT_INSTRUCT.enabled,
        },
        // Context template macros
        {
            key: 'chatSeparator',
            value: DEFAULT_CONTEXT.example_separator,
            enabled: true,
        },
        {
            key: 'chatStart',
            value: DEFAULT_CONTEXT.chat_start,
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
