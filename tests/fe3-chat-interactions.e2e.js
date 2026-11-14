import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test.setTimeout(60_000);

async function selectCharacter(page, name) {
    await page.evaluate(async name => {
        const context = window.SillyTavern.getContext();
        context.chatCompletionSettings.chat_memory_enabled = false;
        const index = context.characters.findIndex(character => character.name === name);
        if (index < 0) throw new Error(`Missing seeded character ${name}`);
        await context.selectCharacterById(index);
    }, name);
}

test('native legacy action transitions cancel stale work and leave React rows alone', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.evaluate(async () => {
        const { createChatMessageActionsController } = await import('/scripts/chat-message-actions-controller.js');
        const frame = document.createElement('iframe');
        frame.id = 'fe3-action-fixture';
        frame.style.cssText = 'position:fixed;inset:20px;width:400px;height:200px;z-index:10000;background:white';
        document.body.append(frame);
        const root = frame.contentDocument;
        root.body.innerHTML = '<div class="mes_buttons"><button class="extraMesButtonsHint">More</button><div class="extraMesButtons" style="display:none">Legacy actions</div></div><div data-main-chat-message-row-owner="react"><div class="mes_buttons"><button class="extraMesButtonsHint">React more</button><div class="extraMesButtons" style="display:none">React actions</div></div></div>';
        window.fe3Actions = createChatMessageActionsController(root, { animationDuration: 80 });
        window.fe3Actions.init();
    });
    const frame = page.frameLocator('#fe3-action-fixture');
    const legacy = frame.locator('.mes_buttons').first();
    const buttons = legacy.locator('.extraMesButtons');
    await legacy.locator('button').click();
    await expect(buttons).toBeVisible();
    await expect(buttons).toHaveCSS('opacity', '1');
    await page.evaluate(() => {
        const root = document.querySelector('#fe3-action-fixture').contentDocument;
        window.fe3Actions.closeExtraActions();
        window.fe3Actions.openExtraActions(root.querySelector('.extraMesButtonsHint'));
    });
    await expect(buttons).toHaveCSS('opacity', '1');
    await expect(buttons).toHaveClass(/visible/);
    await page.evaluate(() => window.fe3Actions.closeExtraActions());
    await expect(buttons).toBeHidden();
    await expect(legacy.locator('button')).toBeVisible();
    await frame.getByRole('button', { name: 'React more', exact: true }).click();
    await expect(frame.locator('[data-main-chat-message-row-owner="react"] .extraMesButtons')).toBeHidden();
    await page.evaluate(() => {
        const root = document.querySelector('#fe3-action-fixture').contentDocument;
        window.fe3Actions.openExtraActions(root.querySelector('.extraMesButtonsHint'));
        window.fe3Actions.cleanup();
    });
    // Wait for the real native animation timeline, not a fake synchronous adapter.
    await expect.poll(() => page.evaluate(() => document.querySelector('#fe3-action-fixture').contentDocument.getAnimations().length)).toBe(0);
    await expect(buttons).toBeHidden();
    await page.locator('#fe3-action-fixture').evaluate(frame => frame.remove());
});

test('dialogue close then reopen keeps the latest mask, including reduced motion', async ({ page }) => {
    await testSetup.awaitST({ page });
    const shadow = page.locator('#shadow_popup');
    await page.evaluate(async () => {
        const script = await import('/script.js');
        window.fe3Dialogue = script.callPopup('First FE3 confirmation', 'confirm');
    });
    await expect(shadow).toBeVisible();
    await page.evaluate(async () => {
        document.querySelector('#dialogue_popup_cancel').click();
        await window.fe3Dialogue;
        window.fe3Dialogue = (await import('/script.js')).callPopup('Latest FE3 confirmation', 'confirm');
    });
    await expect(page.locator('#dialogue_popup_text')).toHaveText('Latest FE3 confirmation');
    await expect(shadow).toHaveCSS('opacity', '1');
    await expect(shadow).toBeVisible();
    await page.locator('#dialogue_popup_cancel').click();
    await expect(shadow).toBeHidden();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(async () => { window.fe3Dialogue = (await import('/script.js')).callPopup('Reduced FE3 confirmation', 'confirm'); });
    await expect(shadow).toHaveCSS('opacity', '1');
    await page.locator('#dialogue_popup_ok').click();
    await expect(shadow).toBeHidden();
    expect(await page.evaluate(() => window.fe3Dialogue)).toBeTruthy();
});

test('CtrlShift scrolling uses native chat geometry without duplicating edit shortcuts', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await selectCharacter(page, 'Dev Character 038');
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        context.chat.splice(0, context.chat.length, ...Array.from({ length: 24 }, (_, index) => ({
            name: 'Assistant', is_user: false, is_system: false, mes: `FE3 message ${index}\n\n${'A long visible chat line. '.repeat(30)}`, send_date: Date.now(),
        })));
        await context.printMessages();
    });
    const rows = page.locator('#chat > .mes');
    await expect(rows).toHaveCount(24);
    await page.evaluate(() => {
        document.querySelectorAll('.lastInContext').forEach(element => element.classList.remove('lastInContext'));
        document.querySelectorAll('#chat > .mes')[4].classList.add('lastInContext');
    });
    await page.keyboard.press('Control+Shift+ArrowDown');
    await expect.poll(() => page.locator('#chat').evaluate(chat => Math.abs(chat.scrollHeight - chat.clientHeight - chat.scrollTop))).toBeLessThan(3);
    await page.keyboard.press('Control+Shift+ArrowUp');
    await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector('.lastInContext').getBoundingClientRect().top - document.querySelector('#chat').getBoundingClientRect().top))).toBeLessThan(3);
    const composer = page.locator('#send_textarea');
    await composer.fill('');
    await composer.press('ArrowUp');
    await expect(page.locator('#curEditTextarea')).toHaveCount(1);
    await page.locator('#curEditTextarea').press('Escape');
    await expect(page.locator('#curEditTextarea')).toHaveCount(0);
    expect(await page.evaluate(() => window.SillyTavern.getContext().chat.length)).toBe(24);
});

