import { expect, test } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('bootstrap installs the synchronous domain before settings and preset pipeline repair', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Observe the real module from its first evaluation, not a post-boot mock.
    await page.route('**/scripts/tool-bindings.js', async route => {
        const response = await route.fetch();
        let source = await response.text();
        source = source.replace('export function installToolBindingsServiceFactory(factory) {',
            "export function installToolBindingsServiceFactory(factory) { (window.__toolBootTrace ??= []).push('install');");
        source = source.replace('function requireService() {',
            "function requireService() { (window.__toolBootTrace ??= []).push(service ? 'use:installed' : 'use:missing');");
        await route.fulfill({ response, body: source });
    });
    await testSetup.awaitST({ page });
    await expect(page.locator('html')).toHaveAttribute('data-reply-pipeline-init', 'true', { timeout: 15_000 });
    const result = await page.evaluate(async () => {
        const context = window.SillyTavern.getContext();
        const { eventSource, event_types } = await import('/scripts/events.js');
        const { getToolBindings, syncPipelineToolBindings } = await import('/scripts/tool-bindings.js');
        context.chatCompletionSettings.reply_pipeline = { enabled: true, steps: [{ tool: 'boot_order_probe' }], final: 'boot_order_probe' };
        context.featureSettings.tool_bindings = [];
        await eventSource.emit(event_types.SETTINGS_LOADED);
        const settingsNames = getToolBindings().map(binding => binding.name);
        context.featureSettings.tool_bindings = [];
        await eventSource.emit(event_types.OAI_PRESET_CHANGED_AFTER);
        const presetNames = getToolBindings().map(binding => binding.name);
        const returned = syncPipelineToolBindings(['boot_order_probe']);
        return { trace: window.__toolBootTrace, settingsNames, presetNames, synchronous: returned === undefined,
            registered: context.ToolManager.tools.some(tool => tool.toFunctionOpenAI().function.name === 'boot_order_probe') };
    });
    expect(errors.filter(error => error.includes('Tool bindings service factory'))).toEqual([]);
    expect(result.trace[0]).toBe('install');
    expect(result.trace).not.toContain('use:missing');
    expect(result.trace).toContain('use:installed');
    expect(result.settingsNames).toContain('boot_order_probe');
    expect(result.presetNames).toContain('boot_order_probe');
    expect(result.registered).toBe(true);
    expect(result.synchronous).toBe(true);
});
