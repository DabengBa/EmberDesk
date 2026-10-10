import { saveSettingsDebounced } from '../script.js';
import { power_user } from './power-user.js';
import { SlashCommand } from './slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from './slash-commands/SlashCommandArgument.js';
import { commonEnumProviders } from './slash-commands/SlashCommandCommonEnumsProvider.js';
import { SlashCommandParser } from './slash-commands/SlashCommandParser.js';
import { isTrueBoolean } from './utils.js';

async function migrateSystemPromptFromInstructMode() {
    if ('system_prompt' in power_user.instruct) {
        const prompt = String(power_user.instruct.system_prompt);
        delete power_user.instruct.system_prompt;
        power_user.sysprompt.enabled = power_user.instruct.enabled;
        power_user.sysprompt.content = prompt;
        power_user.sysprompt.post_history = '';

        saveSettingsDebounced();
        toastr.info('System prompt settings have been moved from the Instruct Mode.', 'Migration notice', { timeOut: 5000 });
    }
}

/**
 * Runs the one-off instruct-mode migration on settings load.
 */
export async function loadSystemPrompts() {
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

export function initSystemPrompts() {
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
