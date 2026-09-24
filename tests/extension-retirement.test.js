import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPublicFile, readRepoFile } from './helpers/frontend-compatibility-contract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

describe('third-party extension retirement (E-cut-1)', () => {
    test('third-party extension directory, fixtures script, and vendored fixture are gone', () => {
        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'extensions', 'third-party'))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, 'scripts', 'fetch-third-party-extension-fixtures.mjs'))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'extensions', 'token-counter'))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'extensions', 'quick-reply'))).toBe(false);
    });

    test('third-party static file route and feature guard import are removed from users.js', () => {
        const usersSource = readRepoFile('src/users.js');
        expect(usersSource).not.toContain('scripts/extensions/third-party');
        expect(usersSource).not.toContain('extensionsEnabledFeatureGuard');
    });

    test('regex is a fixed feature mounted in the standalone RegexPanel workspace drawer', () => {
        const indexHtml = readPublicFile('index.html');
        expect(indexHtml).toContain('id="RegexPanel"');
        expect(indexHtml).not.toContain('id="regex_container"');
        expect(indexHtml).toContain('scripts/extensions/regex/style.css');

        const regexSource = readRepoFile('public/scripts/extensions/regex/index.js');
        expect(regexSource).toContain("document.getElementById('RegexPanel')");
        expect(regexSource).not.toContain('#regex_container');
        expect(regexSource).not.toContain('disabledExtensions');
    });

    test('built-in features init directly instead of through the extension manifest pipeline', () => {
        const extensionsSource = readRepoFile('public/scripts/extensions.js');
        expect(extensionsSource).toContain('export async function initCoreFeatureExtensions()');
        expect(extensionsSource).toContain("import('./extensions/connection-manager/index.js')");
        expect(extensionsSource).toContain("import('./extensions/regex/index.js')");

        const scriptSource = readPublicFile('script.js');
        expect(scriptSource).toContain('initCoreFeatureExtensions');
        expect(scriptSource).not.toContain('loadExtensionSettings');
        expect(scriptSource).not.toContain('doDailyExtensionUpdatesCheck');
    });

    test('core feature init is retry-safe: successful inits are cached and only failures re-run', () => {
        const extensionsSource = readRepoFile('public/scripts/extensions.js');
        expect(extensionsSource).toContain('coreFeatureInitPromises');
        expect(extensionsSource).toContain('initCoreFeatureOnce');
        expect(extensionsSource).toContain('coreFeatureInitPromises.delete(key)');
        expect(extensionsSource).toContain("initCoreFeatureOnce('connection-manager'");
        expect(extensionsSource).toContain("initCoreFeatureOnce('regex'");
    });

    test('regex opens through the workspace shell navigation as its own panel kind', () => {
        const scriptSource = readPublicFile('script.js');
        expect(scriptSource).toContain("case 'regex':");
        expect(scriptSource).toContain('openWorkspaceShellRegex');
        expect(scriptSource).toContain("'RegexPanel'");

        const workspacePanelSource = readRepoFile('app/workspace-panels.tsx');
        expect(workspacePanelSource).toContain("command: 'openRegex'");
        expect(workspacePanelSource).toContain("panelKind: 'regex'");
        expect(workspacePanelSource).not.toContain('regexContainerPresent');
    });

    test('wand extension menu artifacts are removed', () => {
        const extensionsSource = readRepoFile('public/scripts/extensions.js');
        expect(extensionsSource).not.toContain('addExtensionsButtonAndMenu');
        expect(extensionsSource).not.toContain('showHideExtensionsMenu');
        expect(extensionsSource).not.toContain("$('#extensionsMenuButton')");
        expect(extensionsSource).not.toContain("$('#extensionsMenu')");

        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'templates', 'wandButton.html'))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'templates', 'wandMenu.html'))).toBe(false);

        const keyboardSource = readRepoFile('public/scripts/keyboard.js');
        expect(keyboardSource).not.toContain('extensionsMenu');
    });

    test('/qr-arg is a first-class default slash command, not an extension stub', () => {
        const slashSource = readRepoFile('public/scripts/slash-commands.js');
        const initBody = slashSource.match(/export function initDefaultSlashCommands\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
        expect(initBody).toContain("name: 'qr-arg'");
        expect(initBody).toContain("setMacro(`arg::${key}`");
    });

    test('internal SillyTavern/getContext API is retained as first-party infrastructure', () => {
        const publicApiSource = readRepoFile('public/scripts/public-api.js');
        expect(publicApiSource).toContain('globalThis.SillyTavern');

        const scriptSource = readPublicFile('script.js');
        expect(scriptSource).toContain("import { getContext } from './scripts/st-context.js'");
        expect(scriptSource).toContain('getExtensionContext: () => getContext()');
    });
});
