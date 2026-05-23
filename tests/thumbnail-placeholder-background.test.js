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

function getAvatarImgRule(cssSource) {
    const match = cssSource.match(/\.avatar img\s*\{([\s\S]*?)\n\}/);
    expect(match).not.toBeNull();
    return match[1];
}

describe('thumbnail placeholder background', () => {
    test('shared .avatar img rule includes the theme placeholder background', () => {
        const styleSource = read('public/style.css');
        const avatarImgRule = getAvatarImgRule(styleSource);

        expect(avatarImgRule).toContain('background-color: var(--SmartThemeBlurTintColor);');
    });
});
