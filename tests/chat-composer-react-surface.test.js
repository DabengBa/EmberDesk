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
    const match = html.match(/<div id="send_form"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
    return match ? match[0] : '';
}

describe('chat composer React surface', () => {
    const indexHtml = readRepoFile('public/index.html');
    const composer = readRepoFile('app/components/composer/ChatComposer.tsx');
    const workspace = readRepoFile('app/workspace-panels.tsx');
    const script = readRepoFile('public/script.js');

    test('send_form shell is preserved while owned inner markup is replaced by React host', () => {
        const block = extractSendFormBlock(indexHtml);
        expect(block).toContain('id="send_form"');
        expect(block).toContain('class="no-connection"');
        // Owned inner markup must be gone from the shell.
        expect(block).not.toContain('id="send_textarea"');
        expect(block).not.toContain('id="nonQRFormItems"');
    });

    test('React component preserves all composer contract IDs', () => {
        const ids = [
            'file_form', 'file_form_input', 'embed_file_input', 'file_form_reset',
            'nonQRFormItems', 'leftSendForm', 'options_button',
            'send_textarea', 'send_textarea_hint', 'rightSendForm',
            'stscript_continue', 'stscript_pause', 'stscript_stop',
            'mes_stop', 'send_but',
        ];
        for (const id of ids) {
            expect(composer).toContain(`id="${id}"`);
        }
    });

    test('icon action controls migrate to ContractIconButton while stscript stays tag-qualified divs', () => {
        // Astryx-migrated icon buttons keep their legacy ids/classes.
        for (const id of ['send_but', 'mes_stop', 'options_button', 'file_form_reset']) {
            expect(composer).toMatch(new RegExp(`<ContractIconButton[\\s\\S]*?id="${id}"`));
        }
        // stscript visibility is driven by `#rightSendForm>div.stscript_btn`
        // (tag-qualified, nested under .isExecutingCommandsFromChatInput /
        // .script_paused) — a <button> tag would break that chain.
        for (const id of ['stscript_continue', 'stscript_pause', 'stscript_stop']) {
            expect(composer).toMatch(new RegExp(`<div id="${id}"[\\s\\S]*?className="[^"]*stscript_btn`));
        }
        const styleCss = readRepoFile('public/style.css');
        expect(styleCss).toContain('#rightSendForm>div:not(.mes_send).stscript_btn');
    });

    test('send_textarea stays uncontrolled with legacy write contract intact', () => {
        // No value/onChange props — jQuery .val() + input events are the write path.
        const textarea = composer.match(/<textarea id="send_textarea"[^>]*>/)?.[0] ?? '';
        expect(textarea).not.toContain('value=');
        expect(textarea).not.toContain('onChange');
        expect(textarea).toContain('name="text"');
        expect(textarea).toContain('no_connection_text');
        expect(textarea).toContain('connected_text');
    });

    test('mount runs before DOM-ready handler bindings and options popper is lazy', () => {
        expect(script).toContain('async function mountChatComposer()');
        expect(script).toContain('module.mountChatComposer(host)');
        // mount must be awaited at the top of the jQuery ready callback,
        // before the binding section that attaches send_but/send_textarea handlers.
        const domHandlersSource = readRepoFile('public/scripts/dom-handlers.js');
        const mountIdx = domHandlersSource.indexOf('await mountChatComposer();');
        const bindIdx = domHandlersSource.indexOf("$('#send_textarea').on('focusin focus click'");
        expect(mountIdx).toBeGreaterThan(-1);
        expect(bindIdx).toBeGreaterThan(-1);
        expect(mountIdx).toBeLessThan(bindIdx);
        // optionsPopper is created lazily, not at module eval time.
        expect(script).toContain('function getOptionsPopper()');
        expect(script).not.toMatch(/let optionsPopper = Popper\.createPopper/);
    });
});
