import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

/**
 * Browser proof for the UI locale contract:
 *
 *  - a fresh browser sees Simplified Chinese by default;
 *  - `localStorage['language'] = 'en'` plus a reload renders English;
 *  - the standalone `/settings` surface and the workspace settings drawer agree;
 *  - switching back to `zh-cn` restores Chinese;
 *  - a delayed string still resolves under the active locale.
 */

const STORAGE_KEY = 'language';
const ZH = /[\u4e00-\u9fff]/;

test.setTimeout(180_000);

async function startWithLocale(page, locale) {
    await testSetup.awaitST({ page });
    await page.evaluate(
        ({ key, value }) => {
            if (value === null) {
                window.localStorage.removeItem(key);
            } else {
                window.localStorage.setItem(key, value);
            }
        },
        { key: STORAGE_KEY, value: locale },
    );
}

/** Samples every visible text node plus the useful attribute strings. */
async function collectVisibleText(page) {
    return page.evaluate(() => {
        const parts = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const value = node.nodeValue?.trim();
            if (!value) continue;
            const parent = node.parentElement;
            if (!parent) continue;
            const style = window.getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            parts.push(value);
        }
        for (const element of document.querySelectorAll('[aria-label], [placeholder], [title]')) {
            for (const attribute of ['aria-label', 'placeholder', 'title']) {
                const value = element.getAttribute(attribute)?.trim();
                if (value) parts.push(value);
            }
        }
        return parts;
    });
}

