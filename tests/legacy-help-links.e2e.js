import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('legacy help links delegate clicks to the corresponding system messages', async ({ page }) => {
    await testSetup.awaitST({ page });

    const results = await page.evaluate(() => {
        const chat = window.SillyTavern.getContext().chat;
        const fixture = document.createElement('div');
        document.body.append(fixture);
        let bubbled = 0;
        const observe = () => { bubbled++; };
        window.addEventListener('click', observe);
        const results = [];

        try {
            for (const value of ['2', '3', '4', '  Chat Formatting  ', 'HOTKEY', 'Macro', 'unknown']) {
                const link = document.createElement('a');
                link.href = '#legacy-help';
                link.setAttribute('data-displayHelp', value);
                link.innerHTML = '<span>help</span>';
                fixture.append(link);
                const before = chat.length;
                const event = new MouseEvent('click', { bubbles: true, cancelable: true });
                link.firstElementChild.dispatchEvent(event);
                results.push({ prevented: event.defaultPrevented, added: chat.length - before, type: chat.at(-1)?.extra?.type });
            }
            return { results, bubbled };
        } finally {
            window.removeEventListener('click', observe);
            fixture.remove();
        }
    });

    expect(results.bubbled).toBe(7);
    expect(results.results).toEqual(['formatting', 'hotkeys', 'macros', 'formatting', 'hotkeys', 'macros', 'help']
        .map(type => ({ prevented: true, added: 1, type })));
});
