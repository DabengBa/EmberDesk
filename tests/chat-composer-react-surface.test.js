import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function extractSendFormBlock(html) {
    const match = html.match(/<div id="send_form"[^>]*>([\s\S]*?)<\/div>/);
    return match ? match[0] : '';
}

describe('chat composer React surface', () => {
    const indexHtml = readRepoFile('app/components/workspace/WorkspaceHost.tsx');
    const composer = readRepoFile('app/components/composer/ChatComposer.tsx');
    const workspace = readRepoFile('app/workspace-panels.tsx');
    const script = readRepoFile('public/script.js');

    test('send_form shell is preserved while owned inner markup is replaced by React host', () => {
        const block = extractSendFormBlock(indexHtml);
        expect(block).toContain('id="send_form"');
        expect(block).toContain('className="no-connection"');
        // Owned inner markup must be gone from the shell.
        expect(block).not.toContain('id="send_textarea"');
        expect(block).not.toContain('id="nonQRFormItems"');
    });

    test('React component preserves all composer contract IDs', () => {
        const ids = [
            'file_form', 'file_form_input', 'embed_file_input', 'file_form_reset',
            'nonQRFormItems', 'leftSendForm', 'options_button',
            'send_textarea', 'send_textarea_hint', 'rightSendForm',

            'mes_stop', 'send_but',
        ];
        for (const id of ids) {
            expect(composer).toContain(`id="${id}"`);
        }
    });

    test('icon action controls use ContractIconButton', () => {
        // Astryx-migrated icon buttons keep their legacy ids/classes.
        for (const id of ['send_but', 'mes_stop', 'options_button', 'file_form_reset']) {
            expect(composer).toMatch(new RegExp(`<ContractIconButton[\\s\\S]*?id="${id}"`));
        }

    });

    test('send_textarea renders the shared service snapshot through React', () => {
        const textarea = composer.match(/<textarea id="send_textarea"[^>]*>/)?.[0] ?? '';
        expect(composer).toContain('value={snapshot.value}');
        expect(composer).toContain('onChange={event => composer.setComposerValue');
        expect(textarea).toContain('name="text"');
        expect(textarea).toContain('no_connection_text');
        expect(textarea).toContain('connected_text');
    });

    test('mount runs before native workspace startup and options popper is lazy', () => {
        expect(script).toContain('async function mountChatComposer()');
        expect(script).toContain('module.mountChatComposer(host, {');
        const entry = readRepoFile('app/components/workspace/workspace-entry.ts');
        const domHandlersSource = readRepoFile('public/script.js');
        const mountIdx = entry.indexOf('await mounts.mountChatComposer();');
        const bindIdx = entry.indexOf('await startWorkspaceRuntime(');
        expect(mountIdx).toBeGreaterThan(-1);
        expect(bindIdx).toBeGreaterThan(-1);
        expect(mountIdx).toBeLessThan(bindIdx);
        expect(domHandlersSource).not.toContain('userInputGenerateMutex');
        expect(script).not.toContain('bindMainChatReactComposerCommandPort');
        // The Options portal creates its Popper on first open, not at module evaluation.
        const options = readRepoFile('app/components/options-menu/OptionsMenu.tsx');
        expect(options).toContain("popper ??= runtime.createPopper(button, menu, { placement: 'top-start' });");
        expect(script).not.toContain('function getOptionsPopper()');
    });
});
