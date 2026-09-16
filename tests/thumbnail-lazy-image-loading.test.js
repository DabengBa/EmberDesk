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
        expectTemplateFragment(indexHtml, 'past_chat_template', '<div class="avatar"><img src="img/No-Image-Placeholder.svg" loading="lazy" decoding="async"></div>');
        expect(indexHtml).not.toContain('id="group_member_template"');
        expect(indexHtml).not.toContain('id="group_avatars_template"');
    });

    test('swipe picker removes inherited past-chat avatars', () => {
        const swipePicker = read('public/scripts/swipe-picker.js');

        expect(swipePicker).toContain('template.find(\'.avatar\').remove();');
    });

    test('character past chats keep their avatar template', () => {
        const scriptSource = read('public/script.js');

        expect(scriptSource).toContain("template.find('.avatar img').attr('src', avatarImg);");
        expect(scriptSource).not.toContain("replaceWith(groupAvatar.clone())");
    });
});
