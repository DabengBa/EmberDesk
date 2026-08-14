/**
 * Provider-neutral frontend compatibility contract manifest.
 * Test-only structured data used by `pnpm run test:compat` and retirement gates.
 * Behavior is the contract; legacy file paths are current providers, not permanent APIs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const publicRoot = path.join(repoRoot, 'public');
const tavernHelperRoot = path.join(publicRoot, 'scripts', 'extensions', 'third-party', 'JS-Slash-Runner');
const tavernHelperSourceRoot = path.join(tavernHelperRoot, 'src');

/** Contract families used for failure localization. */
export const COMPAT_CONTRACT_FAMILIES = Object.freeze([
    'globals',
    'events',
    'aliases',
    'slash',
    'regex',
    'mounts',
    'selectors',
    'message-mutation',
    'internal-bridge',
]);

export const requiredScriptExports = Object.freeze([
    'characters',
    'chat',
    'eventSource',
    'event_types',
    'getCurrentChatId',
    'getRequestHeaders',
    'printMessages',
    'reloadMarkdownProcessor',
    'saveChatConditional',
    'saveSettingsDebounced',
    'substituteParams',
    'substituteParamsExtended',
    'this_chid',
]);

export const requiredExtensionExports = Object.freeze([
    'extension_settings',
    'getContext',
    'renderExtensionTemplateAsync',
    'saveMetadataDebounced',
    'writeExtensionField',
]);

export const requiredRegexExports = Object.freeze([
    'getRegexedString',
    'regex_placement',
]);

export const requiredSlashCommandExports = Object.freeze([
    'executeSlashCommands',
    'executeSlashCommandsWithOptions',
    'getSlashCommandsHelp',
    'registerSlashCommand',
    'parser',
    'CONNECT_API_MAP',
    'UNIQUE_APIS',
    'initDefaultSlashCommands',
    'COMMENT_NAME_DEFAULT',
    'processChatSlashCommands',
    'generateSystemMessage',
    'validateArrayArgString',
    'validateArrayArg',
    'getNameAndAvatarForMessage',
    'sendMessageAs',
    'sendNarratorMessage',
    'promptQuietForLoudResponse',
    'isExecutingCommandsFromChatInput',
    'commandsFromChatInputAbortController',
    'activateScriptButtons',
    'deactivateScriptButtons',
    'pauseScriptExecution',
    'stopScriptExecution',
    'executeSlashCommandsOnChatInput',
    'setSlashCommandAutoComplete',
    'initSlashCommandAutoComplete',
]);

export const tavernHelperCriticalEvents = Object.freeze({
    APP_READY: 'app_ready',
    CHAT_CHANGED: 'chat_id_changed',
    CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready',
    CHARACTER_DELETED: 'characterDeleted',
    CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
    CHARACTER_RENAMED: 'character_renamed',
    GENERATE_AFTER_DATA: 'generate_after_data',
    MESSAGE_RECEIVED: 'message_received',
    OAI_PRESET_CHANGED_AFTER: 'oai_preset_changed_after',
    PRESET_DELETED: 'preset_deleted',
    PRESET_RENAMED_BEFORE: 'preset_renamed_before',
    SETTINGS_UPDATED: 'settings_updated',
    TTS_AUDIO_READY: 'tts_audio_ready',
    TTS_JOB_COMPLETE: 'tts_job_complete',
    TTS_JOB_STARTED: 'tts_job_started',
    USER_MESSAGE_RENDERED: 'user_message_rendered',
});

export const requiredRegexPlacements = Object.freeze({
    USER_INPUT: 1,
    AI_OUTPUT: 2,
    SLASH_COMMAND: 3,
    WORLD_INFO: 5,
    REASONING: 6,
});

export const characterRowSelectors = Object.freeze([
    '.character_select',
    '.bogus_folder_select',
    '[data-chid]',
    '[chid]',
    '#CharID${id}',
    '.character_selected',
    '.bulk_select_checkbox',
    '.tags_inline',
    '.ch_fav',
]);

