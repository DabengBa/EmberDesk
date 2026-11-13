import { expect, test } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

test('pins preserve formatter styles and media authorization across special markup', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { chat, messageFormatting } = await import('/script.js');
        const { applyStylePins } = await import('/scripts/power-user.js');
        const { getMessageShellContext, registerMessageShellContext } = await import('/scripts/message-shell-context.js');
        const original = getMessageShellContext();
        const previousChat = chat.slice();
        const chatElement = document.getElementById('chat');
        const previousNodes = [...chatElement.childNodes];
        const variants = [
            '<style media="print">.probe { color: red }</style><style media="screen and (min-width: 1px)">.probe { font-weight: bold }</style>',
            '<STYLE type="text/css; charset=utf-8">@keyframes s { from { opacity: .1 } to { opacity: .9 } } .probe { animation: s 1s linear !important }</STYLE>',
            '<style>.probe { color: rgb(1, 2, 3); background-image: url(https://style-pin.invalid/image) }</style>',
            '```html\n<style>.fake { color: red }</style>\n```\n\n<style>.real { color: blue }</style>',
            '<svg><style>.probe { fill: red }</style><path d="M0 0 L1 1"></path></svg>',
            '<style type="application/json">.ignored { color: red }</style><style>.kept { color: blue }</style>',
            '<style>.broken { color: red</style>',
        ];
        const styles = root => [...root.querySelectorAll('style')].map(style => ({
            text: style.textContent,
            media: style.getAttribute('media'),
            namespace: style.namespaceURI,
        }));
        const comparisons = [];
        try {
            for (const allowed of [false, true]) {
                registerMessageShellContext({ ...original, state: {
                    ...original.state,
                    characters: [{ avatar: 'pin.png', canonical_id: 'pin-id' }],
                    this_chid: 0,
                    power_user: { ...original.state.power_user,
                        external_media_allowed_overrides: allowed ? ['pin.png'] : [],
                        external_media_authorization_canonical_ids: { 'pin.png': 'pin-id' } },
                } });
                for (const text of variants) {
                    const row = document.createElement('div');
                    row.className = 'mes';
                    row.setAttribute('mesid', '1');
                    chatElement.replaceChildren(row);
                    chat.splice(0, chat.length, { name: 'Test', is_system: false, is_user: false, mes: text });
                    const baseline = document.createElement('div');
                    baseline.innerHTML = messageFormatting(text, 'Test', false, false, 0, {}, false);
                    const expected = styles(baseline);
                    applyStylePins();
                    const pins = chatElement.querySelector(':scope > .style-pins');
                    comparisons.push({ allowed, text, expected, actual: pins ? styles(pins) : [] });
                }
            }
        } finally {
            registerMessageShellContext(original);
            chat.splice(0, chat.length, ...previousChat);
            chatElement.replaceChildren(...previousNodes);
        }
        return comparisons;
    });

    for (const comparison of result) {
        expect(comparison.actual, `allowed=${comparison.allowed} input=${comparison.text}`).toEqual(comparison.expected);
    }
    const css = result.filter(item => item.text.includes('style-pin.invalid'));
    expect(css[0].expected[0].text).not.toContain('style-pin.invalid');
    expect(css[1].expected[0].text).toContain('style-pin.invalid');
    expect(result.find(item => item.text.startsWith('```')).expected).toHaveLength(1);
    expect(result[0].expected.map(style => style.media)).toEqual(['print', 'screen and (min-width: 1px)']);
    expect(result[1].expected[0].text).toContain('@keyframes');
    expect(result[5].expected).toHaveLength(1);
});

