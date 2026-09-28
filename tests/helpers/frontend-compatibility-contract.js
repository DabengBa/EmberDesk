/**
 * Provider-neutral frontend compatibility contract manifest.
 * Test-only structured data used by `pnpm run test:compat` and retirement gates.
 * Behavior is the contract; legacy file paths are current providers, not permanent APIs.
 *
 * Third-party extension support has been retired: this manifest now pins only
 * surfaces our own shell and test infrastructure still depend on internally.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const publicRoot = path.join(repoRoot, 'public');

/** Contract families used for failure localization. */
export const COMPAT_CONTRACT_FAMILIES = Object.freeze([
    'events',
    'aliases',
    'slash',
    'regex',
    'selectors',
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
        id: 'event-source-and-types',
        family: 'events',
        behavior: 'eventSource emitter methods and event_types values remain stable for internal event consumers',
        currentProvider: 'public/scripts/events.js',
        replacementProvider: 'compatible emitter and event-name table owned by the React-era workspace shell',
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
        behavior: 'slash-command public exports remain callable for internal STscript automation and tests',
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
        id: 'character-list-row-identity',
        family: 'selectors',
        behavior: 'character/folder rows preserve the selectors and identity attributes internal consumers rely on',
        currentProvider: 'character list renderer (legacy or React-owned compatible rows)',
        replacementProvider: 'React Character Library as sole row producer with the same selectors',
        proofCommand: 'pnpm run test:compat; pnpm --dir tests run test:unit -- character-list-structure.test.js --runInBand',
        deletionReadiness: 'proof-pending',
    },
    {
        id: 'internal-react-compatibility-bridge',
        family: 'internal-bridge',
        behavior: 'internal React compatibility bridge must not become a public third-party API',
        currentProvider: 'app/compat/global-compatibility-bridge.js (first-party only)',
        replacementProvider: 'no public replacement; bridge remains internal-only',
        proofCommand: 'pnpm --dir tests run test:unit -- global-compatibility-bridge.test.js --runInBand',
        deletionReadiness: 'ready-when-replacement-proven',
    },
]);

/**
 * Full manifest object consumed by compat tests.
 */
export const frontendCompatibilityContract = Object.freeze({
    version: 1,
    families: COMPAT_CONTRACT_FAMILIES,
    entries: compatibilityContractEntries,
    publicShape: Object.freeze({
        scriptExports: requiredScriptExports,
        regexExports: requiredRegexExports,
        slashCommandExports: requiredSlashCommandExports,
        regexPlacements: requiredRegexPlacements,
        characterRowSelectors,
        messageRowMarkers,
    }),
    exclusions: Object.freeze({
        publicNames: internalOnlyNames,
        reason: 'Internal React migration diagnostics and Zustand snapshots are not public APIs.',
    }),
    paths: Object.freeze({
        repoRoot,
        publicRoot,
        indexHtmlPath: path.join(publicRoot, 'index.html'),
        scriptPath: path.join(publicRoot, 'script.js'),
        eventsPath: path.join(publicRoot, 'scripts', 'events.js'),
        extensionsPath: path.join(publicRoot, 'scripts', 'feature-settings.js'),
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