test('reasoning reads the current chat and preserves React message identity and formatting', async ({ page }) => {
    await testSetup.awaitST({ page });
    await selectCharacter(page, 'Dev Character 039');
    await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        context.chat.splice(0, context.chat.length, { name: 'Assistant', is_user: false, is_system: false, mes: '**Before reasoning**', send_date: Date.now() });
        await context.printMessages();
    });
    const row = page.locator('#chat > .mes[mesid="0"]');
    await expect(row.locator('.mes_text strong')).toHaveText('Before reasoning');
    await row.evaluate(element => { element.dataset.fe3Identity = 'same-dom-node'; });
    const parsed = await page.evaluate(async () => {
        const { REASONING_PREFIX, REASONING_SUFFIX } = await import('/scripts/constants.js');
        const { eventSource, event_types } = await import('/scripts/events.js');
        const context = window.SillyTavern.getContext();
        const message = context.chat[0];
        message.mes = `${REASONING_PREFIX}FE3 thought${REASONING_SUFFIX}\n**After reasoning**`;
        await eventSource.emit(event_types.MESSAGE_UPDATED, 0);
        return { text: message.mes, reasoning: message.extra.reasoning };
    });
    expect(parsed).toEqual({ text: '**After reasoning**', reasoning: 'FE3 thought' });
    await expect(row).toHaveAttribute('data-main-chat-message-row-owner', 'react');
    await expect(row).toHaveAttribute('data-fe3-identity', 'same-dom-node');
    await expect(row.locator('.mes_text strong')).toHaveText('After reasoning');
    await row.locator('.mes_reasoning_summary').click();
    await expect(row.locator('.mes_reasoning')).toContainText('FE3 thought');
});

test('legacy reasoning mounts safe fragments without losing formatting or scoped styles', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { ReasoningHandler, ReasoningState } = await import('/scripts/reasoning.js');
        const chat = document.getElementById('chat');
        const owner = chat.dataset.reactMainChatOwner;
        const row = document.createElement('div');
        row.setAttribute('mesid', '0');
        row.innerHTML = '<details class="mes_reasoning_details"><summary class="mes_reasoning_header_title"></summary><div class="mes_reasoning"></div></details><button class="mes_edit_add_reasoning"></button>';
        const content = row.querySelector('.mes_reasoning');
        // Exercise the legacy consumer with real DOMPurify, not a formatter mock.
        Object.defineProperty(content, 'innerHTML', {
            set() { throw new Error('Reasoning must mount a sanitized DOM fragment'); },
        });
        try {
            chat.dataset.reactMainChatOwner = '';
            const handler = new ReasoningHandler();
            handler.messageDom = row;
            handler.state = ReasoningState.Done;
            handler.reasoning = '**Legacy thought**\n\n`safe code`\n\n<style>.reasoning-accent { color: red; }</style><span class="reasoning-accent">Styled thought</span><a target="_blank" href="https://example.com/">Reference</a><img src="invalid" onerror="window.__fe3ReasoningXss = true"><script>window.__fe3ReasoningXss = true</script><a href="javascript:alert(1)">Unsafe link</a>';
            handler.updateDom(0);
            content.querySelectorAll('img').forEach(image => image.dispatchEvent(new Event('error')));
            const link = content.querySelector('a[target="_blank"]');
            return {
                bold: content.querySelector('strong')?.textContent,
                code: content.querySelector('code')?.textContent,
                scopedStyle: content.querySelector('style')?.textContent,
                scopedClass: content.querySelector('span')?.className,
                scope: content.querySelector('[data-message-style-scope]')?.getAttribute('data-message-style-scope'),
                linkTarget: link?.target,
                linkSafe: link?.relList.contains('noopener'),
                unsafe: Boolean(content.querySelector('script, [onerror], a[href^="javascript:"]')),
                executed: window.__fe3ReasoningXss === true,
            };
        } finally {
            if (owner === undefined) delete chat.dataset.reactMainChatOwner;
            else chat.dataset.reactMainChatOwner = owner;
            delete window.__fe3ReasoningXss;
        }
    });
    expect(result).toMatchObject({ bold: 'Legacy thought', code: 'safe code', linkTarget: '_blank', linkSafe: true, unsafe: false, executed: false });
    expect(result.scope).toBeTruthy();
    expect(result.scopedStyle).toContain('data-message-style-scope');
    expect(result.scopedClass).toBeTruthy();
    expect(result.scopedStyle).toContain(`.${result.scopedClass}`);
});
