import { test, expect } from '@playwright/test';
import { createServer } from '../node_modules/vite/dist/node/index.js';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
let server, cache, url;
test.beforeAll(async () => {
    cache = await mkdtemp(path.join(os.tmpdir(), 'regex-component-vite-'));
    server = await createServer({ configFile: false, root, publicDir: false, cacheDir: cache, resolve: { alias: { '@': path.join(root, 'app') } }, esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 0, strictPort: false } });
    await server.listen();
    url = `http://127.0.0.1:${server.httpServer.address().port}/tests/regex-rule-list-fixture.html`;
});
test.afterAll(async () => { await server?.close(); if (cache) await rm(cache, { recursive: true, force: true }); });
test.beforeEach(async ({ page }) => { await page.goto(url); });

test('scoped selection, pending rejection and reorder use bridge commands', async ({ page }) => {
    await expect(page.getByText('Global one')).toBeVisible();
    await page.locator('#regex_bulk_edit').check();
    await page.getByRole('checkbox', { name: 'Select Global one' }).check();
    await page.getByRole('checkbox', { name: 'Select Preset one' }).check();
    await page.getByRole('button', { name: 'Disable', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.fixture.actions.at(-1))).toEqual({ kind: 'enable', enabled: false, refs: [{ groupKey: 'global', id: 'same' }, { groupKey: 'preset:a', id: 'same' }] });
    await page.evaluate(() => { window.fixture.next = 'pending'; });
    await page.getByRole('button', { name: 'Disable Global one' }).click();
    await expect.poll(() => page.evaluate(() => window.fixture.actions.at(-1))).toEqual({ kind: 'enable', enabled: false, authorize: true, refs: [{ groupKey: 'global', id: 'same' }] });
    await expect(page.getByRole('button', { name: 'Edit Global one' })).toBeDisabled();
    await page.evaluate(() => window.fixture.resolve.reject(new Error('network')));
    await expect(page.getByText(/Not saved/)).toBeVisible();
    await page.evaluate(() => { window.fixture.next = 'saved'; });
    await page.getByRole('button', { name: 'Move Global two up' }).click();
    await expect.poll(() => page.evaluate(() => window.fixture.actions.at(-1))).toEqual({ kind: 'reorder', groupKey: 'global', ids: ['two', 'same'] });
});

test('a save-only success does not clear an unresolved authorization failure', async ({ page }) => {
    await page.evaluate(() => { window.fixture.next = 'reject'; window.fixture.errorProps = { stage: 'authorize', groupKey: 'global' }; });
    await page.getByRole('button', { name: 'Disable Global one' }).click();
    await expect(page.locator('.regex-list-status-failure')).toContainText('Global (global)');
    await expect(page.locator('.regex-list-status-failure')).toContainText('Authorization not saved');
    // A save-only success (reorder) resolves its own stage but must leave the
    // authorization failure visible — the rule was never authorized.
    await page.evaluate(() => { window.fixture.next = 'saved'; window.fixture.errorProps = undefined; });
    await page.getByRole('button', { name: 'Move Global two up' }).click();
    await expect(page.locator('.regex-list-status-saved')).toContainText('Global (global)');
    await expect(page.locator('.regex-list-status-failure')).toContainText('Authorization not saved');
    // An action that attempts authorization clears the failure once it succeeds.
    await page.getByRole('button', { name: 'Disable Global one' }).click();
    await expect(page.locator('.regex-list-status-failure')).toHaveCount(0);
    await expect(page.locator('.regex-list-status-saved')).toContainText('Global (global)');
});

test('row actions, menu focus, target availability and pointer reorder', async ({ page }) => {
    const row = page.locator('#saved_regex_scripts .regex-react-row').first();
    const more = page.getByRole('button', { name: 'More options for Global one' });
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await row.getByRole('button', { name: 'Move to preset scripts' }).click();
    await expect.poll(() => page.evaluate(() => window.fixture.actions.at(-1))).toEqual({ kind: 'move', refs: [{ groupKey: 'global', id: 'same' }], toType: 2 });
    await page.getByRole('button', { name: 'Edit Global one' }).click();
    await expect.poll(() => page.evaluate(() => window.fixture.actions.at(-1))).toEqual({ kind: 'edit', refs: [{ groupKey: 'global', id: 'same' }] });
    await more.click();
    await row.getByRole('button', { name: 'Export' }).click();
    await expect.poll(() => page.evaluate(() => window.fixture.actions.at(-1))).toEqual({ kind: 'export', refs: [{ groupKey: 'global', id: 'same' }] });
    await page.getByRole('button', { name: 'Delete Global one' }).click();
    await expect.poll(() => page.evaluate(() => window.fixture.actions.at(-1))).toEqual({ kind: 'delete', refs: [{ groupKey: 'global', id: 'same' }] });
    await page.evaluate(() => window.fixture.publish(window.fixture.groups.map(group => group.type === 1 ? { ...group, available: false } : group)));
    await more.click();
    await expect(row.getByRole('button', { name: 'Move to scoped scripts' })).toBeDisabled();
    await page.locator('#global_scripts_block strong').click();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await row.locator('.regex-react-drag').dragTo(page.locator('#saved_regex_scripts .regex-react-row').nth(1));
    await expect.poll(() => page.evaluate(() => window.fixture.actions.at(-1))).toEqual({ kind: 'reorder', groupKey: 'global', ids: ['two', 'same'] });
});

test('selection pruning, bulk actions and failures remain target-specific', async ({ page }) => {
    await page.locator('#regex_bulk_edit').check();
    await page.getByRole('button', { name: 'Toggle Select All' }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.fixture.actions.at(-1))).toEqual({ kind: 'export', refs: [{ groupKey: 'global', id: 'same' }, { groupKey: 'global', id: 'two' }, { groupKey: 'preset:a', id: 'same' }] });
    await page.evaluate(() => window.fixture.publish(window.fixture.groups.map(group => group.type === 2 ? { ...group, key: 'preset:b' } : group)));
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.fixture.actions.at(-1))).toEqual({ kind: 'delete', refs: [{ groupKey: 'global', id: 'same' }, { groupKey: 'global', id: 'two' }] });
    await page.getByRole('button', { name: 'Move to scoped scripts', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.fixture.actions.at(-1))).toEqual({ kind: 'move', refs: [{ groupKey: 'global', id: 'same' }, { groupKey: 'global', id: 'two' }], toType: 1 });
    await page.evaluate(() => { window.fixture.next = 'reject'; });
    await page.getByRole('button', { name: 'Disable Global one' }).click();
    await expect(page.locator('.regex-list-status')).toContainText('Not saved: Global (global)');
    await page.evaluate(() => { window.fixture.next = 'saved'; });
    await page.getByRole('button', { name: 'Disable Preset one' }).click();
    await expect(page.locator('.regex-list-status')).toContainText('Not saved: Global (global)');
    await expect(page.locator('.regex-list-status')).toContainText('Saved: Preset (preset:b)');
    await page.evaluate(() => { window.fixture.next = 'unchanged'; });
    await page.getByRole('button', { name: 'Disable Global one' }).click();
    await expect(page.locator('.regex-list-status')).toContainText('Not saved: Global (global)');
    await expect(page.locator('.regex-list-status')).not.toContainText('Saved:');
    await page.evaluate(() => { window.fixture.next = 'saved'; });
    await page.getByRole('button', { name: 'Disable Global one' }).click();
    await expect(page.locator('.regex-list-status')).not.toContainText('Not saved');
    await expect(page.locator('.regex-list-status')).toContainText('Saved: Global (global)');
});
