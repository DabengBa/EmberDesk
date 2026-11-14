import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test.beforeEach(async ({ page }) => {
    await page.route(/\/lib\/jquery(?:-ui|\.transit)\.min\.js$/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await testSetup.awaitST({ page });
});

test('real workspace loader closes without UI and transit scripts', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const trigger = document.querySelector('#send_textarea');
        trigger.focus();
        const { showActionLoader } = await import('/scripts/action-loader.js');
        const first = showActionLoader({ toastMode: 'none', message: 'First' });
        const last = showActionLoader({ toastMode: 'none', message: 'Second' });
        const element = document.querySelector('#loader');
        document.querySelector('#load-spinner').style.transitionDuration = '1s';
        await first.hide();
        const firstAttached = element.isConnected;
        const hiding = last.hide();
        const style = { filter: element.style.filter, opacity: element.style.opacity, attached: element.isConnected };
        element.dispatchEvent(new Event('transitionend', { bubbles: true }));
        await hiding;
        return { firstAttached, style, removed: !element.isConnected, dialogOpen: Boolean(document.querySelector('dialog[open]')), focus: document.activeElement === trigger };
    });
    expect(result).toEqual({ firstAttached: true, style: { filter: 'blur(15px)', opacity: '0', attached: true }, removed: true, dialogOpen: false, focus: true });
});

test('real tag and folder templates apply and reset colors without plugin scripts', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const { appendTagToList, getTagBlock } = await import('/scripts/tags.js');
        const $ = window.jQuery;
        const host = $('<div>').appendTo(document.body);
        host[0].style.setProperty('--proof-tag-color', 'rgb(35, 80, 125)');
        const read = element => ({ inline: element.style.backgroundColor, computed: getComputedStyle(element).backgroundColor, inlineText: element.style.color, computedText: getComputedStyle(element).color });
        const templateElements = [document.querySelector('#tag_template .tag'), ...document.querySelectorAll('#bogus_folder_template .avatar')];
        const originalStyles = templateElements.map(element => element.getAttribute('style'));
        for (const element of templateElements) {
            element.style.backgroundColor = 'blue';
            element.style.color = 'green';
        }
        const values = [];
        for (const color of ['var(--proof-tag-color)', '', undefined]) {
            host.empty();
            const tag = { id: 'proof-tag', name: 'Proof tag', folder_type: 'OPEN', color, color2: color };
            appendTagToList(host, tag);
            const folder = getTagBlock(tag, []);
            host.append(folder);
            values.push({ tag: read(host.find('.tag')[0]), folder: read(folder.find('.avatar')[0]) });
        }
        templateElements.forEach((element, index) => originalStyles[index] === null ? element.removeAttribute('style') : element.setAttribute('style', originalStyles[index]));
        host.remove();
        return values;
    });
    for (const target of ['tag', 'folder']) {
        expect(result[0][target]).toEqual({ inline: 'var(--proof-tag-color)', computed: 'rgb(35, 80, 125)', inlineText: 'var(--proof-tag-color)', computedText: 'rgb(35, 80, 125)' });
        expect(result[1][target].inline).toBe('');
        expect(result[1][target].inlineText).toBe('');
        expect(result[2][target].inline).toBe('blue');
        expect(result[2][target].inlineText).toBe('green');
    }
});
