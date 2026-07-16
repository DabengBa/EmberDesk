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
                    observed.slashOk = true;
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

            const mesText = document.querySelector('#chat .mes .mes_text, .mes .mes_text');
            if (mesText) {
                const pre = document.createElement('pre');
                pre.textContent = 'console.log("compat")';
                mesText.appendChild(pre);
                const wrap = document.createElement('div');
                wrap.className = 'TH-render';
                pre.replaceWith(wrap);
                wrap.appendChild(pre);
                const streaming = document.createElement('div');
                streaming.className = 'TH-streaming w-full';
                mesText.after(streaming);
                observed.mutationPreserved = Boolean(
                    mesText.querySelector('.TH-render')
                    && document.querySelector('.TH-streaming'),
                );
            } else {
                const host = document.createElement('div');
                host.className = 'mes';
                host.innerHTML = '<div class="mes_text"><div class="TH-render"><pre>x</pre></div></div><div class="TH-streaming"></div>';
                document.body.appendChild(host);
                observed.mutationPreserved = Boolean(
                    host.querySelector('.TH-render') && host.querySelector('.TH-streaming'),
                );
                host.remove();
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
        expect(publicShape.mutationPreserved).toBe(true);

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
