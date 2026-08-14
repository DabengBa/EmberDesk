import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const repoRoot = path.resolve(__dirname, '../..');

function contractEntry(file, specifier, names, kind = 'import') {
    return Object.freeze({
        file,
        specifier,
        kind,
        names: Object.freeze([...names]),
    });
}

// This is an exact snapshot of the legacy surface that has not migrated yet.
export const FIRST_PARTY_SCRIPT_JS_IMPORT_CONTRACT = Object.freeze([
    contractEntry('action-loader.js', '../script.js', ['stopGeneration']),
    contractEntry('authors-note.js', '../script.js', ['MAX_INJECTION_DEPTH', 'animation_duration', 'chat_metadata', 'extension_prompt_roles', 'extension_prompt_types', 'saveSettingsDebounced', 'this_chid']),
    contractEntry('autocomplete/MacroAutoCompleteHelper.js', '/script.js', ['chat_metadata']),
    contractEntry('backgrounds.js', '../script.js', ['characters', 'chat_metadata', 'generateQuietPrompt', 'getCurrentChatId', 'getThumbnailUrl', 'saveMetadata', 'saveSettings', 'saveSettingsDebounced', 'this_chid']),
    contractEntry('bookmarks.js', '../script.js', ['characters', 'saveChat', 'system_message_types', 'syncSwipeToMes', 'this_chid', 'openCharacterChat', 'chat_metadata', 'getThumbnailUrl', 'getCharacters', 'chat', 'saveChatConditional', 'saveItemizedPrompts', 'setActiveGroup', 'getCurrentChatDetails']),
    contractEntry('bulk-edit.js', '../script.js', ['characterGroupOverlay', 'syncReactCharacterLibraryToolbarState']),
    contractEntry('BulkEditOverlay.js', '../script.js', ['characterGroupOverlay', 'characters', 'getCharacters', 'buildAvatarList', 'characterToEntity', 'printCharactersDebounced', 'deleteCharacter', 'stopGeneration', 'is_send_press', 'this_chid', 'name2', 'neutralCharacterName', 'syncReactCharacterLibraryToolbarState']),
    contractEntry('cfg-scale.js', '../script.js', ['chat_metadata', 'substituteParams', 'this_chid', 'saveSettingsDebounced', 'animation_duration']),
    contractEntry('chat-backups.js', '/script.js', ['displayPastChats', 'importCharacterChat']),
    contractEntry('chats.js', '../script.js', ['addCopyToCodeBlocks', 'appendMediaToMessage', 'characters', 'chat', 'getCurrentChatId', 'name2', 'reloadCurrentChat', 'saveSettingsDebounced', 'this_chid', 'saveChatConditional', 'chat_metadata', 'neutralCharacterName', 'updateChatMetadata', 'system_message_types', 'converter', 'substituteParams', 'getSystemMessageByType', 'printMessages', 'clearChat', 'refreshSwipeButtons', 'getMediaIndex', 'getMediaDisplay', 'chatElement']),
    contractEntry('custom-request.js', '../script.js', ['extractJsonFromData', 'extractMessageFromData']),
    contractEntry('extensions.js', '../script.js', ['saveSettings', 'saveSettingsDebounced', 'animation_duration', 'CLIENT_VERSION']),
    contractEntry('extensions/assets/index.js', '../../../script.js', ['processDroppedFiles']),
    contractEntry('extensions/attachments/index.js', '../../../script.js', ['saveSettingsDebounced']),
    contractEntry('extensions/caption/index.js', '../../../script.js', ['appendMediaToMessage', 'chat_metadata', 'saveChatConditional', 'saveSettingsDebounced', 'substituteParams']),
    contractEntry('extensions/connection-manager/index.js', '../../../script.js', ['activateSendButtons', 'deactivateSendButtons', 'main_api', 'online_status', 'saveSettingsDebounced']),
    contractEntry('extensions/expressions/index.js', '../../../script.js', ['characters', 'generateQuietPrompt', 'generateRaw', 'online_status', 'saveSettingsDebounced', 'substituteParams', 'substituteParamsExtended', 'system_message_types', 'this_chid']),
    contractEntry('extensions/gallery/index.js', '../../../script.js', ['this_chid', 'characters', 'animation_duration', 'animation_easing']),
    contractEntry('extensions/memory/index.js', '../../../script.js', ['activateSendButtons', 'deactivateSendButtons', 'animation_duration', 'extension_prompt_roles', 'extension_prompt_types', 'generateQuietPrompt', 'is_send_press', 'saveSettingsDebounced', 'substituteParamsExtended', 'generateRaw', 'getMaxPromptTokens', 'setExtensionPrompt', 'streamingProcessor', 'animation_easing']),
    contractEntry('extensions/quick-reply/index.js', '../../../script.js', ['chat', 'chat_metadata', 'this_chid', 'characters']),
    contractEntry('extensions/quick-reply/src/QuickReplySet.js', '../../../../script.js', ['substituteParams']),
    contractEntry('extensions/quick-reply/src/QuickReplySettings.js', '../../../../script.js', ['chat_metadata', 'saveSettingsDebounced']),
    contractEntry('extensions/quick-reply/src/ui/ButtonUi.js', '../../../../../script.js', ['animation_duration']),
    contractEntry('extensions/regex/engine.js', '../../../script.js', ['characters', 'saveSettingsDebounced', 'substituteParams', 'substituteParamsExtended', 'this_chid']),
    contractEntry('extensions/regex/index.js', '../../../script.js', ['characters', 'getCurrentChatId', 'messageFormatting', 'reloadCurrentChat', 'saveSettingsDebounced', 'this_chid']),
    contractEntry('extensions/shared.js', '../../script.js', ['CONNECT_API_MAP', 'createModelIcon']),
    contractEntry('extensions/stable-diffusion/index.js', '../../../script.js', ['animation_duration', 'appendMediaToMessage', 'formatCharacterAvatar', 'generateQuietPrompt', 'getCharacterAvatar', 'getCurrentChatId', 'getUserAvatar', 'saveSettingsDebounced', 'substituteParams', 'substituteParamsExtended', 'systemUserName', 'this_chid', 'user_avatar']),
    contractEntry('extensions/token-counter/index.js', '../../../script.js', ['main_api']),
    contractEntry('extensions/translate/index.js', '../../../script.js', ['reloadCurrentChat', 'saveSettingsDebounced', 'substituteParams', 'updateMessageBlock']),
    contractEntry('group-chats.js', '../script.js', ['chat', 'sendSystemMessage', 'printMessages', 'substituteParams', 'characters', 'default_avatar', 'addOneMessage', 'clearChat', 'Generate', 'select_rm_info', 'setCharacterId', 'setCharacterName', 'setEditedMessageId', 'is_send_press', 'resetChatState', 'setSendButtonState', 'getCharacters', 'system_message_types', 'online_status', 'talkativeness_default', 'selectRightMenuWithAnimation', 'deleteLastMessage', 'showSwipeButtons', 'hideSwipeButtons', 'chat_metadata', 'updateChatMetadata', 'getThumbnailUrl', 'setMenuType', 'menu_type', 'select_selected_character', 'cancelTtsPlay', 'displayPastChats', 'sendMessageAsUser', 'getBiasStrings', 'saveChatConditional', 'deactivateSendButtons', 'activateSendButtons', 'getCurrentChatId', 'setCharacterSettingsOverrides', 'system_avatar', 'isChatSaving', 'setExternalAbortController', 'baseChatReplace', 'createLazyFields', 'depth_prompt_depth_default', 'loadItemizedPrompts', 'animation_duration', 'depth_prompt_role_default', 'shouldAutoContinue', 'unshallowCharacter', 'chatElement', 'ensureMessageMediaIsArray']),
    contractEntry('import-confirm-dialog.js', '../script.js', ['characters', 'converter', 'substituteParams']),
    contractEntry('instruct-mode.js', '../script.js', ['extension_prompt_types', 'name1', 'name2', 'online_status', 'saveSettingsDebounced', 'substituteParams']),
    contractEntry('itemized-prompts.js', '../script.js', ['chat', 'getCurrentChatId', 'reloadCurrentChat']),
    contractEntry('logit-bias.js', '../script.js', ['saveSettingsDebounced']),
    contractEntry('logprobs.js', '../script.js', ['animation_duration', 'chat', 'cleanUpMessage', 'Generate', 'getGeneratingApi', 'is_send_press', 'isStreamingEnabled', 'substituteParamsExtended']),
    contractEntry('macros.js', '../script.js', ['chat', 'chat_metadata', 'getMaxPromptTokens', 'getMaxContextTokens', 'getMaxResponseTokens', 'getCurrentChatId', 'substituteParams', 'extension_prompts']),
    contractEntry('macros/definitions/chat-macros.js', '../../../script.js', ['chat', 'chat_metadata']),
    contractEntry('macros/definitions/core-macros.js', '../../../script.js', ['chat_metadata', 'getMaxPromptTokens', 'getMaxContextTokens', 'getMaxResponseTokens', 'extension_prompts', 'getCurrentChatId']),
    contractEntry('macros/definitions/env-macros.js', '../../../script.js', ['parseMesExamples', 'main_api']),
    contractEntry('macros/definitions/time-macros.js', '../../../script.js', ['chat']),
    contractEntry('macros/engine/MacroEnvBuilder.js', '../../../script.js', ['name1', 'name2', 'characters', 'getCharacterCardFieldsLazy', 'getGeneratingModel']),
    contractEntry('novelai-subscription.js', '../script.js', ['abortStatusCheck']),
    contractEntry('openai.js', '../script.js', ['abortStatusCheck', 'cancelStatusCheck', 'characters', 'extension_prompt_roles', 'extension_prompt_types', 'Generate', 'getExtensionPrompt', 'getExtensionPromptMaxDepth', 'getMediaDisplay', 'getMediaIndex', 'is_send_press', 'main_api', 'name1', 'name2', 'resultCheckStatus', 'saveSettingsDebounced', 'setOnlineStatus', 'startStatusLoading', 'substituteParams', 'substituteParamsExtended', 'system_message_types', 'this_chid']),
    contractEntry('personas.js', '../script.js', ['buildAvatarList', 'characterToEntity', 'characters', 'chat', 'chat_metadata', 'createOrEditCharacter', 'default_user_avatar', 'getCurrentChatId', 'getThumbnailUrl', 'groupToEntity', 'menu_type', 'name1', 'name2', 'reloadCurrentChat', 'saveChatConditional', 'saveMetadata', 'saveSettingsDebounced', 'setUserName', 'this_chid']),
    contractEntry('power-user.js', '../script.js', ['saveSettingsDebounced', 'scrollChatToBottom', 'characters', 'reloadMarkdownProcessor', 'reloadCurrentChat', 'substituteParams', 'getCurrentChatId', 'printCharactersDebounced', 'setCharacterId', 'setEditedMessageId', 'chat', 'getFirstDisplayedMessageId', 'showMoreMessages', 'saveSettings', 'saveChatConditional', 'setAnimationDuration', 'ANIMATION_DURATION_DEFAULT', 'setActiveGroup', 'setActiveCharacter', 'entitiesFilter', 'doNewChat', 'online_status', 'messageFormatting', 'extension_prompt_types', 'extension_prompt_roles', 'deleteMessage', 'settingsReady']),
    contractEntry('preset-manager.js', '../script.js', ['amount_gen', 'characters', 'main_api', 'max_context', 'online_status', 'saveSettings', 'saveSettingsDebounced', 'this_chid']),
    contractEntry('PromptManager.js', '../script.js', ['is_send_press', 'main_api', 'substituteParams']),
    contractEntry('reasoning.js', '../script.js', ['chat', 'closeMessageEditor', 'main_api', 'messageFormatting', 'saveChatConditional', 'saveChatDebounced', 'saveSettingsDebounced', 'substituteParams', 'syncMesToSwipe', 'updateMessageBlock']),
    contractEntry('RossAscends-mods.js', '../script.js', ['characters', 'online_status', 'main_api', 'is_send_press', 'max_context', 'saveSettingsDebounced', 'active_group', 'active_character', 'setActiveGroup', 'setActiveCharacter', 'getEntitiesList', 'buildAvatarList', 'selectCharacterById', 'menu_type', 'substituteParams', 'sendTextareaMessage', 'doNavbarIconClick', 'isSwipingAllowed']),
    contractEntry('samplerSelect.js', '../script.js', ['main_api', 'saveSettingsDebounced']),
    contractEntry('secrets.js', '../script.js', ['saveSettings']),
    contractEntry('server-history.js', '../script.js', ['saveSettingsDebounced']),
    contractEntry('showdown-exclusion.js', '../script.js', ['substituteParams']),
    contractEntry('slash-commands.js', '../script.js', ['Generate', 'activateSendButtons', 'addOneMessage', 'characters', 'chat', 'chatElement', 'chat_metadata', 'comment_avatar', 'deactivateSendButtons', 'default_avatar', 'deleteCharacter', 'deleteSwipe', 'displayPastChats', 'duplicateCharacter', 'extension_prompt_roles', 'extension_prompt_types', 'extractMessageBias', 'generateQuietPrompt', 'generateRaw', 'getCharacters', 'getCurrentChatDetails', 'getCurrentChatId', 'getFirstDisplayedMessageId', 'getOneCharacter', 'getThumbnailUrl', 'is_send_press', 'main_api', 'name1', 'name2', 'neutralCharacterName', 'newAssistantChat', 'online_status', 'reloadCurrentChat', 'removeMacros', 'renameCharacter', 'renameChat', 'saveChatConditional', 'saveSettings', 'saveSettingsDebounced', 'selectCharacterById', 'select_selected_character', 'sendMessageAsUser', 'sendSystemMessage', 'setActiveCharacter', 'setActiveGroup', 'setCharacterId', 'setCharacterName', 'setExtensionPrompt', 'showMoreMessages', 'swipe', 'stopGeneration', 'substituteParams', 'syncMesToSwipe', 'system_avatar', 'system_message_types', 'this_chid', 'updateMessageElement']),
    contractEntry('slash-commands/SlashCommandClosure.js', '../../script.js', ['substituteParams']),
    contractEntry('slash-commands/SlashCommandCommonEnumsProvider.js', '../../script.js', ['chat_metadata', 'characters', 'substituteParams', 'chat', 'extension_prompt_roles', 'extension_prompt_types', 'name2', 'neutralCharacterName']),
    contractEntry('slash-commands/SlashCommandReturnHelper.js', '../../script.js', ['sendSystemMessage', 'system_message_types']),
    contractEntry('st-context.js', '../script.js', ['activateSendButtons', 'addOneMessage', 'appendMediaToMessage', 'callPopup', 'characters', 'chat', 'chat_metadata', 'CONNECT_API_MAP', 'create_save', 'deactivateSendButtons', 'extension_prompts', 'extractMessageFromData', 'Generate', 'generateQuietPrompt', 'getCharacters', 'getCurrentChatId', 'getThumbnailUrl', 'main_api', 'max_context', 'menu_type', 'messageFormatting', 'name1', 'name2', 'online_status', 'openCharacterChat', 'reloadCurrentChat', 'renameChat', 'saveChatConditional', 'saveMetadata', 'saveReply', 'saveSettingsDebounced', 'selectCharacterById', 'sendGenerationRequest', 'sendStreamingRequest', 'sendSystemMessage', 'setExtensionPrompt', 'stopGeneration', 'streamingProcessor', 'substituteParams', 'substituteParamsExtended', 'this_chid', 'updateChatMetadata', 'updateMessageBlock', 'printMessages', 'clearChat', 'unshallowCharacter', 'deleteLastMessage', 'getCharacterCardFields', 'swipe_right', 'swipe_left', 'generateRaw', 'generateRawData', 'showSwipeButtons', 'hideSwipeButtons', 'deleteMessage', 'refreshSwipeButtons', 'swipe', 'isSwipingAllowed', 'swipeState', 'ensureMessageMediaIsArray', 'getMediaDisplay', 'getMediaIndex', 'scrollChatToBottom', 'scrollOnMediaLoad', 'getOneCharacter', 'getCharacterSource']),
    contractEntry('stats.js', '../script.js', ['characters', 'this_chid']),
    contractEntry('streaming-display.js', '/script.js', ['animation_duration', 'messageFormatting']),
    contractEntry('swipe-picker.js', '/script.js', ['chat', 'deleteSwipe', 'ensureSwipes', 'isMessageSwipeable', 'isSwipingAllowed', 'swipe', 'syncMesToSwipe']),
    contractEntry('sysprompt.js', '../script.js', ['saveSettingsDebounced']),
    contractEntry('system-messages.js', '../script.js', ['addOneMessage', 'chat', 'displayVersion', 'setSendButtonState', 'system_avatar', 'systemUserName']),
    contractEntry('tags.js', '../script.js', ['characters', 'saveSettingsDebounced', 'this_chid', 'menu_type', 'entitiesFilter', 'printCharactersDebounced', 'buildAvatarList', 'DEFAULT_PRINT_TIMEOUT', 'printCharacters']),
    contractEntry('tokenizers.js', '../script.js', ['characters', 'main_api', 'this_chid']),
    contractEntry('tool-calling.js', '../script.js', ['addOneMessage', 'chat', 'getGeneratingApi', 'getGeneratingModel', 'main_api', 'saveChatConditional', 'system_avatar', 'systemUserName']),
    contractEntry('util/AccountStorage.js', '../../script.js', ['saveSettingsDebounced']),
    contractEntry('utils.js', '../script.js', ['characters', 'processDroppedFiles', 'this_chid', 'user_avatar']),
    contractEntry('variables.js', '../script.js', ['chat_metadata', 'getCurrentChatId', 'saveSettingsDebounced']),
    contractEntry('welcome-screen.js', '../script.js', ['addOneMessage', 'characters', 'chat', 'displayVersion', 'doNewChat', 'getCharacters', 'getCurrentChatId', 'getSystemMessageByType', 'getThumbnailUrl', 'is_send_press', 'neutralCharacterName', 'printCharactersDebounced', 'selectCharacterById', 'system_avatar', 'system_message_types', 'this_chid', 'unshallowCharacter']),
]);

