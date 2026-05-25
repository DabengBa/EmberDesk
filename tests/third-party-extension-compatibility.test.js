import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const publicRoot = path.resolve('..', 'public');
const indexHtmlPath = path.join(publicRoot, 'index.html');
const tavernHelperRoot = path.join(publicRoot, 'scripts', 'extensions', 'third-party', 'JS-Slash-Runner');
const tavernHelperSourceRoot = path.join(tavernHelperRoot, 'src');

const requiredScriptExports = [
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
];

const requiredExtensionExports = [
    'extension_settings',
    'getContext',
    'renderExtensionTemplateAsync',
    'saveMetadataDebounced',
    'writeExtensionField',
];

const requiredRegexExports = [
    'getRegexedString',
    'regex_placement',
];

const tavernHelperCriticalEvents = {
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
    USER_MESSAGE_RENDERED: 'user_message_rendered',
};

const requiredRegexPlacements = {
    USER_INPUT: 1,
    AI_OUTPUT: 2,
    SLASH_COMMAND: 3,
    WORLD_INFO: 5,
    REASONING: 6,
};

function readPublicFile(...segments) {
    return fs.readFileSync(path.join(publicRoot, ...segments), 'utf8');
}

function extractFunctionSource(source, functionName) {
    const functionStart = source.indexOf(`function ${functionName}`);
    expect(functionStart).toBeGreaterThanOrEqual(0);

    const bodyStart = source.indexOf('{', functionStart);
    expect(bodyStart).toBeGreaterThanOrEqual(0);

    let depth = 0;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}') depth--;
        if (depth === 0) {
            return source.slice(functionStart, i + 1);
        }
    }

    throw new Error(`Could not extract function source for ${functionName}`);
}

