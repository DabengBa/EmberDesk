import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
    assertInternalNamesExcludedFromPublicManifest,
    collectSillyTavernImports,
    expectNamedExports,
    expectObjectLiteralEntries,
    extractFunctionSource,
    formatContractFailure,
    frontendCompatibilityContract,
    getContractEntriesByFamily,
    readPublicFile,
    requiredExtensionExports,
    requiredRegexExports,
    requiredRegexPlacements,
    requiredScriptExports,
    requiredSlashCommandExports,
    resolveSillyTavernImport,
    tavernHelperCriticalEvents,
    extensionMessageMutationMarkers,
} from './helpers/frontend-compatibility-contract.js';

const {
    paths,
    publicShape,
    exclusions,
    entries: contractEntries,
} = frontendCompatibilityContract;

const {
    indexHtmlPath,
    tavernHelperRoot,
    tavernHelperDistPath,
    publicRoot,
} = paths;

describe('frontend compatibility contract manifest', () => {
    test('records provider-neutral contract families without freezing legacy paths as permanent APIs', () => {
        expect(frontendCompatibilityContract.version).toBe(1);
        expect(frontendCompatibilityContract.primaryConsumer).toBe('JS-Slash-Runner');
        expect(frontendCompatibilityContract.families).toEqual(expect.arrayContaining([
            'globals',
            'events',
            'aliases',
            'slash',
            'regex',
            'mounts',
            'selectors',
            'message-mutation',
            'internal-bridge',
        ]));

        for (const entry of contractEntries) {
            expect(entry).toEqual(expect.objectContaining({
                id: expect.any(String),
                family: expect.any(String),
                behavior: expect.any(String),
                currentProvider: expect.any(String),
                replacementProvider: expect.any(String),
                proofCommand: expect.any(String),
                deletionReadiness: expect.stringMatching(/^(not-ready|proof-pending|ready-when-replacement-proven)$/),
            }));
            expect(entry.behavior.toLowerCase()).not.toContain('must keep file path');
            expect(entry.replacementProvider).not.toMatch(/^public\/.+\.js$/);
        }

        expect(getContractEntriesByFamily('selectors').length).toBeGreaterThan(0);
        expect(getContractEntriesByFamily('message-mutation').length).toBeGreaterThan(0);
        expect(exclusions.publicNames).toEqual(expect.arrayContaining([
            '__emberDeskReactCompatibilityBridge',
        ]));
    });

    test('keeps internal bridge names out of the public contract surface', () => {
        expect(() => assertInternalNamesExcludedFromPublicManifest()).not.toThrow();
        for (const name of exclusions.publicNames) {
            expect(publicShape.scriptExports).not.toContain(name);
            expect(publicShape.extensionExports).not.toContain(name);
            expect(publicShape.slashCommandExports).not.toContain(name);
        }
    });
});