test.describe('UI locale switching', () => {
    test('mounted prompt editor re-translates role and trigger labels without losing edits', async ({ page }) => {
        await startWithLocale(page, 'zh-cn');
        await page.reload();
        await testSetup.awaitST({ page });

        // Open the prompt drawer only when the seeded profile left it closed.
        const drawer = page.locator('#left-nav-panel');
        if (!(await drawer.evaluate(element => element.classList.contains('openDrawer')))) {
            const drawerToggle = page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '提示词' });
            await drawerToggle.click({ timeout: 15_000 });
            await expect(drawerToggle).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
        }

        // A real (non-marker) prompt is required: seeded presets only ship placeholders.
        const identifier = await page.evaluate(() => globalThis.__emberDeskPromptPanelBridge.addPrompt());
        expect(identifier).toBeTruthy();
        const item = page.locator(`.prompt-panel-item[data-prompt-identifier="${identifier}"]`);
        await expect(item.locator('.prompt-panel-item-editor')).toBeVisible({ timeout: 15_000 });
        await expect(item.locator('.prompt-panel-marker-note')).toHaveCount(0);

        const snapshot = () => page.evaluate(promptIdentifier => {
            const row = document.querySelector(`.prompt-panel-item[data-prompt-identifier="${promptIdentifier}"]`);
            if (!row) return null;
            const selects = [...row.querySelectorAll('select')];
            const roleSelect = selects.find(select => [...select.options].some(option => option.value === 'assistant'));
            return {
                badge: row.querySelector('.prompt-panel-item-meta .prompt-panel-badge')?.textContent?.trim() ?? null,
                roleOptions: roleSelect ? [...roleSelect.options].map(option => option.textContent.trim()) : null,
                triggerLabels: [...row.querySelectorAll('.prompt-panel-trigger-row label span')].map(span => span.textContent.trim()),
                content: row.querySelector('textarea.prompt-panel-content')?.value ?? null,
            };
        }, identifier);

        // 1. Baseline: the default locale already localizes the manager markup.
        await expect.poll(async () => {
            const current = await snapshot();
            return current && { badge: current.badge, roleOptions: current.roleOptions, triggerLabels: current.triggerLabels.slice(0, 2) };
        }, { timeout: 15_000 }).toMatchObject({
            badge: '系统',
            roleOptions: ['系统', '用户', '助手'],
            triggerLabels: ['全部', '常规'],
        });

        // 2. Type into the inline editor so the mount holds unsaved-but-persisted input.
        const content = '本地化回归测试内容';
        await item.locator('textarea.prompt-panel-content').fill(content);
        await item.locator('.prompt-panel-field input.text_pole').first().fill('本地化回归测试');
        await expect.poll(async () => (await snapshot()).content).toBe(content);

        // 3. Pin the mounted nodes, then swap the dictionary and re-run the real locale init.
        await page.evaluate(promptIdentifier => {
            window.__localePromptNode = document.querySelector('#completion_prompt_manager');
            window.__localePromptRow = document.querySelector(`.prompt-panel-item[data-prompt-identifier="${promptIdentifier}"]`);
            window.__localeContentNode = window.__localePromptRow?.querySelector('textarea.prompt-panel-content');
        }, identifier);
        await page.route('**/locales/zh-cn.json', async route => {
            const response = await route.fetch();
            const data = await response.json();
            Object.assign(data, {
                'System': '系统位甲',
                'User': '用户位乙',
                'Assistant': '助手位丙',
                'All': '全量触发丁',
                'Regular': '常规触发戊',
            });
            await route.fulfill({ json: data });
        });
        await page.evaluate(async () => {
            const { initLocales } = await import('/scripts/i18n.js');
            await initLocales();
        });

        // 4. Static labels re-render, while the mounted containers and edits survive.
        await expect.poll(async () => {
            const current = await snapshot();
            return current && { badge: current.badge, roleOptions: current.roleOptions, triggerLabels: current.triggerLabels.slice(0, 2) };
        }, { timeout: 15_000 }).toMatchObject({
            badge: '系统位甲',
            roleOptions: ['系统位甲', '用户位乙', '助手位丙'],
            triggerLabels: ['全量触发丁', '常规触发戊'],
        });

        const identity = await page.evaluate(() => {
            const row = document.querySelector(`.prompt-panel-item[data-prompt-identifier="${window.__localePromptRow?.dataset.promptIdentifier}"]`);
            const textarea = row?.querySelector('textarea.prompt-panel-content');
            return {
                containerSame: document.querySelector('#completion_prompt_manager') === window.__localePromptNode,
                rowSame: row === window.__localePromptRow,
                textareaSame: textarea === window.__localeContentNode,
                content: textarea?.value ?? null,
            };
        });
        expect(identity).toEqual({ containerSame: true, rowSame: true, textareaSame: true, content });
        await expect(item).not.toContainText('全部');
        await expect(item.locator('select.text_pole').first()).toContainText('系统位甲');

        // Clean up the throwaway prompt so the fixture stays shaped like production data.
        await page.evaluate(promptIdentifier => globalThis.__emberDeskPromptPanelBridge.deletePrompt(promptIdentifier), identifier);
    });
    test('defaults to Simplified Chinese, honours English, and switches back', async ({ page }) => {
        // 1. Fresh browser: no stored choice → Simplified Chinese.
        await startWithLocale(page, null);
        await page.reload();
        await testSetup.awaitST({ page });

        await expect.poll(
            () => page.evaluate(() => document.documentElement.lang),
            { timeout: 30_000 },
        ).toBe('zh-cn');

        await expect.poll(
            () => page.evaluate(() => Boolean(document.querySelector('#left-nav-panel'))),
            { timeout: 30_000 },
        ).toBe(true);

        const defaultText = await collectVisibleText(page);
        expect(defaultText.length).toBeGreaterThan(20);
        expect(defaultText.filter(value => ZH.test(value)).length).toBeGreaterThan(5);

        // 2. Explicit English must survive a reload and be visible.
        await startWithLocale(page, 'en');
        await page.reload();
        await testSetup.awaitST({ page });

        await expect.poll(
            () => page.evaluate(() => document.documentElement.lang),
            { timeout: 30_000 },
        ).toBe('en');

        const englishText = await collectVisibleText(page);
        const englishChinese = englishText.filter(value => ZH.test(value));
        // User-authored content may be Chinese; structural UI copy must not be.
        const englishLeaks = englishChinese.filter(value => value.length > 2);
        expect(englishLeaks.length, `unexpected Chinese UI copy in English mode: ${JSON.stringify(englishLeaks.slice(0, 10))}`).toBe(0);

        // 3. Switching back to Chinese restores Chinese copy.
        await startWithLocale(page, 'zh-cn');
        await page.reload();
        await testSetup.awaitST({ page });

        await expect.poll(
            () => page.evaluate(() => document.documentElement.lang),
            { timeout: 30_000 },
        ).toBe('zh-cn');

        const restored = await collectVisibleText(page);
        expect(restored.filter(value => ZH.test(value)).length).toBeGreaterThan(5);

        // 4. A delayed string resolves under the active locale, not the boot locale.
        const delayed = await page.evaluate(async () => {
            const { translate } = await import('/scripts/i18n.js');
            await new Promise(resolve => setTimeout(resolve, 50));
            return translate('Save');
        });
        expect(ZH.test(delayed), `delayed translate() should be Chinese, got ${JSON.stringify(delayed)}`).toBe(true);
    });

    test('standalone settings and the workspace settings drawer agree on the locale', async ({ page }) => {
        await startWithLocale(page, 'en');
        await page.goto('/settings');
        await page.waitForLoadState('domcontentloaded');

        await expect.poll(
            () => page.evaluate(() => document.documentElement.lang),
            { timeout: 30_000 },
        ).toBe('en');

        const standalone = await collectVisibleText(page);
        const standaloneChinese = standalone.filter(value => ZH.test(value) && !value.includes('简体中文'));
        expect(standaloneChinese, `standalone /settings leaked Chinese in English mode: ${JSON.stringify(standaloneChinese.slice(0, 10))}`).toEqual([]);

        // The workspace drawer must show the same language as the standalone surface.
        await page.evaluate(() => window.localStorage.setItem('language', 'zh-cn'));
        await page.goto('/settings');
        await page.waitForLoadState('domcontentloaded');
        await expect.poll(
            () => page.evaluate(() => document.documentElement.lang),
            { timeout: 30_000 },
        ).toBe('zh-cn');

        await expect.poll(async () => (await collectVisibleText(page)).filter(value => ZH.test(value)).length,
            { timeout: 30_000 }).toBeGreaterThan(3);
    });
});
