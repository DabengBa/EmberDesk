import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('create notes sink removes post-sanitization HTML while preserving isolated styles', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { DOMPurify } = await import('/lib.js');
        const shell = (await import('/scripts/character-lifecycle-shell-context.js')).requireCharacterLifecycleShellContext();
        const original = DOMPurify.sanitize;
        const sheet = document.createElement('style');
        sheet.textContent = '@keyframes sinkProbe { from { opacity: .2 } to { opacity: .2 } }';
        const outer = document.createElement('div'); outer.className = 'custom-sink-outer';
        outer.style.cssText = 'animation: sinkProbe 10s paused';
        document.body.append(sheet, outer);
        let injected = false;
        DOMPurify.sanitize = function (html, config) {
            const clean = original.call(this, html, config);
            if (!injected && config?.MESSAGE_SANITIZE) {
                injected = true;
                return `${clean}<img id="sink-payload" src="x" onerror="window.__sinkXss=1">`;
            }
            return clean;
        };
        try {
            shell.state.create_save.creator_notes = '<style>@keyframes sinkProbe { from { opacity: .8 } to { opacity: .8 } } .note { --tone: rgb(12, 34, 56); color: var(--tone); animation: sinkProbe 10s paused } @supports (display: grid) { .note { background: rgb(23, 45, 67) } }</style><div class="note"><strong>safe markup</strong></div><div class="inline" style="animation: sinkProbe 10s paused">inline</div>';
            shell.select_rm_create();
            const host = document.getElementById('creator_notes_spoiler');
            const local = host.querySelector('.custom-note');
            return {
                injected,
                unsafe: !!host.querySelector('[onerror], script, iframe'),
                markup: local?.querySelector('strong')?.textContent,
                color: local && getComputedStyle(local).color,
                background: local && getComputedStyle(local).backgroundColor,
                localOpacity: local && getComputedStyle(local).opacity,
                inlineOpacity: getComputedStyle(host.querySelector('.custom-inline')).opacity,
                outerOpacity: getComputedStyle(outer).opacity,
            };
        } finally {
            DOMPurify.sanitize = original;
            sheet.remove(); outer.remove();
        }
    });
    expect(result).toEqual({
        injected: true, unsafe: false, markup: 'safe markup', color: 'rgb(12, 34, 56)', background: 'rgb(23, 45, 67)', localOpacity: '0.8', inlineOpacity: '0.8', outerOpacity: '0.2',
    });
});

async function openContaminatedStylesDialog(page, kind) {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { getContext } = await import('/scripts/st-context.js');
        const context = getContext();
        await context.selectCharacterById(context.characters.findIndex(character => character.name === 'Dev Character 001'));
    });
    await expect(page.locator('#chat .mes').first()).toBeVisible();
    await page.evaluate(async kind => {
        const { getContext } = await import('/scripts/st-context.js');
        const selected = getContext();
        const character = selected.characters[selected.characterId];
        character.data.creator_notes = '<style>.sink-fixture { color: inherit; }</style>';
        const { accountStorage } = await import('/scripts/util/AccountStorage.js');
        accountStorage.removeItem(`AllowGlobalStyles-${character.avatar}`);
        const { DOMPurify } = await import('/lib.js');
        const original = DOMPurify.sanitize;
        let injected = false;
        DOMPurify.sanitize = function (html, config) {
            const clean = original.call(this, html, config);
            const marker = kind === 'preference' ? 'global_styles_forbidden' : 'creator_styles_preview';
            if (!injected && typeof html === 'string' && html.includes(marker)) {
                injected = true;
                window.__sinkTemplateInjected = true;
                return clean.replace('>', '><img src="x" onerror="window.__sinkXss=1">');
            }
            return clean;
        };
        if (kind === 'preference') {
            document.getElementById('creators_note_styles_button').click();
        } else {
            const { eventSource, event_types } = await import('/scripts/events.js');
            setTimeout(() => eventSource.emit(event_types.CHAT_CHANGED), 0);
        }
    }, kind);
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => window.__sinkTemplateInjected)).toBe(true);
    await expect(dialog.locator('[onerror], script, iframe')).toHaveCount(0);
    return dialog;
}

test('preference dialog sanitizes its localized template at the sink', async ({ page }) => {
    const dialog = await openContaminatedStylesDialog(page, 'preference');
    await expect(dialog).toContainText('更改会立即生效。');
    await expect(dialog.locator('#global_styles_forbidden')).toBeChecked();
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
    await expect(dialog).toHaveCount(0);
});

test('initial styles dialog sanitizes its localized template at the sink', async ({ page }) => {
    const dialog = await openContaminatedStylesDialog(page, 'initial');
    await expect(dialog.getByRole('textbox', { name: 'CSS 预览', exact: true })).toHaveValue('.sink-fixture { color: inherit; }');
    await dialog.getByRole('button', { name: '应用到整个页面', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(async () => {
        const { getContext } = await import('/scripts/st-context.js');
        const context = getContext();
        const { accountStorage } = await import('/scripts/util/AccountStorage.js');
        return accountStorage.getItem(`AllowGlobalStyles-${context.characters[context.characterId].avatar}`);
    })).toBe('true');
});