describe('third-party extension compatibility boundary', () => {
    test('keeps extension, wand menu, and regex mount points available', () => {
        const family = 'mounts';
        const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
        const wandMenuTemplate = readPublicFile('scripts', 'templates', 'wandMenu.html');
        const wandButtonTemplate = readPublicFile('scripts', 'templates', 'wandButton.html');
        const extensionsSource = readPublicFile('scripts', 'extensions.js');

        try {
            expect(indexHtml).toContain('id="extensions_settings"');
            expect(indexHtml).toContain('id="extensions_settings2"');
            expect(indexHtml).toContain('id="regex_container"');
            expect(wandMenuTemplate).toContain('id="extensionsMenu"');
            expect(wandButtonTemplate).toContain('id="extensionsMenuButton"');
            expect(extensionsSource).toContain('renderTemplateAsync(\'wandMenu\')');
            expect(extensionsSource).toContain('append(extensionsMenuHTML)');
        } catch (error) {
            throw new Error(formatContractFailure(family, error.message));
        }
    });

    test('keeps Tavern Helper manifest and distributable assets loadable', () => {
        const family = 'mounts';
        try {
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
            expect(bundledEntry).toContain('from\'../../../../../scripts/extensions.js\'');
            expect(bundledEntry).toContain('from\'../../../../../scripts/extensions/regex/engine.js\'');
        } catch (error) {
            throw new Error(formatContractFailure(family, error.message));
        }
    });

    test('keeps Tavern Helper create_character payload on the avatar-first compatibility path', () => {
        const family = 'aliases';
        try {
            const tavernSource = fs.readFileSync(
                path.join(tavernHelperRoot, 'src', 'util', 'tavern.ts'),
                'utf8',
            );
            const bundledEntry = fs.readFileSync(tavernHelperDistPath, 'utf8');

            expect(tavernSource).toContain('avatar_url: character.avatar || `${character.name}.png`');
            expect(tavernSource).not.toContain('avatar_url: character.name + \'.png\'');

            expect(bundledEntry).not.toContain('avatar_url:e+\'.png\'');
            expect(bundledEntry).not.toContain('new File([t.avatar],e+\'.png\')');
            expect(bundledEntry).toMatch(/avatar_url:[a-zA-Z_$][\w$]*,avatar:/);
            expect(bundledEntry).toMatch(/new File\(\[[a-zA-Z_$][\w$]*\.avatar\],[a-zA-Z_$][\w$]*\)/);
            expect(bundledEntry).toContain('||`${');
            expect(bundledEntry).toContain('}.png`');
        } catch (error) {
            throw new Error(formatContractFailure(family, error.message));
        }
    });

    test('keeps Tavern Helper source imports resolvable through the public SillyTavern alias', () => {
        const family = 'aliases';
        try {
            const imports = collectSillyTavernImports();
            expect(imports).toContain('@sillytavern/script');
            expect(imports).toContain('@sillytavern/scripts/extensions');
            expect(imports).toContain('@sillytavern/scripts/extensions/regex/engine');

            const unresolved = imports
                .map(importPath => ({ importPath, target: resolveSillyTavernImport(importPath) }))
                .filter(({ target }) => !fs.existsSync(target));

            expect(unresolved).toEqual([]);
        } catch (error) {
            throw new Error(formatContractFailure(family, error.message));
        }
    });

    test('keeps key SillyTavern module exports used by Tavern Helper and regex scripts', () => {
        const family = 'globals';
        try {
            expect.hasAssertions();
            expect(requiredScriptExports).toContain('eventSource');

            expectNamedExports(readPublicFile('script.js'), requiredScriptExports, { family });
            expectNamedExports(readPublicFile('scripts', 'extensions.js'), requiredExtensionExports, { family: 'mounts' });
            expectNamedExports(readPublicFile('scripts', 'extensions', 'regex', 'engine.js'), requiredRegexExports, { family: 'regex' });
        } catch (error) {
            throw new Error(formatContractFailure(family, error.message.replace(/^\[compat:[^\]]+\]\s*/, '')));
        }
    });

    test('keeps slash-command public exports stable for compatible extensions', () => {
        const family = 'slash';
        try {
            const slashCommandSource = readPublicFile('scripts', 'slash-commands.js');
            expectNamedExports(slashCommandSource, requiredSlashCommandExports, { family });
        } catch (error) {
            throw new Error(formatContractFailure(family, error.message.replace(/^\[compat:[^\]]+\]\s*/, '')));
        }
    });

    test('keeps generated character list rows compatible with legacy selector contracts', () => {
        const family = 'selectors';
        try {
            const characterLibraryRoot = path.resolve(publicRoot, '..', 'app', 'components', 'character-library');
            const characterRowSource = fs.readFileSync(path.join(characterLibraryRoot, 'CharacterLibraryCharacterRow.tsx'), 'utf8');
            const groupRowSource = fs.readFileSync(path.join(characterLibraryRoot, 'CharacterLibraryGroupRow.tsx'), 'utf8');
            const folderRowSource = fs.readFileSync(path.join(characterLibraryRoot, 'CharacterLibraryFolderRow.tsx'), 'utf8');
            const backBlockSource = fs.readFileSync(path.join(characterLibraryRoot, 'CharacterLibraryStatusBlocks.tsx'), 'utf8');
            const rowHelperSource = fs.readFileSync(path.resolve(characterLibraryRoot, '..', '..', 'lib', 'character-library-row-helpers.ts'), 'utf8');

            expect(rowHelperSource).toContain('character_select entity_block flex-container wide100p alignitemsflexstart');
            expect(characterRowSource).toContain('data-chid={String(model.id)}');
            expect(characterRowSource).toContain('{...{ chid: String(model.id) }}');
            expect(characterRowSource).toContain('id={buildCharacterRowDomId(model.id)}');
            expect(characterRowSource).toContain('className="ch_fav"');
            expect(characterRowSource).toContain('className="tags tags_inline"');
            expect(characterRowSource).toContain('className="bulk_select_checkbox"');
            expect(characterRowSource).toContain('event.stopPropagation();');
            expect(groupRowSource).toContain('group_select entity_block');
            expect(folderRowSource).toContain('bogus_folder_select entity_block');
            expect(folderRowSource).toContain('{...{ tagid: String(id) }}');
            expect(backBlockSource).toContain("{...{ tagid: 'back' }}");
            expect(backBlockSource).toContain('event.stopPropagation();');
        } catch (error) {
            throw new Error(formatContractFailure(family, error.message.replace(/^\[compat:[^\]]+\]\s*/, '')));
        }
    });

    test('keeps event emitter methods and event and regex placement values stable for Tavern Helper integrations', async () => {
        const family = 'events';
        try {
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

            expectObjectLiteralEntries(eventSourceCode, 'event_types', tavernHelperCriticalEvents, { family });
            expectObjectLiteralEntries(regexEngineCode, 'regex_placement', requiredRegexPlacements, { family: 'regex' });

            for (const [name, value] of Object.entries(tavernHelperCriticalEvents)) {
                expect(event_types[name]).toBe(value);
            }
        } catch (error) {
            throw new Error(formatContractFailure(family, error.message.replace(/^\[compat:[^\]]+\]\s*/, '')));
        }
    });

    test('records extension-owned message mutation markers as a message-mutation contract family', () => {
        const family = 'message-mutation';
        try {
            const renderHelpers = [
                path.join(publicRoot, 'scripts', 'extensions', 'third-party', 'JS-Slash-Runner', 'src', 'panel', 'render', 'StreamingOne.vue'),
                path.join(publicRoot, 'scripts', 'extensions', 'third-party', 'JS-Slash-Runner', 'src', 'store', 'iframe_runtimes', 'message.ts'),
            ];

            for (const marker of extensionMessageMutationMarkers) {
                const found = renderHelpers.some(filePath => fs.readFileSync(filePath, 'utf8').includes(marker));
                expect(found).toBe(true);
            }

            const messageMutationEntries = getContractEntriesByFamily('message-mutation');
            expect(messageMutationEntries.length).toBeGreaterThan(0);
            expect(messageMutationEntries[0].proofCommand).toContain('third-party-extension-runtime.e2e.js');
        } catch (error) {
            throw new Error(formatContractFailure(family, error.message));
        }
    });

    test('keeps /lib.js path available as the shared browser library boundary', () => {
        const family = 'aliases';
        try {
            expect(fs.existsSync(paths.libJsPath) || fs.existsSync(path.join(publicRoot, 'lib.js'))).toBe(true);
            const libSource = fs.existsSync(paths.libJsPath)
                ? fs.readFileSync(paths.libJsPath, 'utf8')
                : '';
            // Source or built artifact may be present; path contract is the public serve name.
            expect(paths.libJsPath.endsWith(`${path.sep}lib.js`)).toBe(true);
            void libSource;
        } catch (error) {
            throw new Error(formatContractFailure(family, error.message));
        }
    });
});