test('style pins retain formatted CSS and resource policy without an HTML assignment', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://style-pin.invalid/**', route => {
        requests.push(route.request().url());
        return route.abort();
    });

    const result = await page.evaluate(async () => {
        const { chat, messageFormatting } = await import('/script.js');
        const { applyStylePins } = await import('/scripts/power-user.js');
        const chatElement = document.getElementById('chat');
        const previousChat = chat.slice();
        const row = document.createElement('div');
        row.className = 'mes';
        row.setAttribute('mesid', '1');
        chatElement.replaceChildren(row);
        chat.splice(0, chat.length, {
            name: 'Test', is_system: false, is_user: false,
            mes: '<style media="screen">.pin-probe { color: rgb(1, 2, 3); background-image: url(https://style-pin.invalid/blocked) }</style>\n\n<style>.pin-other { font-weight: bold }</style>',
        });

        const baseline = document.createElement('div');
        baseline.innerHTML = messageFormatting(chat[0].mes, chat[0].name, false, false, 0, {}, false);
        const styles = root => Array.from(root?.querySelectorAll('style') ?? [], style => ({
            text: style.textContent.replace(/message-[\da-f-]{36}/g, 'message-scope'),
            media: style.getAttribute('media'),
        }));
        const expected = styles(baseline);
        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        let directAssignments = 0;
        Object.defineProperty(Element.prototype, 'innerHTML', {
            ...descriptor,
            set(value) {
                if (new Error().stack.split('\n')[2]?.includes('applyStylePins')) {
                    directAssignments++;
                    throw new TypeError('Direct HTML assignment in applyStylePins');
                }
                descriptor.set.call(this, value);
            },
        });

        const errors = [];
        const originalError = console.error;
        console.error = (...args) => errors.push(args.map(value => value?.stack || String(value)).join(' '));
        applyStylePins();
        const pins = chatElement.querySelector(':scope > .style-pins');
        const actual = styles(pins);
        applyStylePins();
        const pinCount = chatElement.querySelectorAll(':scope > .style-pins').length;
        console.error = originalError;
        Object.defineProperty(Element.prototype, 'innerHTML', descriptor);
        chat.splice(0, chat.length, ...previousChat);
        return { directAssignments, expected, actual, pinCount, errors };
    });

    expect(result.directAssignments).toBe(0);
    expect(result.expected).toHaveLength(2);
    expect(result.expected[0].media).toBe('screen');
    expect(result.expected[0].text).not.toContain('style-pin.invalid');
    expect(result.errors).toEqual([]);
    expect(result.actual).toEqual(result.expected);
    expect(result.pinCount).toBe(1);
    expect(requests).toEqual([]);
});

test('inserted pins apply scoped CSS and honor character resource authorization', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://style-pin.invalid/**', route => {
        requests.push(route.request().url());
        return route.abort();
    });

    const results = await page.evaluate(async () => {
        const { chat, messageFormatting } = await import('/script.js');
        const { applyStylePins } = await import('/scripts/power-user.js');
        const { getMessageShellContext, registerMessageShellContext } = await import('/scripts/message-shell-context.js');
        const original = getMessageShellContext();
        const previousChat = chat.slice();
        const chatElement = document.getElementById('chat');
        const previousNodes = [...chatElement.childNodes];
        const values = [];
        try {
            for (const allowed of [false, true]) {
                registerMessageShellContext({ ...original, state: {
                    ...original.state,
                    characters: [{ avatar: 'pin.png', canonical_id: 'pin-id' }],
                    this_chid: 0,
                    power_user: { ...original.state.power_user,
                        external_media_allowed_overrides: allowed ? ['pin.png'] : [],
                        external_media_authorization_canonical_ids: { 'pin.png': 'pin-id' } },
                } });
                const text = `<style>.pin-probe { color: rgb(1, 2, 3); background-image: url(https://style-pin.invalid/${allowed ? 'allowed' : 'blocked'}) }</style><div class="pin-probe">probe</div>`;
                chat.splice(0, chat.length, { name: 'Test', is_system: false, is_user: false, mes: text });
                const formatted = messageFormatting(text, 'Test', false, false, 0, {}, false);
                const rendered = document.createElement('div');
                rendered.className = 'mes_text';
                rendered.innerHTML = formatted;
                rendered.querySelectorAll('style').forEach(style => style.remove());
                const row = document.createElement('div');
                row.className = 'mes';
                row.setAttribute('mesid', '1');
                row.append(rendered);
                chatElement.replaceChildren(row);
                applyStylePins();
                const target = rendered.querySelector('.custom-pin-probe');
                values.push({ color: getComputedStyle(target).color, image: getComputedStyle(target).backgroundImage });
                await new Promise(resolve => setTimeout(resolve, 400));
            }
        } finally {
            registerMessageShellContext(original);
            chat.splice(0, chat.length, ...previousChat);
            chatElement.replaceChildren(...previousNodes);
        }
        return values;
    });

    expect(results.map(value => value.color)).toEqual(['rgb(1, 2, 3)', 'rgb(1, 2, 3)']);
    expect(results[0].image).not.toContain('style-pin.invalid');
    expect(results[1].image).toContain('/allowed');
    expect(requests.some(url => url.endsWith('/allowed'))).toBe(true);
    expect(requests.some(url => url.endsWith('/blocked'))).toBe(false);
});
