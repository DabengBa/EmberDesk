import { expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

test('legacy shell no longer binds avatar, favorite, or form submit events', () => {
    const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
    expect(source).not.toContain("getElementById('add_avatar_button')");
    expect(source).not.toContain("getElementById('favorite_button')?.addEventListener");
    expect(source).not.toContain("getElementById('form_create')?.addEventListener('submit'");
});
