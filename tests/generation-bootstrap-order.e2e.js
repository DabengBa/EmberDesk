import { test, expect } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

const workspacePanelEntry = '**/react/login/assets/workspace-panels-entry-*.js';

test('synchronous stop is available while SPA panel preparation is waiting for its entry', async ({ page }) => {
    await testSetup.awaitST({ page });

    let releaseBundle;
    const bundleReleased = new Promise(resolve => { releaseBundle = resolve; });
    let bundleRequested;
    const bundleStarted = new Promise(resolve => { bundleRequested = resolve; });
    await page.route(workspacePanelEntry, async route => {
        bundleRequested();
        await bundleReleased;
        await route.continue();
    }, { times: 1 });

    try {
        await page.reload({ waitUntil: 'commit' });
        await bundleStarted;
        await expect(page.locator('#workspace-startup').getByRole('status')).toBeVisible();
        const result = await page.evaluate(async () => {
            // Exercise the native runtime independently, keeping its normal module-graph entry order.
            await import('/scripts/i18n.js');
            const script = await import('/script.js');
            const state = await import('/scripts/generation-shared-state.js');
            const context = await import('/scripts/generation-shell-context.js');
            const extension = await import('/scripts/st-context.js');
            const commands = await import('/scripts/chat-generation-command-service.js');
            const lifecycle = await import('/scripts/chat-generation-lifecycle.js');
            const recovery = await import('/scripts/chat-generation-auto-recovery.js');
            const typedPolicies = commands.createGenerationCommandPlan === state.createGenerationCommandPlan
                && lifecycle.getGenerationFailureDecision === state.getGenerationFailureDecision
                && recovery.isRecoverableGenerationFailure === state.isRecoverableGenerationFailure
                && commands.createGenerationCommandPlan({ kind: 'submitComposer', mainApi: 'openai' }, { fallbackReady: true }).attempts.length === 3;
            const marker = { isStopped: false };
            context.getGenerationShellContext().state.streamingProcessor = marker;
            const shared = state.streamingProcessor === marker && script.streamingProcessor === marker
                && extension.getContext().streamingProcessor === marker;
            context.getGenerationShellContext().state.streamingProcessor = null;
            const controller = new AbortController();
            script.setExternalAbortController(controller);
            const stopped = script.stopGeneration();
            return { stopped, aborted: controller.signal.aborted, shared, typedPolicies };
        });
        expect(result).toEqual({ stopped: true, aborted: true, shared: true, typedPolicies: true });
    } finally {
        releaseBundle();

    }

    await page.reload();
    await testSetup.awaitST({ page });
    const singleton = await page.evaluate(async () => {
        const context = await import('/scripts/generation-shell-context.js');
        await context.getGenerationShellContext().ensureGenerationRuntime();
        const first = context.getGenerationLifecycleService();
        await context.getGenerationShellContext().ensureGenerationRuntime();
        return first === context.getGenerationLifecycleService();
    });
    expect(singleton).toBe(true);
});

test('generation runtime remains usable independently when SPA panel preparation fails', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.route(workspacePanelEntry, route => route.abort());
    await page.reload({ waitUntil: 'commit' });
    await expect(page.locator('#workspace-startup').getByRole('alert')).toBeVisible();
    const result = await page.evaluate(async () => {
        await import('/scripts/i18n.js');
        const script = await import('/script.js');
        const context = await import('/scripts/generation-shell-context.js');
        const state = await import('/scripts/generation-shared-state.js');
        await context.getGenerationShellContext().ensureGenerationRuntime();
        const service = context.getGenerationLifecycleService();
        const controller = new AbortController();
        script.setExternalAbortController(controller);
        const signalMatches = state.abortController === controller;
        const completed = await service.run({ foreground: true, execute: async lease => lease.owns() });
        const stopped = script.stopGeneration();
        return { signalMatches, completed, stopped, aborted: controller.signal.aborted };
    });
    expect(result).toEqual({ signalMatches: true, completed: true, stopped: true, aborted: true });
});

test('request-scoped prompt injection resolves outlet macros without changing the shared map', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const script = await import('/script.js');
        const { inject_ids } = await import('/scripts/constants.js');
        const key = inject_ids.CUSTOM_WI_OUTLET('attempt43');
        const previous = script.extension_prompts[key];
        script.extension_prompts[key] = { value: 'global outlet' };
        const local = {
            [key]: { value: 'preview outlet' },
            preview: { value: '{{outlet::attempt43}}', position: script.extension_prompt_types.IN_CHAT, depth: 0, role: script.extension_prompt_roles.SYSTEM },
        };
        try {
            const options = { promptMap: local };
            return {
                scopedMacro: script.substituteParams('{{outlet::attempt43}}', options),
                globalMacro: script.substituteParams('{{outlet::attempt43}}'),
                injection: await script.getExtensionPrompt(script.extension_prompt_types.IN_CHAT, 0, '\n', script.extension_prompt_roles.SYSTEM, false, local),
                globalValue: script.extension_prompts[key].value,
            };
        } finally {
            if (previous === undefined) delete script.extension_prompts[key];
            else script.extension_prompts[key] = previous;
        }
    });
    expect(result).toEqual({ scopedMacro: 'preview outlet', globalMacro: 'global outlet', injection: 'preview outlet', globalValue: 'global outlet' });
});
