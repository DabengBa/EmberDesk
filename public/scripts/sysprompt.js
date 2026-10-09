import { Fuse } from '../lib.js';

import { saveSettingsDebounced } from '../script.js';
import { power_user } from './power-user.js';
import { saveFormattingPreset } from './preset-manager.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from './slash-commands/SlashCommandArgument.js';
import { commonEnumProviders, enumIcons } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { enumTypes, SlashCommandEnumValue } from './slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { isTrueBoolean } from './utils.js';

export let system_prompts = [];

async function migrateSystemPromptFromInstructMode() {
    if ('system_prompt' in power_user.instruct) {
        const prompt = String(power_user.instruct.system_prompt);
        delete power_user.instruct.system_prompt;
        power_user.sysprompt.enabled = power_user.instruct.enabled;
        power_user.sysprompt.content = prompt;
        power_user.sysprompt.post_history = '';

        const existingPromptName = system_prompts.find(x => x.content === prompt)?.name;

        if (existingPromptName) {
            power_user.sysprompt.name = existingPromptName;
        } else {
            const data = { name: `[Migrated] ${power_user.instruct.preset}`, content: prompt };
            await saveFormattingPreset('sysprompt', data.name, data);
            power_user.sysprompt.name = data.name;
        }

        saveSettingsDebounced();
        toastr.info('System prompt settings have been moved from the Instruct Mode.', 'Migration notice', { timeOut: 5000 });
    }
}

/**
 * Applies a system prompt preset to the live power_user settings.
 * Selecting a preset also enables the system prompt, matching the retired
 * drawer's select-on-change behavior.
 * @param {object} preset System prompt preset ({name, content, post_history})
 */
function applySystemPromptPreset(preset) {
    power_user.sysprompt.enabled = true;
    power_user.sysprompt.name = preset.name;
    power_user.sysprompt.content = preset.content || '';
    power_user.sysprompt.post_history = preset.post_history || '';
}

/**
 * Loads sysprompt settings from the given data object.
 * @param {object} data Settings data object.
 */
export async function loadSystemPrompts(data) {
    if (data.sysprompt !== undefined) {
        system_prompts = data.sysprompt;
    }

    await migrateSystemPromptFromInstructMode();
}

/**
 * Sets the system prompt state.
 * @param {boolean} state System prompt state
 * @returns {string} Empty string
 */
function setSystemPromptStateCallback(state) {
    power_user.sysprompt.enabled = state;
    saveSettingsDebounced();
    return '';
}

function toggleSystemPromptCallback(_args, state) {
    if (!state || typeof state !== 'string') {
        return String(power_user.sysprompt.enabled);
    }

    const newState = isTrueBoolean(state);
    setSystemPromptStateCallback(newState);
    return String(power_user.sysprompt.enabled);
}

function selectSystemPromptCallback(args, name) {
    if (!power_user.sysprompt.enabled && !isTrueBoolean(args.forceGet)) {
        return '';
    }

    if (!name) {
        return power_user.sysprompt.name ?? '';
    }

    const quiet = isTrueBoolean(args?.quiet);
    const systemPromptNames = system_prompts.map(preset => preset.name);
    let foundName = systemPromptNames.find(x => x.toLowerCase() === name.toLowerCase());

    if (!foundName) {
        const fuse = new Fuse(systemPromptNames);
        const result = fuse.search(name);

        if (result.length === 0) {
            if (!quiet) toastr.warning(`System prompt "${name}" not found`);
            return '';
        }

        foundName = result[0].item;
    }

    const preset = system_prompts.find(p => p.name === foundName);
    if (preset) {
        applySystemPromptPreset(preset);
        saveSettingsDebounced();
    }
    if (!quiet) toastr.success(`System prompt "${foundName}" selected`);
    return foundName;
}

export function initSystemPrompts() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'sysprompt',
        aliases: ['system-prompt'],
        callback: selectSystemPromptCallback,
        returns: 'current prompt name',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: 'quiet',
                description: 'Suppress the toast message on prompt change',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
            SlashCommandNamedArgument.fromProps({
                name: 'forceGet',
                description: 'Force getting a name even if system prompt is disabled',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: 'false',
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'system prompt name',
                typeList: [ARGUMENT_TYPE.STRING],
                enumProvider: () => system_prompts.map(x => new SlashCommandEnumValue(x.name, null, enumTypes.enum, enumIcons.preset)),
            }),
        ],
        helpString: `
            <div>
                Selects a system prompt by name, using fuzzy search to find the closest match.
                Gets the current system prompt if no name is provided and sysprompt is enabled or <code>forceGet=true</code> is passed.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code class="language-stscript">/sysprompt </code></pre>
                    </li>
                </ul>
            </div>
        `,
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'sysprompt-on',
        aliases: ['sysprompt-enable'],
        callback: () => setSystemPromptStateCallback(true),
        helpString: 'Enables system prompt.',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'sysprompt-off',
        aliases: ['sysprompt-disable'],
        callback: () => setSystemPromptStateCallback(false),
        helpString: 'Disables system prompt',
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'sysprompt-state',
        aliases: ['sysprompt-toggle'],
        helpString: 'Gets the current system prompt state. If an argument is provided, it will set the system prompt state.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'system prompt state',
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                enumList: commonEnumProviders.boolean('trueFalse')(),
            }),
        ],
        callback: toggleSystemPromptCallback,
    }));
}
