import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

test('the shipped Font Awesome stylesheet lists searchable icon aliases and renders glyphs', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { fetchFa } = await import('/scripts/utils.js');
        const icons = await fetchFa();
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-pencil';
        document.body.append(icon);
        const font = getComputedStyle(icon).fontFamily;
        const content = getComputedStyle(icon, '::before').content;
        const loadedFonts = await document.fonts.load(`900 16px ${font}`, '\uf303');
        icon.remove();
        return { names: icons.find(names => names.includes('fa-pencil')), content, loaded: loadedFonts.length > 0 };
    });
    expect(result.names).toEqual(expect.arrayContaining(['fa-pencil', 'fa-pencil-alt']));
    expect(result.content).toContain('\uf303');
    expect(result.loaded).toBe(true);
});

test('Font Awesome CSS is parsed without an HTML sink under Trusted Types enforcement', async ({ page }) => {
    await testSetup.awaitST({ page });
    const css = '.fa-alpha::before, .fa-beta::before { content: "\\f001"; }\n'
        + '.fa-ignored { color: red; }\n.fa-gamma::before { content: "\\f002"; }';
    await page.route('**/css/focused-fontawesome.css', route => route.fulfill({ contentType: 'text/css', body: css }));

    const result = await page.evaluate(async () => {
        const { fetchFaFile } = await import('/scripts/utils.js');
        const meta = document.createElement('meta');
        meta.httpEquiv = 'Content-Security-Policy';
        meta.content = 'require-trusted-types-for \'script\'';
        document.head.append(meta);
        let blocksHtmlSink = false;
        try {
            document.createElement('div').innerHTML = '<b>probe</b>';
        } catch (error) {
            blocksHtmlSink = error instanceof TypeError;
        }
        const stylesBefore = document.head.querySelectorAll('style').length;
        const icons = await fetchFaFile('focused-fontawesome.css');
        return { blocksHtmlSink, icons, stylesBefore, stylesAfter: document.head.querySelectorAll('style').length };
    });

    expect(result.blocksHtmlSink).toBe(true);
    expect(result.icons).toEqual([['fa-alpha', 'fa-beta'], ['fa-gamma']]);
    expect(result.stylesAfter).toBe(result.stylesBefore);
});
