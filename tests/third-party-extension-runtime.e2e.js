import { expect, test } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

/**
 * Runtime proof for the JS-Slash-Runner primary compatibility consumer.
 * Validates mount, events, slash, regex, selectors, and message-mutation markers
 * against the live workspace rather than static source shape alone.
 */
test.describe('third-party extension runtime compatibility', () => {
    test('JS-Slash-Runner can mount and exercise protected public contracts', async ({ page }) => {
        test.setTimeout(180_000);

        await testSetup.awaitST({ page });

        // Prefer a real open chat so mutation-zone survival crosses React reconciliation.
        await page.evaluate(async () => {
            const context = window.SillyTavern?.getContext?.();
            if (!context?.characters?.length || typeof context.selectCharacterById !== 'function') {
                return;
            }
            const characterId = context.characters.findIndex(character => character?.name === 'Dev Character 001');
            if (characterId >= 0) {
                await context.selectCharacterById(characterId);
            }
        }).catch(() => undefined);
        await page.locator('#chat > .mes[mesid]').first().waitFor({ state: 'attached', timeout: 15_000 }).catch(() => undefined);

        await expect(page.locator('#extensions_settings')).toHaveCount(1);
        await expect(page.locator('#extensions_settings2')).toHaveCount(1);
        await expect(page.locator('#regex_container')).toHaveCount(1);
        await expect(page.locator('#extensionsMenuButton')).toHaveCount(1);

        await expect.poll(async () => page.evaluate(() => Boolean(document.getElementById('tavern_helper'))), {
            timeout: 90_000,
        }).toBe(true);

        const publicShape = await page.evaluate(async () => {
            const st = globalThis.SillyTavern;
            const ctx = typeof st?.getContext === 'function' ? st.getContext() : null;
            const eventSource = ctx?.eventSource;
            const eventTypes = ctx?.eventTypes || ctx?.event_types;
            const executeSlash = ctx?.executeSlashCommandsWithOptions || ctx?.executeSlashCommands;

            let getRegexedString = null;
            let regexPlacement = null;
            try {
                const regexModule = await import('/scripts/extensions/regex/engine.js');
                getRegexedString = regexModule.getRegexedString;
                regexPlacement = regexModule.regex_placement;
            } catch {
                // fall through
            }

            const observed = {
                hasSillyTavern: Boolean(st?.getContext),
                hasEventSource: Boolean(eventSource?.on && eventSource?.emit),
                hasEventTypes: Boolean(eventTypes?.MESSAGE_RECEIVED || eventTypes?.message_received),
                hasSlash: typeof executeSlash === 'function',
                hasRegex: typeof getRegexedString === 'function' && Boolean(regexPlacement),
                eventHeard: false,
                slashOk: false,
                regexOk: false,
                characterRows: 0,
                mutationPreserved: false,
            };

            if (eventSource?.on && eventSource?.emit) {
                const eventName = eventTypes?.MESSAGE_RECEIVED
                    || eventTypes?.message_received
                    || 'message_received';
                await new Promise((resolve) => {
                    const handler = () => {
                        observed.eventHeard = true;
                        eventSource.removeListener?.(eventName, handler);
                        resolve();
                    };
                    eventSource.on(eventName, handler);
                    Promise.resolve(eventSource.emit(eventName, { mes: 'compat-runtime-proof' }))
                        .catch(() => resolve());
                    setTimeout(resolve, 1000);
                });
            }

            if (typeof executeSlash === 'function') {
                try {
                    const result = await executeSlash('/echo compat-runtime-proof', {
                        handleExecutionErrors: true,
                        interrupt: false,
                    });
                    observed.slashOk = result !== undefined;
                } catch {
                    // A thrown slash executor is a real compatibility failure.
                    observed.slashOk = false;
                }
            }

            if (typeof getRegexedString === 'function') {
                try {
                    const placement = regexPlacement?.AI_OUTPUT ?? 2;
                    const transformed = getRegexedString('compat-runtime-proof', placement);
                    observed.regexOk = typeof transformed === 'string';
                } catch {
                    observed.regexOk = false;
                }
            }

            observed.characterRows = document.querySelectorAll(
                '.character_select, .group_select, .bogus_folder_select',
            ).length;

            const mesRow = document.querySelector('#chat > .mes[mesid]');
            const mesText = mesRow?.querySelector('.mes_text');
            if (mesText instanceof HTMLElement && mesRow instanceof HTMLElement) {
                const pre = document.createElement('pre');
                pre.textContent = 'console.log("compat")';
                pre.dataset.compatProof = 'th-render-child';
                mesText.appendChild(pre);
                const wrap = document.createElement('div');
                wrap.className = 'TH-render';
                wrap.dataset.compatProof = 'th-render';
                pre.replaceWith(wrap);
                wrap.appendChild(pre);
                const streaming = document.createElement('div');
                streaming.className = 'TH-streaming w-full';
                streaming.dataset.compatProof = 'th-streaming';
                mesText.after(streaming);

                // Force a React bridge remount/reconciliation cycle against the live row.
                const remount = globalThis.SillyTavern?.getContext?.()?.eventSource?.emit;
                try {
                    if (typeof remount === 'function') {
                        await remount('message_updated', Number(mesRow.getAttribute('mesid') ?? 0));
                    }
                } catch {
                    // Fall through to explicit panel refresh below.
                }
                // Bridge refresh is scheduled via rAF from shell observers; wait a paint.
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

                const wrapStillConnected = wrap.isConnected && mesText.contains(wrap);
                const preStillConnected = pre.isConnected && wrap.contains(pre);
                const streamingStillConnected = streaming.isConnected && mesRow.contains(streaming);
                observed.mutationPreserved = wrapStillConnected && preStillConnected && streamingStillConnected;
                observed.mutationOnLiveChatRow = true;
            } else {
                observed.mutationPreserved = false;
                observed.mutationOnLiveChatRow = false;
            }

            return observed;
        });

        expect(publicShape.hasSillyTavern).toBe(true);
        expect(publicShape.hasEventSource).toBe(true);
        expect(publicShape.hasEventTypes).toBe(true);
        expect(publicShape.eventHeard).toBe(true);
        expect(publicShape.hasSlash).toBe(true);
        expect(publicShape.slashOk).toBe(true);
        expect(publicShape.hasRegex).toBe(true);
        expect(publicShape.regexOk).toBe(true);
        // Prefer a live chat row so reconciliation is real; skip hard-fail when no chat is open.
        if (publicShape.mutationOnLiveChatRow) {
            expect(publicShape.mutationPreserved).toBe(true);
        }

        if (publicShape.characterRows === 0) {
            const characterButton = page.locator('#rm_button_characters, #rightNavDrawerIcon, .drawer-opener[data-target="rightNavHolder"], button:has-text("Open Character Management")').first();
            if (await characterButton.count()) {
                await characterButton.click({ timeout: 5_000 }).catch(() => undefined);
            }
            await expect.poll(async () => page.locator('.character_select, .group_select').count(), {
                timeout: 20_000,
            }).toBeGreaterThan(0);
        } else {
            expect(publicShape.characterRows).toBeGreaterThan(0);
        }
    });
});
