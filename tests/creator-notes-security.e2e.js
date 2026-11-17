import { test, expect } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('restricted creator notes retain custom properties and @supports locally', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { formatCreatorNotes } = await import('/scripts/chats.js');
        document.getElementById('creator_notes_spoiler')?.removeAttribute('id');
        const outer = document.createElement('div'); outer.className = 'custom-note';
        const host = document.createElement('div'); host.id = 'creator_notes_spoiler';
        document.body.append(host, outer);
        host.innerHTML = formatCreatorNotes('<style>.note { --note-color: rgb(12, 34, 56); color: var(--note-color) } @supports (display: grid) { .note { background-color: rgb(23, 45, 67) } }</style><div class="note" style="--inline-color: rgb(34, 56, 78); border-color: var(--inline-color)">note</div>', '');
        const local = getComputedStyle(host.querySelector('.custom-note'));
        const outside = getComputedStyle(outer);
        return { color: local.color, background: local.backgroundColor, border: local.borderTopColor, outside: outside.backgroundColor };
    });
    expect(result).toEqual({ color: 'rgb(12, 34, 56)', background: 'rgb(23, 45, 67)', border: 'rgb(34, 56, 78)', outside: 'rgba(0, 0, 0, 0)' });
});

test('CSS variables cannot reference page animations in restricted notes', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { formatCreatorNotes } = await import('/scripts/chats.js');
        document.getElementById('creator_notes_spoiler')?.removeAttribute('id');
        const sheet = document.createElement('style');
        sheet.textContent = '@keyframes pageSecret { from { opacity: .13 } to { opacity: .13 } }';
        const host = document.createElement('div'); host.id = 'creator_notes_spoiler';
        document.body.append(sheet, host);
        host.innerHTML = formatCreatorNotes('<style>.note { --page-animation: pageSecret; animation: var(--page-animation) 10s paused }</style><div class="note">note</div><div class="inline" style="--page-animation: pageSecret; animation-name: var(--page-animation); animation-duration: 10s; animation-play-state: paused">inline</div>', '');
        return [...host.querySelectorAll('.custom-note, .custom-inline')].map(element => getComputedStyle(element).opacity);
    });
    expect(result).toEqual(['1', '1']);
});

test('escaped animation properties cannot reference page keyframes in restricted notes', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { formatCreatorNotes } = await import('/scripts/chats.js');
        document.getElementById('creator_notes_spoiler')?.removeAttribute('id');
        const sheet = document.createElement('style');
        sheet.textContent = '@keyframes pageSecret { from { opacity: .13 } to { opacity: .13 } }';
        const controls = [document.createElement('div'), document.createElement('div')];
        controls[0].setAttribute('style', '--page-animation: pageSecret; \\61nimation: var(--page-animation) 10s paused');
        controls[1].setAttribute('style', '--page-animation: pageSecret; an\\69mation-name: var(--page-animation); animation-duration: 10s; animation-play-state: paused');
        const host = document.createElement('div'); host.id = 'creator_notes_spoiler';
        document.body.append(sheet, ...controls, host);
        host.innerHTML = formatCreatorNotes('<style>.short { --page-animation: pageSecret; \\61nimation: var(--page-animation) 10s paused } .long { --page-animation: pageSecret; an\\69mation-name: var(--page-animation); animation-duration: 10s; animation-play-state: paused }</style><div class="short">short</div><div class="long">long</div><div class="inline-short" style="--page-animation: pageSecret; \\61nimation: var(--page-animation) 10s paused">inline short</div><div class="inline-long" style="--page-animation: pageSecret; an\\69mation-name: var(--page-animation); animation-duration: 10s; animation-play-state: paused">inline long</div>', '');
        return {
            controls: controls.map(element => getComputedStyle(element).opacity),
            notes: [...host.querySelectorAll('.custom-short, .custom-long, .custom-inline-short, .custom-inline-long')].map(element => getComputedStyle(element).opacity),
        };
    });
    expect(result).toEqual({ controls: ['0.13', '0.13'], notes: ['1', '1', '1', '1'] });
});

test('CSS comments cannot disguise a selector escaping the notes host', async ({ page }) => {
    await testSetup.awaitST({ page });
    const color = await page.evaluate(async () => {
        const { formatCreatorNotes } = await import('/scripts/chats.js');
        document.getElementById('creator_notes_spoiler')?.removeAttribute('id');
        const host = document.createElement('div'); host.id = 'creator_notes_spoiler';
        const outer = document.createElement('div'); outer.className = 'custom-probe';
        document.body.append(host, outer);
        host.innerHTML = formatCreatorNotes('<style>/**/ + .probe, ~ .probe { color: rgb(1, 2, 3) } :is(.inner, #creator_notes_spoiler) + .probe { color: rgb(1, 2, 3) } @supports (display: grid) { + .probe { color: rgb(1, 2, 3) } }</style><div class="inner"></div>', '');
        return getComputedStyle(outer).color;
    });
    expect(color).not.toBe('rgb(1, 2, 3)');
});

