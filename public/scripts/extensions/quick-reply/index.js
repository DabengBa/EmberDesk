import { SlashCommand } from '../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from '../../slash-commands/SlashCommandArgument.js';
import { SlashCommandParser } from '../../slash-commands/SlashCommandParser.js';

/**
 * Minimal compatibility stub for the retired Quick Replies feature.
 *
 * The /qr* command family and the quickReplyApi / executeQuickReplyByName
 * globals stay registered so third-party scripts receive a stable
 * "feature removed" receipt instead of unknown-command failures.
 * `/qr-arg` remains functional: it only sets arg:: scope macros and never
 * depended on the quick-reply runtime.
 */
export const QUICK_REPLY_REMOVED_MESSAGE = 'Quick Replies functionality has been removed from EmberDesk.';

const removedError = () => new Error(QUICK_REPLY_REMOVED_MESSAGE);
const removedSync = () => { throw removedError(); };
const removedAsync = async () => { throw removedError(); };

const REMOVED_COMMANDS = [
    'qr',
    'qrset',
    'qr-set',
    'qr-set-on',
    'qr-set-off',
    'qr-chat-set',
    'qr-chat-set-on',
    'qr-chat-set-off',
    'qr-set-list',
    'qr-list',
    'qr-create',
    'qr-get',
    'qr-update',
    'qr-delete',
    'qr-contextadd',
    'qr-contextdel',
    'qr-contextclear',
    'qr-set-create',
    'qr-set-update',
    'qr-set-delete',
    'qr-presetadd',
    'qr-presetupdate',
    'qr-presetdelete',
    'import',
];

/**
 * Inert QuickReplyApi surface. List/getter methods degrade to empty results so
 * autocomplete and world-info automation lookups keep working; mutators and
 * executors throw the stable removal receipt.
 */
export const quickReplyApi = {
    getSetByQr: () => null,
    getSetByName: () => null,
    getQrByLabel: () => null,
    listSets: () => [],
    listGlobalSets: () => [],
    listChatSets: () => [],
    listQuickReplies: () => [],
    listAutomationIds: () => [],
    executeQuickReplyByIndex: removedAsync,
    executeQuickReply: removedAsync,
    toggleGlobalSet: removedSync,
    addGlobalSet: removedSync,
    removeGlobalSet: removedSync,
    toggleChatSet: removedSync,
    addChatSet: removedSync,
    removeChatSet: removedSync,
    createQuickReply: removedAsync,
    updateQuickReply: removedAsync,
    deleteQuickReply: removedAsync,
    createContextItem: removedAsync,
    deleteContextItem: removedAsync,
    clearContextMenu: removedAsync,
    createSet: removedAsync,
    updateSet: removedAsync,
    deleteSet: removedAsync,
};

let didInit = false;

export async function init() {
    if (didInit) {
        return;
    }
    didInit = true;

    for (const name of REMOVED_COMMANDS) {
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name,
            callback: removedSync,
            helpString: `<strong>REMOVED</strong> – ${QUICK_REPLY_REMOVED_MESSAGE}`,
        }));
    }

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'qr-arg',
        callback: ({ _scope }, [key, value]) => {
            _scope.setMacro(`arg::${key}`, value, key.includes('*'));
            return '';
        },
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'argument name',
                typeList: ARGUMENT_TYPE.STRING,
                isRequired: true,
            }),
            SlashCommandArgument.fromProps({
                description: 'argument value',
                typeList: [ARGUMENT_TYPE.STRING, ARGUMENT_TYPE.NUMBER, ARGUMENT_TYPE.BOOLEAN, ARGUMENT_TYPE.LIST, ARGUMENT_TYPE.DICTIONARY],
                isRequired: true,
            }),
        ],
        splitUnnamedArgument: true,
        splitUnnamedArgumentCount: 2,
        helpString: 'Set a fallback value for a slash-command argument macro.',
    }));

    globalThis.executeQuickReplyByName = async (name) => {
        throw new Error(`No Quick Reply found for "${name}". ${QUICK_REPLY_REMOVED_MESSAGE}`);
    };
    globalThis.quickReplyApi = quickReplyApi;
}