function listSourceFiles(root) {
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

function collectSillyTavernImports() {
    const imports = new Set();
    const importPattern = /(?:from\s*|import\s*\(\s*)['"](@sillytavern\/[^'"]+)['"]/g;
    for (const filePath of listSourceFiles(tavernHelperSourceRoot)) {
        const content = fs.readFileSync(filePath, 'utf8');
        for (const match of content.matchAll(importPattern)) {
            imports.add(match[1]);
        }
    }
    return [...imports].sort();
}

function resolveSillyTavernImport(importPath) {
    return path.join(publicRoot, `${importPath.replace('@sillytavern/', '')}.js`);
}

function expectNamedExports(source, exportNames) {
    for (const exportName of exportNames) {
        const directExportPattern = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${exportName}\\b`);
        const listExportPattern = new RegExp(`export\\s*\\{[\\s\\S]*\\b${exportName}\\b[\\s\\S]*\\}`);
        expect(
            directExportPattern.test(source) || listExportPattern.test(source),
        ).toBe(true);
    }
}

function expectObjectLiteralEntries(source, objectName, entries) {
    for (const [key, value] of Object.entries(entries)) {
        const entryPattern = typeof value === 'number'
            ? new RegExp(`\\b${key}\\s*:\\s*${value}\\b`)
            : new RegExp(`\\b${key}\\s*:\\s*['"]${value}['"]`);
        expect(source).toMatch(new RegExp(`export\\s+const\\s+${objectName}\\s*=\\s*\\{`));
        expect(source).toMatch(entryPattern);
    }
}

describe('third-party extension compatibility boundary', () => {
    test('keeps extension, wand menu, and regex mount points available', () => {
        const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
        const wandMenuTemplate = readPublicFile('scripts', 'templates', 'wandMenu.html');
        const wandButtonTemplate = readPublicFile('scripts', 'templates', 'wandButton.html');
        const extensionsSource = readPublicFile('scripts', 'extensions.js');

        expect(indexHtml).toContain('id="extensions_settings"');
        expect(indexHtml).toContain('id="extensions_settings2"');
        expect(indexHtml).toContain('id="regex_container"');
        expect(wandMenuTemplate).toContain('id="extensionsMenu"');
        expect(wandButtonTemplate).toContain('id="extensionsMenuButton"');
        expect(extensionsSource).toContain('renderTemplateAsync(\'wandMenu\')');
        expect(extensionsSource).toContain('append(extensionsMenuHTML)');
    });

    test('keeps Tavern Helper manifest and distributable assets loadable', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(tavernHelperRoot, 'manifest.json'), 'utf8'));

        expect(manifest.display_name).toBe('酒馆助手');
        expect(manifest.homePage).toBe('https://github.com/N0VI028/JS-Slash-Runner');
        expect(manifest.loading_order).toBe(100);
        expect(manifest.js).toBe('dist/index.js');
        expect(manifest.css).toBe('dist/index.css');
        expect(manifest.minimum_client_version).toBe('1.12.13');
        expect(manifest.auto_update).toBe(true);

        expect(fs.existsSync(path.join(tavernHelperRoot, manifest.js))).toBe(true);
        expect(fs.existsSync(path.join(tavernHelperRoot, manifest.css))).toBe(true);

        const bundledEntry = fs.readFileSync(path.join(tavernHelperRoot, manifest.js), 'utf8');
        expect(bundledEntry).toContain('from\'../../../../../script.js\'');
        expect(bundledEntry).toContain('from\'../../../../../scripts/extensions/regex/engine.js\'');
        expect(bundledEntry).toContain('from\'../../../../../scripts/extensions.js\'');
        expect(bundledEntry).toContain('id="tavern_helper"');
        expect(bundledEntry).toContain('appendTo(\'#extensions_settings\')');
        expect(bundledEntry).toContain('globalThis.YAML');
        expect(bundledEntry).toContain('globalThis.z');

        expect(fs.readFileSync(path.join(tavernHelperRoot, 'src', 'function', 'index.ts'), 'utf8'))
            .toContain('globalThis.TavernHelper = getTavernHelper()');
    });

    test('keeps Tavern Helper source imports resolvable through the public SillyTavern alias', () => {
        const imports = collectSillyTavernImports();
        expect(imports).toContain('@sillytavern/script');
        expect(imports).toContain('@sillytavern/scripts/extensions');
        expect(imports).toContain('@sillytavern/scripts/extensions/regex/engine');

        const unresolved = imports
            .map(importPath => ({ importPath, target: resolveSillyTavernImport(importPath) }))
            .filter(({ target }) => !fs.existsSync(target));

        expect(unresolved).toEqual([]);
    });

    test('keeps key SillyTavern module exports used by Tavern Helper and regex scripts', () => {
        expect.hasAssertions();
        expect(requiredScriptExports).toContain('eventSource');

        expectNamedExports(readPublicFile('script.js'), requiredScriptExports);
        expectNamedExports(readPublicFile('scripts', 'extensions.js'), requiredExtensionExports);
        expectNamedExports(readPublicFile('scripts', 'extensions', 'regex', 'engine.js'), requiredRegexExports);
    });

    test('keeps generated character list rows compatible with legacy selector contracts', () => {
        const scriptSource = readPublicFile('script.js');
        const rowSource = extractFunctionSource(scriptSource, 'buildCharacterRowHtml');
        const bulkEditSource = readPublicFile('scripts', 'bulk-edit.js');
        const enableBulkSelectSource = extractFunctionSource(bulkEditSource, 'enableBulkSelect');
        const disableBulkSelectSource = extractFunctionSource(bulkEditSource, 'disableBulkSelect');

        expect(rowSource).toMatch(/return `<div class="character_select entity_block flex-container wide100p alignitemsflexstart\$\{isFav \? ' is_fav' : ''\}\$\{isActive \? ' is_active' : ''\}" data-chid="\$\{id\}" chid="\$\{id\}" id="CharID\$\{id\}">/);
        expect(rowSource).toMatch(/const isFav = item\.fav \|\| item\.fav == 'true';/);
        expect(rowSource).toMatch(/<input class="ch_fav" value="\$\{isFav\}" hidden \/>/);
        expect(rowSource).toMatch(/<div class="tags tags_inline">\$\{tagsHtml\}<\/div>/);
        expect(rowSource).toMatch(/tagsHtml \+= `<span class="tag tag_placeholder"><span class="tag_name">\+\$\{tagsSkipped\}<\/span><\/span>`;/);
        expect(scriptSource).toContain("$(document).on('click', '.character_select'");
        expect(enableBulkSelectSource).toMatch(/\$\(\'#rm_print_characters_block \.character_select\'\)\.each/);
        expect(enableBulkSelectSource).toMatch(/const checkbox = \$\('<input type=\\'checkbox\\' class=\\'bulk_select_checkbox\\'>'\);/);
        expect(disableBulkSelectSource).toContain("$('.bulk_select_checkbox').remove()");
    });

    test('keeps event emitter methods and event and regex placement values stable for Tavern Helper integrations', async () => {
        const { eventSource, event_types } = await import('../public/scripts/events.js');
        const eventSourceCode = readPublicFile('scripts', 'events.js');
        const regexEngineCode = readPublicFile('scripts', 'extensions', 'regex', 'engine.js');

        expect(eventSource).toEqual(expect.objectContaining({
            on: expect.any(Function),
            once: expect.any(Function),
            emit: expect.any(Function),
            emitAndWait: expect.any(Function),
            makeFirst: expect.any(Function),
            makeLast: expect.any(Function),
            removeListener: expect.any(Function),
        }));

        expectObjectLiteralEntries(eventSourceCode, 'event_types', tavernHelperCriticalEvents);
        expectObjectLiteralEntries(regexEngineCode, 'regex_placement', requiredRegexPlacements);

        for (const [name, value] of Object.entries(tavernHelperCriticalEvents)) {
            expect(event_types[name]).toBe(value);
        }
    });
});