export const messageRowMarkers = Object.freeze([
    '.mes',
    '.mes_text',
    '.mes_block',
    'data-mesid',
    'is_user',
    'is_system',
]);

/** Extension-owned lifecycle markers that React owners must not swallow. */
export const extensionMessageMutationMarkers = Object.freeze([
    'TH-streaming',
    'TH-render',
]);

/** Names that must never appear as public third-party contract entries. */
export const internalOnlyNames = Object.freeze([
    '__emberDeskReactCompatibilityBridge',
    'getGlobalCompatibilityBridgeSnapshot',
    'attachGlobalCompatibilityBridge',
    'detachGlobalCompatibilityBridge',
]);

/**
 * Provider-neutral contract entries used by retirement readiness gates.
 * `currentProvider` is descriptive metadata, not a frozen path contract.
 * @type {ReadonlyArray<Readonly<{
 *   id: string,
 *   family: string,
 *   behavior: string,
 *   currentProvider: string,
 *   replacementProvider: string,
 *   proofCommand: string,
 *   deletionReadiness: 'not-ready' | 'proof-pending' | 'ready-when-replacement-proven',
 * }>>}
 */
export const compatibilityContractEntries = Object.freeze([
    {
        id: 'global-sillytavern',
        family: 'globals',
        behavior: 'globalThis.SillyTavern remains a supported public compatibility object without requiring the internal React bridge',
        currentProvider: 'public browser shell (script.js / lib boundary)',
        replacementProvider: 'same public object shape supplied by React-era shell without dual legacy owner',
        proofCommand: 'pnpm run test:compat',
        deletionReadiness: 'not-ready',
    },
    {
        id: 'event-source-and-types',
        family: 'events',
        behavior: 'eventSource emitter methods and event_types values remain stable for Tavern Helper and other supported consumers',
        currentProvider: 'public/scripts/events.js',
        replacementProvider: 'compatible emitter and event-name table owned by the React-era workspace shell',
        proofCommand: 'pnpm run test:compat',
        deletionReadiness: 'not-ready',
    },
    {
        id: 'sillytavern-import-aliases',
        family: 'aliases',
        behavior: '@sillytavern/* browser imports resolve into public modules used by JS-Slash-Runner',
        currentProvider: 'public/ module tree plus import maps / alias resolution',
        replacementProvider: 'stable browser import surface without requiring legacy page owners',
        proofCommand: 'pnpm run test:compat',
        deletionReadiness: 'not-ready',
    },
    {
        id: 'shared-browser-library',
        family: 'aliases',
        behavior: '/lib.js remains the shared browser library compatibility boundary',
        currentProvider: 'public/lib.js build/serve boundary',
        replacementProvider: 'same public import boundary after Vite-owned builds',
        proofCommand: 'pnpm run test:compat',
        deletionReadiness: 'ready-when-replacement-proven',
    },
    {
        id: 'slash-command-exports',
        family: 'slash',
        behavior: 'slash-command public exports remain callable for compatible extensions and automation',
        currentProvider: 'public/scripts/slash-commands.js',
        replacementProvider: 'compatible slash registry/executor reachable from the same public exports',
        proofCommand: 'pnpm run test:compat',
        deletionReadiness: 'not-ready',
    },
    {
        id: 'regex-exports-and-placements',
        family: 'regex',
        behavior: 'regex exports and regex_placement numeric values remain stable',
        currentProvider: 'public/scripts/extensions/regex/engine.js',
        replacementProvider: 'compatible regex provider with identical placement values',
        proofCommand: 'pnpm run test:compat',
        deletionReadiness: 'not-ready',
    },
    {
        id: 'extension-mount-points',
        family: 'mounts',
        behavior: 'extension drawers, wand menu, and regex mount nodes remain present and loadable',
        currentProvider: 'public/index.html templates and public/scripts/extensions.js',
        replacementProvider: 'React-owned mount protocol that keeps extension content reachable',
        proofCommand: 'pnpm run test:compat',
        deletionReadiness: 'not-ready',
    },
    {
        id: 'character-list-row-identity',
        family: 'selectors',
        behavior: 'character/group/folder rows preserve protected selectors and identity attributes',
        currentProvider: 'character list renderer (legacy or React-owned compatible rows)',
        replacementProvider: 'React Character Library as sole row producer with the same selectors',
        proofCommand: 'pnpm run test:compat; pnpm --dir tests run test:unit -- character-list-structure.test.js --runInBand',
        deletionReadiness: 'proof-pending',
    },
    {
        id: 'message-row-and-extension-mutation',
        family: 'message-mutation',
        behavior: 'message rows remain identifiable and extension-owned TH-streaming / TH-render mutations are not swallowed by React owners',
        currentProvider: 'React main-chat rich-body owner with stable mutation-zone hosts and preserveLiveContent',
        replacementProvider: 'React main-chat owner that preserves extension lifecycle markers via data-main-chat-mutation-zone hosts',
        proofCommand: 'pnpm run test:compat; pnpm --dir tests run test:e2e -- third-party-extension-runtime.e2e.js --workers=1',
        deletionReadiness: 'proof-pending',
    },
    {
        id: 'internal-react-compatibility-bridge',
        family: 'internal-bridge',
        behavior: 'internal React compatibility bridge must not become a public third-party API',
        currentProvider: 'app/compat/global-compatibility-bridge.js (first-party only)',
        replacementProvider: 'no public replacement; bridge remains internal-only',
        proofCommand: 'pnpm --dir tests run test:unit -- global-compatibility-bridge.test.js third-party-extension-compatibility.test.js --runInBand',
        deletionReadiness: 'ready-when-replacement-proven',
    },
]);

