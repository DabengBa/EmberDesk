import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('chat workspace structure', () => {
    test('keeps send-form controls discoverable by role and accessible name', () => {
        const indexHtml = read('public/index.html');

        [
            ['options_button', 'Chat options'],
            ['send_but', 'Send message'],
            ['mes_stop', 'Abort request'],
            ['mes_continue', 'Continue last message'],
            ['mes_impersonate', 'Ask AI to write your message'],
        ].forEach(([id, label]) => {
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[^>]*\\brole="button"`));
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[^>]*\\baria-label="${label}"`));
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[^>]*\\btabindex="0"`));
        });

        expect(indexHtml).toMatch(/id="send_textarea"[^>]*\baria-label="Chat message"/);
    });

    test('keeps chat options menu items keyboard reachable as buttons', () => {
        const indexHtml = read('public/index.html');

        [
            'option_toggle_AN',
            'option_toggle_CFG',
            'option_toggle_logprobs',
            'option_start_new_chat',
            'option_select_chat',
            'option_delete_mes',
            'option_regenerate',
            'option_impersonate',
            'option_continue',
        ].forEach((id) => {
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[^>]*\\brole="button"`));
            expect(indexHtml).toMatch(new RegExp(`id="${id}"[^>]*\\btabindex="0"`));
        });
    });
});