export const FIRST_PARTY_SCRIPT_JS_IMPORT_ALLOWLIST = Object.freeze(
    [...new Set(FIRST_PARTY_SCRIPT_JS_IMPORT_CONTRACT.map(entry => entry.file))].sort(),
);

function collectJavaScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (absolutePath.includes(`${path.sep}extensions${path.sep}third-party${path.sep}`)) {
                return [];
            }
            return collectJavaScriptFiles(absolutePath);
        }
        return entry.isFile() && entry.name.endsWith('.js') ? [absolutePath] : [];
    });
}

function isScriptSpecifier(specifier) {
    return /(?:^|\/)script\.js(?:[?#].*)?$/.test(specifier);
}

function tokenizeJavaScript(source) {
    const tokens = [];
    const isIdentifierStart = character => /[A-Za-z_$]/.test(character);
    const isIdentifierPart = character => /[\w$]/.test(character);

    for (let index = 0; index < source.length;) {
        const character = source[index];
        const nextCharacter = source[index + 1];

        if (/\s/.test(character)) {
            index++;
            continue;
        }

        if (character === '/' && nextCharacter === '/') {
            index += 2;
            while (index < source.length && source[index] !== '\n') index++;
            continue;
        }

        if (character === '/' && nextCharacter === '*') {
            index += 2;
            while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index++;
            index += 2;
            continue;
        }

        if (character === '\'' || character === '"') {
            const quote = character;
            const start = index++;
            let value = '';
            while (index < source.length) {
                const current = source[index++];
                if (current === '\\') {
                    value += source[index++] ?? '';
                } else if (current === quote) {
                    break;
                } else {
                    value += current;
                }
            }
            tokens.push({ kind: 'string', start, end: index, value });
            continue;
        }

        if (character === '`') {
            index++;
            while (index < source.length) {
                const current = source[index++];
                if (current === '\\') index++;
                else if (current === '`') break;
            }
            continue;
        }

        if (isIdentifierStart(character)) {
            const start = index++;
            while (index < source.length && isIdentifierPart(source[index])) index++;
            tokens.push({ kind: 'identifier', start, end: index, value: source.slice(start, index) });
            continue;
        }

        tokens.push({ kind: 'punctuation', start: index, end: index + 1, value: character });
        index++;
    }

    return tokens;
}

function splitNamedTokens(tokens) {
    const names = [];
    let index = 0;

    while (index < tokens.length) {
        if (tokens[index].value === ',') {
            index++;
            continue;
        }

        if (tokens[index].value === 'type') {
            index++;
            continue;
        }

        const imported = tokens[index].value;
        if (tokens[index].kind === 'identifier' || tokens[index].kind === 'string') {
            names.push(imported);
        }

        while (index < tokens.length && tokens[index].value !== ',') index++;
    }

    return names;
}

function parseStaticClause(tokens, start, end, kind) {
    const clause = tokens.slice(start, end);
    const names = [];
    let binding;
    const openingBrace = clause.findIndex(token => token.value === '{');
    const hasNamespace = clause.some(token => token.value === '*');

    if (kind === 'import' && clause[0] && clause[0].value !== '{' && clause[0].value !== '*') {
        names.push('default');
    }

    if (hasNamespace) {
        names.push('*');
        const starIndex = clause.findIndex(token => token.value === '*');
        if (clause[starIndex + 1]?.value === 'as') {
            binding = clause[starIndex + 2]?.value;
        }
    }

    if (openingBrace >= 0) {
        const closingBrace = clause.findIndex((token, index) => index > openingBrace && token.value === '}');
        names.push(...splitNamedTokens(clause.slice(openingBrace + 1, closingBrace >= 0 ? closingBrace : clause.length)));
    }

    return { names, binding };
}

function findFromToken(tokens, start) {
    let depth = 0;

    for (let index = start; index < tokens.length; index++) {
        const value = tokens[index].value;
        if (value === '{' || value === '[' || value === '(') depth++;
        if (value === '}' || value === ']' || value === ')') depth--;
        if (depth === 0 && value === 'from' && tokens[index + 1]?.kind === 'string') {
            return index;
        }
        if (depth === 0 && value === ';') break;
    }

    return -1;
}

function parseDynamicBinding(tokens, importIndex) {
    let cursor = importIndex - 1;
    if (tokens[cursor]?.value === 'await') cursor--;
    if (tokens[cursor]?.value !== '=') return { names: ['<dynamic>'] };

    cursor--;
    if (tokens[cursor]?.kind === 'identifier') {
        return { names: ['<dynamic>'], binding: tokens[cursor].value };
    }

    if (tokens[cursor]?.value !== '}') return { names: ['<dynamic>'] };

    let openingBrace = cursor - 1;
    let depth = 1;
    while (openingBrace >= 0) {
        if (tokens[openingBrace].value === '}') depth++;
        if (tokens[openingBrace].value === '{') {
            depth--;
            if (depth === 0) break;
        }
        openingBrace--;
    }

    return {
        names: splitNamedTokens(tokens.slice(openingBrace + 1, cursor)),
    };
}

function collectParsedImports(source, file) {
    const tokens = tokenizeJavaScript(source);
    const records = [];

    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token.value !== 'import' && token.value !== 'export') continue;

        if (token.value === 'import' && tokens[index + 1]?.value === '.') continue;

        if (token.value === 'import' && tokens[index + 1]?.value === '(') {
            const specifier = tokens[index + 2];
            if (specifier?.kind !== 'string' || !isScriptSpecifier(specifier.value)) continue;
            const parsed = parseDynamicBinding(tokens, index);
            records.push({ file, kind: 'dynamic', specifier: specifier.value, ...parsed });
            continue;
        }

        if (token.value === 'import' && tokens[index + 1]?.kind === 'string') {
            const specifier = tokens[index + 1].value;
            if (isScriptSpecifier(specifier)) {
                records.push({ file, kind: 'import', specifier, names: ['<side-effect>'] });
            }
            continue;
        }

        const fromIndex = findFromToken(tokens, index + 1);
        const specifier = fromIndex >= 0 ? tokens[fromIndex + 1] : null;
        if (specifier?.kind !== 'string' || !isScriptSpecifier(specifier.value)) continue;
        const parsed = parseStaticClause(tokens, index + 1, fromIndex, token.value);
        records.push({ file, kind: token.value, specifier: specifier.value, ...parsed });
    }

    return records;
}

