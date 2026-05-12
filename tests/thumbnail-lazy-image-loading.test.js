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

function expectFragment(source, fragment) {
    expect(source).toContain(fragment);
}

describe('thumbnail lazy image loading templates', () => {
    test('index templates include lazy-loading and async-decoding on list avatar images', () => {
        const indexHtml = read('public/index.html');

        expectFragment(indexHtml, '<div id="character_template" class="template_element">');
        expectFragment(indexHtml, '<img src="" loading="lazy" decoding="async">');

        expectFragment(indexHtml, '<div id="inline_avatar_template" class="template_element">');
        expectFragment(indexHtml, '<div class="avatar inline_avatar flex alignitemscenter textAlignCenter">');

        expectFragment(indexHtml, '<div id="group_member_template" class="template_element">');
        expectFragment(indexHtml, '<img alt="Avatar" src="" loading="lazy" decoding="async" />');

        expectFragment(indexHtml, '<div id="group_avatars_template" class="template_element">');
        expectFragment(indexHtml, '<img alt="img4" class="img_4" src="" loading="lazy" decoding="async">');

        expectFragment(indexHtml, '<div id="past_chat_template" class="template_element">');
        expectFragment(indexHtml, '<div class="avatar"><img src="" loading="lazy" decoding="async"></div>');
    });

    test('welcome recent chat template includes lazy-loading and async-decoding', () => {
        const welcomePanel = read('public/scripts/templates/welcomePanel.html');

        expectFragment(welcomePanel, '<img src="{{char_thumbnail}}" alt="{{char_name}}" loading="lazy" decoding="async">');
    });
});