/**
 * Full manifest object consumed by compat tests.
 */
export const frontendCompatibilityContract = Object.freeze({
    version: 1,
    primaryConsumer: 'JS-Slash-Runner',
    families: COMPAT_CONTRACT_FAMILIES,
    entries: compatibilityContractEntries,
    publicShape: Object.freeze({
        scriptExports: requiredScriptExports,
        extensionExports: requiredExtensionExports,
        regexExports: requiredRegexExports,
        slashCommandExports: requiredSlashCommandExports,
        criticalEvents: tavernHelperCriticalEvents,
        regexPlacements: requiredRegexPlacements,
        characterRowSelectors,
        messageRowMarkers,
        extensionMessageMutationMarkers,
    }),
    exclusions: Object.freeze({
        publicNames: internalOnlyNames,
        reason: 'Internal React migration diagnostics and Zustand snapshots are not third-party APIs.',
    }),
    paths: Object.freeze({
        repoRoot,
        publicRoot,
        indexHtmlPath: path.join(publicRoot, 'index.html'),
        tavernHelperRoot,
        tavernHelperSourceRoot,
        tavernHelperDistPath: path.join(tavernHelperRoot, 'dist', 'index.js'),
        scriptPath: path.join(publicRoot, 'script.js'),
        eventsPath: path.join(publicRoot, 'scripts', 'events.js'),
        extensionsPath: path.join(publicRoot, 'scripts', 'extensions.js'),
        slashCommandsPath: path.join(publicRoot, 'scripts', 'slash-commands.js'),
        regexEnginePath: path.join(publicRoot, 'scripts', 'extensions', 'regex', 'engine.js'),
        libJsPath: path.join(publicRoot, 'lib.js'),
        bridgePath: path.join(repoRoot, 'app', 'compat', 'global-compatibility-bridge.js'),
    }),
});

export function getContractEntriesByFamily(family) {
    return compatibilityContractEntries.filter(entry => entry.family === family);
}

export function getContractEntry(id) {
    return compatibilityContractEntries.find(entry => entry.id === id) ?? null;
}

export function formatContractFailure(family, message) {
    return `[compat:${family}] ${message}`;
}

export function assertContract(family, condition, message) {
    if (!condition) {
        throw new Error(formatContractFailure(family, message));
    }
}

export function readPublicFile(...segments) {
    return fs.readFileSync(path.join(publicRoot, ...segments), 'utf8');
}