function comparableRecord(record) {
    return {
        file: record.file,
        kind: record.kind,
        specifier: record.specifier,
        names: [...new Set(record.names)].sort(),
    };
}

function compareRecords(left, right) {
    return left.file.localeCompare(right.file)
        || left.kind.localeCompare(right.kind)
        || left.specifier.localeCompare(right.specifier);
}

function collectParsedScriptJsImports(root = repoRoot) {
    const scriptsRoot = path.join(root, 'public/scripts');
    return collectJavaScriptFiles(scriptsRoot).flatMap(absolutePath => {
        const source = fs.readFileSync(absolutePath, 'utf8');
        const file = path.relative(scriptsRoot, absolutePath).split(path.sep).join('/');
        return collectParsedImports(source, file);
    });
}

export function collectFirstPartyScriptJsImports(root = repoRoot) {
    return collectParsedScriptJsImports(root)
        .map(comparableRecord)
        .sort(compareRecords);
}

export function collectFirstPartyScriptJsImporters(root = repoRoot) {
    return [...new Set(collectFirstPartyScriptJsImports(root).map(record => record.file))].sort();
}

export function collectForbiddenNameImporters(names, root = repoRoot) {
    const forbidden = new Set(names);
    const hitsByFile = new Map();

    function addHit(file, importedNames) {
        const namesForFile = hitsByFile.get(file) ?? new Set();
        importedNames.forEach(name => namesForFile.add(name));
        hitsByFile.set(file, namesForFile);
    }

    for (const record of collectParsedScriptJsImports(root)) {
        const directHits = record.names.includes('*') && !record.binding
            ? [...forbidden]
            : record.names.filter(name => forbidden.has(name));
        if (directHits.length) addHit(record.file, directHits);

        if (!record.binding) continue;
        const source = fs.readFileSync(path.join(root, 'public/scripts', record.file), 'utf8');
        const tokens = tokenizeJavaScript(source);
        const bindingIndex = tokens.findIndex(token => token.value === record.binding);
        const memberNames = new Set();

        for (let index = bindingIndex; index >= 0 && index < tokens.length; index++) {
            if (tokens[index].value !== record.binding) continue;
            let memberIndex = index + 1;
            if (tokens[memberIndex]?.value === '?') memberIndex++;
            if (tokens[memberIndex]?.value === '.') memberIndex++;
            if (tokens[memberIndex]?.kind === 'identifier' && forbidden.has(tokens[memberIndex].value)) {
                memberNames.add(tokens[memberIndex].value);
            }
            if (tokens[memberIndex]?.value === '[' && tokens[memberIndex + 1]?.kind === 'string' && forbidden.has(tokens[memberIndex + 1].value)) {
                memberNames.add(tokens[memberIndex + 1].value);
            }
        }

        if (memberNames.size) addHit(record.file, [...memberNames]);
    }

    return [...hitsByFile.entries()]
        .map(([file, found]) => ({ file, names: [...found] }))
        .sort((left, right) => left.file.localeCompare(right.file));
}
