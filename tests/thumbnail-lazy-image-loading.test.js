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

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expectTemplateFragment(source, templateId, fragment) {
    const templateStart = `<div id="${templateId}" class="template_element">`;
    const matcher = new RegExp(`${escapeRegex(templateStart)}[\\s\\S]*?${escapeRegex(fragment)}`);
    expect(source).toMatch(matcher);
}

describe('thumbnail lazy image loading templates', () => {
    test('index templates include lazy-loading and async-decoding on list avatar images', () => {
        const indexHtml = read('public/index.html');

        expectTemplateFragment(indexHtml, 'character_template', '<img src="img/No-Image-Placeholder.svg" loading="lazy" decoding="async">');
        expectTemplateFragment(indexHtml, 'inline_avatar_template', '<img src="img/No-Image-Placeholder.svg" loading="lazy" decoding="async">');
        expectTemplateFragment(indexHtml, 'group_member_template', '<img alt="Avatar" src="img/No-Image-Placeholder.svg" loading="lazy" decoding="async" />');
        expectTemplateFragment(indexHtml, 'group_avatars_template', '<img alt="img4" class="img_4" src="img/No-Image-Placeholder.svg" loading="lazy" decoding="async">');
        expectTemplateFragment(indexHtml, 'past_chat_template', '<div class="avatar"><img src="img/No-Image-Placeholder.svg" loading="lazy" decoding="async"></div>');
    });

    test('swipe picker removes inherited past-chat avatars', () => {
        const swipePicker = read('public/scripts/swipe-picker.js');

        expect(swipePicker).toContain('template.find(\'.avatar\').remove();');
    });

    test('group past chats replace the template avatar with the real group avatar element', () => {
        const scriptSource = read('public/script.js');

        expect(scriptSource).toContain('template.find(\'.avatar\').replaceWith(groupAvatar.clone());');
    });
});