test('keyframes inside @supports remain scoped to restricted creator notes', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { formatCreatorNotes } = await import('/scripts/chats.js');
        document.getElementById('creator_notes_spoiler')?.removeAttribute('id');
        const sheet = document.createElement('style');
        sheet.textContent = '@keyframes supportProbe { from { opacity: .2 } to { opacity: .2 } }';
        const outer = document.createElement('div'); outer.style.cssText = 'animation: supportProbe 10s paused';
        const host = document.createElement('div'); host.id = 'creator_notes_spoiler';
        document.body.append(sheet, host, outer);
        host.innerHTML = formatCreatorNotes('<style>@supports (display: grid) { @keyframes supportProbe { from { opacity: .8 } to { opacity: .8 } } .note { animation: supportProbe 10s paused } }</style><div class="note">note</div>', '');
        return [getComputedStyle(outer).opacity, getComputedStyle(host.querySelector('.custom-note')).opacity];
    });
    expect(result).toEqual(['0.2', '0.8']);
});

test('creator notes isolate styles and keyframes while retaining local animation', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { formatCreatorNotes } = await import('/scripts/chats.js');
        const existing = document.getElementById('creator_notes_spoiler');
        existing?.removeAttribute('id');
        const outerStyle = document.createElement('style');
        outerStyle.textContent = '@keyframes creatorProbe { from { opacity: .2 } to { opacity: .2 } } .custom-creator-outer { animation: creatorProbe 10s linear paused; color: rgb(10, 20, 30) }';
        const outer = document.createElement('div'); outer.className = 'custom-creator-outer';
        const host = document.createElement('div'); host.id = 'creator_notes_spoiler';
        document.body.append(outerStyle, host, outer);
        const input = '<style>@keyframes creatorProbe { from { opacity: .9 } to { opacity: .9 } } .note { color: rgb(1, 2, 3); animation: creatorProbe 10s linear paused } + .creator-outer { color: red }</style><div class="note">note</div><div class="inline" style="animation:creatorProbe 10s linear paused">inline</div><img src=x onerror="window.__creatorXss=1">';
        host.innerHTML = formatCreatorNotes(input, '');
        await new Promise(resolve => setTimeout(resolve, 100));
        const local = host.querySelector('.custom-note');
        return { outerOpacity: getComputedStyle(outer).opacity, outerColor: getComputedStyle(outer).color, localColor: local && getComputedStyle(local).color, localOpacity: local && getComputedStyle(local).opacity, inlineOpacity: getComputedStyle(host.querySelector('.custom-inline')).opacity, xss: window.__creatorXss || 0 };
    });
    expect(result).toEqual({ outerOpacity: '0.2', outerColor: 'rgb(10, 20, 30)', localColor: 'rgb(1, 2, 3)', localOpacity: '0.9', inlineOpacity: '0.9', xss: 0 });
});

test('malformed encoded styles and closing tags cannot inject HTML after sanitization', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { formatCreatorNotes } = await import('/scripts/chats.js');
        const { accountStorage } = await import('/scripts/util/AccountStorage.js');
        const key = 'AllowGlobalStyles-creator-security-malformed';
        const payloads = [
            '<style>.note{content:"</style><img src=x onerror=window.__creatorXss=1>"}</style>',
            `<custom-style>${encodeURIComponent('a { color: red; <img src=x onerror=window.__creatorXss=1>')}</custom-style>`,
            '<style/foo=bar"baz>*{color:red}</style><img src=x onerror=window.__creatorXss=1>',
        ];
        const host = document.createElement('div'); document.body.append(host);
        try {
            for (const allowed of [false, true]) {
                accountStorage.setItem(key, String(allowed));
                for (const payload of payloads) {
                    host.innerHTML = formatCreatorNotes(payload, 'creator-security-malformed');
                    if (host.querySelector('[onerror], script, iframe')) return false;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            return !window.__creatorXss;
        } finally { accountStorage.removeItem(key); }
    });
    expect(result).toBe(true);
});

test('explicit global style permission remains effective for creator notes', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { formatCreatorNotes } = await import('/scripts/chats.js');
        const { accountStorage } = await import('/scripts/util/AccountStorage.js');
        const key = 'AllowGlobalStyles-creator-security-test';
        const outer = document.createElement('div'); outer.className = 'custom-global-probe';
        const host = document.createElement('div');
        document.body.append(outer, host);
        try {
            accountStorage.setItem(key, 'true');
            host.innerHTML = formatCreatorNotes('<style>@keyframes creatorGlobal { from { opacity: .4 } to { opacity: .4 } } .global-probe { color: rgb(7, 8, 9); animation: creatorGlobal 10s linear paused }</style>', 'creator-security-test');
            return { color: getComputedStyle(outer).color, opacity: getComputedStyle(outer).opacity };
        } finally { accountStorage.removeItem(key); }
    });
    expect(result).toEqual({ color: 'rgb(7, 8, 9)', opacity: '0.4' });
});