export function readRepoFile(...segments) {
    return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

export function extractFunctionSource(source, functionName) {
    const functionStart = source.indexOf(`function ${functionName}`);
    if (functionStart < 0) {
        throw new Error(formatContractFailure('selectors', `Could not find function ${functionName}`));
    }

    const bodyStart = source.indexOf('{', functionStart);
    if (bodyStart < 0) {
        throw new Error(formatContractFailure('selectors', `Could not find body for ${functionName}`));
    }

    let depth = 0;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}') depth--;
        if (depth === 0) {
            return source.slice(functionStart, i + 1);
        }
    }

    throw new Error(formatContractFailure('selectors', `Could not extract function source for ${functionName}`));
}

export function listSourceFiles(root) {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    return entries.flatMap((entry) => {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist') {
                return [];
            }
            return listSourceFiles(entryPath);
        }
        return /\.(js|ts|vue)$/.test(entry.name) ? [entryPath] : [];
    });
}

export function collectSillyTavernImports(sourceRoot = tavernHelperSourceRoot) {
    const imports = new Set();
    const importPattern = /(?:from\s*|import\s*\(\s*)['"](@sillytavern\/[^'"]+)['"]/g;
    for (const filePath of listSourceFiles(sourceRoot)) {
        const content = fs.readFileSync(filePath, 'utf8');
        for (const match of content.matchAll(importPattern)) {
            imports.add(match[1]);
        }
    }
    return [...imports].sort();
}

export function resolveSillyTavernImport(importPath) {
    return path.join(publicRoot, `${importPath.replace('@sillytavern/', '')}.js`);
}

export function sourceHasNamedExport(source, exportName) {
    const directExportPattern = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${exportName}\\b`);
    const listExportPattern = new RegExp(`export\\s*\\{[\\s\\S]*\\b${exportName}\\b[\\s\\S]*\\}`);
    return directExportPattern.test(source) || listExportPattern.test(source);
}

export function expectNamedExports(source, exportNames, { family = 'globals' } = {}) {
    for (const exportName of exportNames) {
        assertContract(
            family,
            sourceHasNamedExport(source, exportName),
            `missing public export "${exportName}"`,
        );
    }
}

export function expectObjectLiteralEntries(source, objectName, entries, { family = 'events' } = {}) {
    assertContract(
        family,
        new RegExp(`export\\s+const\\s+${objectName}\\s*=\\s*\\{`).test(source),
        `missing exported object ${objectName}`,
    );

    for (const [key, value] of Object.entries(entries)) {
        const entryPattern = typeof value === 'number'
            ? new RegExp(`\\b${key}\\s*:\\s*${value}\\b`)
            : new RegExp(`\\b${key}\\s*:\\s*['"]${value}['"]`);
        assertContract(
            family,
            entryPattern.test(source),
            `missing ${objectName}.${key} = ${JSON.stringify(value)}`,
        );
    }
}

export function publicManifestIncludesInternalName(name) {
    return compatibilityContractEntries.some(entry => (
        entry.id === name
        || entry.behavior.includes(name)
        || entry.currentProvider.includes(name)
        || entry.replacementProvider.includes(name)
    )) && !internalOnlyNames.includes(name)
        ? false
        : compatibilityContractEntries.some(entry => entry.family !== 'internal-bridge' && (
            entry.behavior.includes(name)
            || entry.currentProvider.includes(name)
            || entry.replacementProvider.includes(name)
        ));
}

export function assertInternalNamesExcludedFromPublicManifest() {
    for (const name of internalOnlyNames) {
        const publicHits = compatibilityContractEntries.filter(entry => (
            entry.family !== 'internal-bridge'
            && (
                entry.id === name
                || entry.behavior.includes(name)
                || entry.currentProvider.includes(name)
                || entry.replacementProvider.includes(name)
            )
        ));
        assertContract(
            'internal-bridge',
            publicHits.length === 0,
            `internal name "${name}" must not appear in public contract entries`,
        );
    }

    const bridgeEntry = getContractEntry('internal-react-compatibility-bridge');
    assertContract(
        'internal-bridge',
        bridgeEntry?.family === 'internal-bridge',
        'bridge entry must remain family=internal-bridge',
    );
}
