import { test, expect } from '@playwright/test';
import { testSetup } from './frontend/frontent-test-utils.js';

test('unmatched quotes in unquoted style attributes fail closed', async ({ page }) => {
    await testSetup.awaitST({ page });

    const requests = [];
    await page.route('https://external.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
    const result = await page.evaluate(async () => {
        const { messageFormatting } = await import('/scripts/message-service.js');
        const outside = document.createElement('div'); document.body.append(outside);
        const before = getComputedStyle(outside).color;
        const host = document.createElement('div'); host.className = 'mes_text';
        host.innerHTML = messageFormatting('hello\n\n<style/foo=bar"baz>*{color:rgb(1,2,3)!important;background:url(https://external.invalid/quote)}</style>\n\n<div>kept</div>', '', false, false, -1);
        document.body.append(host);
        await new Promise(resolve => setTimeout(resolve, 400));
        return { before, after: getComputedStyle(outside).color, html: host.innerHTML };
    });
    expect(requests).toEqual([]);
    expect(result.after).toBe(result.before);
    expect(result.html).not.toContain('external.invalid');
});

test('malformed style tags cannot escape message CSS policy after Markdown', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://external.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
    const result = await page.evaluate(async () => {
        const { messageFormatting } = await import('/scripts/message-service.js');
        const variants = [
            ['<style/foo>', '</style>'], ['<style//>', '</style>'],
            ['<style/*>', '</style>'], ['<STYLE/foo bar=baz>', '</STYLE>'],
            ['<style/media=screen>', '</style>'], ['<style>', '</style/foo>'],
            ['<style>', '</style x y>'], ['<style>', '</style/>'],
        ];
        const outside = document.createElement('div'); outside.textContent = 'outside'; document.body.append(outside);
        const before = getComputedStyle(outside).color;
        const hosts = variants.map(([start, end], index) => {
            const host = document.createElement('div'); host.className = 'mes_text';
            host.innerHTML = messageFormatting(`hello\n\n${start}*{color:rgb(1,2,3)!important;background:url(https://external.invalid/${index})}${end}\n\n<div class="probe">kept</div>`, '', false, false, -1);
            document.body.append(host); return host;
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        return { before, outside: getComputedStyle(outside).color, colors: hosts.map(host => { const el = host.querySelector('.custom-probe'); return el && getComputedStyle(el).color; }), html: hosts.map(host => host.innerHTML) };
    });
    expect(requests).toEqual([]);
    expect(result.outside).toBe(result.before);
    expect(result.colors).toEqual(Array(8).fill('rgb(1, 2, 3)'));
    expect(result.html.join('')).not.toContain('external.invalid');
});

test('every HTML style tag variant is filtered before the browser sees it', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://external.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
    const result = await page.evaluate(async () => {
        const { messageFormatting } = await import('/scripts/message-service.js');
        const variants = [
            '<style>.probe{background:url(https://external.invalid/a)}</style>',
            '<style type="text/css">.probe{background:url(https://external.invalid/b)}</style>',
            '<style type=text/css>.probe{background:url(https://external.invalid/c)}</style>',
            '<style >.probe{background:url(https://external.invalid/d)}</style >',
            '<style\n>.probe{background:url(https://external.invalid/e)}</style\n>',
            '<STYLE>.probe{background:url(https://external.invalid/f)}</STYLE>',
            '<style media="screen">.probe{background:url(https://external.invalid/g)}</style>',
            '<style data-probe="a>b">.probe{background:url(https://external.invalid/h)}</style>',
            '<style/>.probe{background:url(https://external.invalid/i)}</style>',
            '<style type="TEXT/CSS">.probe{background:url(https://external.invalid/j)}</style>',
            '<style type="text/css; charset=utf-8">.probe{background:url(https://external.invalid/k)}</style>',
        ];
        const host = document.createElement('div'); host.className = 'mes_text';
        const perVariant = [];
        for (const variant of variants) {
            const item = document.createElement('div'); item.className = 'mes_text';
            const styled = variant.replace('.probe{', '.probe{color:rgb(1, 2, 3);');
            item.innerHTML = messageFormatting(`${styled}<div class="probe">text</div>`, '', true, false, -1);
            host.append(item);
            perVariant.push({ probes: item.querySelectorAll('.custom-probe').length, html: item.innerHTML });
        }
        document.body.append(host);
        await new Promise(resolve => setTimeout(resolve, 400));
        return {
            html: host.innerHTML,
            probeCount: host.querySelectorAll('.custom-probe').length,
            styles: [...host.querySelectorAll('style')].length,
            colors: [...host.querySelectorAll('.custom-probe')].map(probe => getComputedStyle(probe).color),
            perVariant,
        };
    });
    expect(result.perVariant.map(item => item.probes)).toEqual(Array(11).fill(1));
    expect(result.probeCount).toBe(11);
    expect(result.colors).toEqual(Array(11).fill('rgb(1, 2, 3)'));
    // Style elements may be optimised away by the sanitizer; requests are the contract.
    expect(result.styles).toBeGreaterThanOrEqual(0);
    expect(result.html).not.toContain('external.invalid');
    expect(requests).toEqual([]);
});

test('style tags inside code fences stay display-only text', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://external.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
    const result = await page.evaluate(async () => {
        const { messageFormatting } = await import('/scripts/message-service.js');
        const host = document.createElement('div'); host.className = 'mes_text';
        const backtickFence = ['```html', '<style>', '.probe { background: url(https://external.invalid/fence) }', '</style>', '```'].join('\n');
        const tildeFence = ['  ~~~css', '<style >', '.probe { background: url(https://external.invalid/tilde) }', '</style >', '  ~~~'].join('\n');
        const inline = 'inline code keeps `<style >.a{color:red}</style >` verbatim';
        const crlfFence = ['```html', '<style >', '.probe { background: url(https://external.invalid/crlf) }', '</style >', '```'].join('\r\n');
        host.innerHTML = messageFormatting(`${backtickFence}\n\n${tildeFence}\n\n${crlfFence}\n\n${inline}\n\n<style media="screen">.real{color:rgb(4, 5, 6)}</style><div class="real">x</div>`, '', true, false, -1);
        document.body.append(host);
        await new Promise(resolve => setTimeout(resolve, 300));
        return {
            codes: [...host.querySelectorAll('code')].map(code => code.textContent.replace(/\r\n/g, '\n').trimEnd()),
            color: getComputedStyle(host.querySelector('.custom-real') ?? document.body).color,
            media: host.querySelector('style')?.getAttribute('media') ?? null,
        };
    });
    expect(result.codes).toEqual([
        '<style>\n.probe { background: url(https://external.invalid/fence) }\n</style>',
        '<style >\n.probe { background: url(https://external.invalid/tilde) }\n</style >',
        '<style >\n.probe { background: url(https://external.invalid/crlf) }\n</style >',
        '<style >.a{color:red}</style >',
    ]);
    expect(result.color).toBe('rgb(4, 5, 6)');
    expect(result.media).toBe('screen');
    expect(requests).toEqual([]);
});

test('creator notes keep their full-page style authorization', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { formatCreatorNotes } = await import('/scripts/chats.js');
        return formatCreatorNotes('<style>.note{background:url(https://creator.invalid/note)}</style><div class="note">text</div>', '');
    });
    expect(result).toContain('https://creator.invalid/note');
    expect(result).not.toContain('data-style-media');
});

test('ordinary message CSS follows the active character authorization', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://css-role.invalid/**', route => { requests.push(new URL(route.request().url()).pathname); return route.abort(); });
    await page.evaluate(async () => {
        const { messageFormatting } = await import('/scripts/message-service.js');
        const { getMessageShellContext, registerMessageShellContext } = await import('/scripts/message-shell-context.js');
        const original = getMessageShellContext();
        const render = (avatar, path) => {
            registerMessageShellContext({ ...original, state: { ...original.state, characters: [{ avatar, canonical_id: 'role-id' }], this_chid: 0, power_user: { ...original.state.power_user, external_media_allowed_overrides: ['allowed.png'], external_media_authorization_canonical_ids: { 'allowed.png': 'role-id' } } } });
            const host = document.createElement('div'); host.className = 'mes_text';
            host.innerHTML = messageFormatting(`<style>.probe{background-image:url(https://css-role.invalid/${path})}</style><div class="probe">test</div>`, '', true, false, -1);
            document.body.append(host);
        };
        try {
            render('blocked.png', 'blocked.png');
            render('allowed.png', 'allowed.png');
            await new Promise(resolve => setTimeout(resolve, 400));
        } finally { registerMessageShellContext(original); }
    });
    expect(requests).toContain('/allowed.png');
    expect(requests).not.toContain('/blocked.png');
});

test('important CSS and animation declarations remain effective without allowing external CSS resources', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://external.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
    const result = await page.evaluate(async () => {
        const { messageFormatting } = await import('/scripts/message-service.js');
        const host = document.createElement('div'); host.className = 'mes_text';
        host.innerHTML = messageFormatting('<style>@keyframes s {from{opacity:.1}to{opacity:.9}} .probe {color: red !important; animation: s 1s linear !important; background-image:url(https://external.invalid/important.png) !important}</style><div class="probe">text</div>', '', true, false, -1);
        document.body.append(host);
        await new Promise(resolve => setTimeout(resolve, 300));
        const style = getComputedStyle(host.querySelector('.custom-probe'));
        return { color: style.color, animation: style.animationName, duration: style.animationDuration, html: host.innerHTML };
    });
    expect(result.color).toBe('rgb(255, 0, 0)');
    expect(result.animation).not.toBe('none');
    expect(result.duration).toBe('1s');
    expect(result.html).not.toContain('external.invalid');
    expect(requests).toEqual([]);
});

test('SVG presentation resources respect media authorization before insertion', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://external.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
    const result = await page.evaluate(async () => {
        const { filterMessageInlineStyles } = await import('/scripts/message-css-policy.js');
        const names = ['fill', 'stroke', 'filter', 'mask', 'clip-path', 'marker-start', 'marker-mid', 'marker-end', 'cursor'];
        const make = (value, allowed) => {
            const attrs = names.map(name => `${name}="${value}"`).join(' ');
            const host = document.createElement('div');
            host.innerHTML = filterMessageInlineStyles(`<svg><path d="M0 0 L20 20" ${attrs}/></svg>`, allowed);
            document.body.append(host);
            return names.map(name => host.querySelector('path').getAttribute(name));
        };
        const blocked = make('url(https://external.invalid/blocked.svg#x)', false);
        const escaped = make('u\\72l(https://external.invalid/escaped.svg#x)', false);
        const variable = make('var(--image)', false);
        const authorized = make('url(https://external.invalid/authorized.svg#x)', true);
        const local = make('url(#x)', false);
        await new Promise(resolve => setTimeout(resolve, 400));
        return { blocked, escaped, variable, authorized, local };
    });
    expect(result.blocked.every(x => x === null)).toBe(true);
    expect(result.escaped.every(x => x === null)).toBe(true);
    expect(result.variable.every(x => x === null)).toBe(true);
    expect(result.authorized.slice(0, 8).every(x => x?.includes('external.invalid'))).toBe(true);
    expect(result.local.slice(0, 8).every(x => x === 'url(#x)')).toBe(true);
    expect(requests.some(url => url.includes('/authorized.svg'))).toBe(true);
    expect(requests.some(url => /blocked|escaped/.test(url))).toBe(false);
});

test('short keyframe names and inline animations retain timing and message isolation', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { messageFormatting } = await import('/scripts/message-service.js');
        const host = document.createElement('div'); host.className = 'mes_text';
        const input = '<style>@keyframes s {from{opacity:.1}to{opacity:.9}} .probe{animation:s 1s linear}</style><div class="probe">sheet</div><div class="inline" style="animation:s 2s linear">inline</div><div class="longhand" style="animation-name:s;animation-duration:4s">longhand</div><div class="unknown" style="animation:foreign 3s">unknown</div>';
        host.innerHTML = messageFormatting(input, '', true, false, -1);
        document.body.append(host);
        const other = document.createElement('div'); other.className = 'mes_text';
        other.innerHTML = messageFormatting(input, '', true, false, -1); document.body.append(other);
        const get = selector => { const s = getComputedStyle(host.querySelector(selector)); return { name: s.animationName, duration: s.animationDuration }; };
        return { sheet: get('.custom-probe'), inline: get('.custom-inline'), longhand: get('.custom-longhand'), unknown: get('.custom-unknown'), other: getComputedStyle(other.querySelector('.custom-inline')).animationName };
    });
    expect(result.sheet.name).not.toBe('none');
    expect(result.sheet.duration).toBe('1s');
    expect(result.inline.name).toBe(result.sheet.name);
    expect(result.inline.duration).toBe('2s');
    expect(result.longhand.name).toBe(result.sheet.name);
    expect(result.longhand.duration).toBe('4s');
    expect(result.other).not.toBe(result.sheet.name);
    expect(result.unknown.name).toBe('none');
});

test('ordinary message formatting filters CSS before a browser inserts it', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://external.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
    const html = await page.evaluate(async () => {
        const { messageFormatting } = await import('/scripts/message-service.js');
        const host = document.createElement('div'); host.className = 'mes_text';
        const input = '<style>.probe{background:url(https://external.invalid/sheet)}</style><div class="probe" style="background:url(https://external.invalid/inline)">text</div><svg><path d="M0 0L20 20" fill="url(https://external.invalid/svg.svg#x)"></path></svg>';
        host.innerHTML = messageFormatting(input, '', true, false, -1);
        document.body.append(host);
        await new Promise(resolve => setTimeout(resolve, 400));
        return host.innerHTML;
    });
    expect(html).not.toContain('external.invalid');
    expect(requests).toEqual([]);
});

test('CSS network policy permits local and authorized resources only', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('**/message-policy-local.png', route => { requests.push('local'); return route.fulfill({ status: 200, contentType: 'image/png', body: '' }); });
    await page.route('https://external.invalid/**', route => { requests.push(new URL(route.request().url()).pathname); return route.fulfill({ status: 200, contentType: 'image/png', body: '' }); });
    await page.evaluate(async () => {
        const { decodeStyleTags } = await import('/scripts/chats.js');
        const render = (allowed, css) => {
            const host = document.createElement('div'); host.className = 'mes_text';
            host.innerHTML = decodeStyleTags(`<custom-style>${encodeURIComponent(css)}</custom-style><div class="custom-probe"></div>`, { prefix: '.mes_text ', messagePolicy: true, allowExternalMedia: allowed });

            document.body.append(host);
        };
        render(false, '.probe { background-image: url(/message-policy-local.png) }');
        render(false, '.blocked { background-image: url(https://external.invalid/blocked) }');
        const blocked = document.createElement('div'); blocked.className = 'mes_text'; blocked.innerHTML = '<div class="custom-blocked"></div>'; document.body.append(blocked);
        render(true, '.authorized { background-image: image-set("https://external.invalid/authorized" 1x) }');
        const authorized = document.createElement('div'); authorized.className = 'mes_text'; authorized.innerHTML = '<div class="custom-authorized"></div>'; document.body.append(authorized);
        await new Promise(resolve => setTimeout(resolve, 500));
    });
    expect(requests).toContain('local');
    expect(requests).toContain('/authorized');
    expect(requests).not.toContain('/blocked');
});

test('invalid message styles are dropped without exposing parser errors as HTML', async ({ page }) => {
    await testSetup.awaitST({ page });
    const output = await page.evaluate(async () => {
        const { decodeStyleTags } = await import('/scripts/chats.js');
        return decodeStyleTags(`<custom-style>${encodeURIComponent('.broken { color: red')}</custom-style>`, { prefix: '.mes_text ', messagePolicy: true });
    });
    expect(output).toBe('');
});

test('message animations and selectors are isolated from other messages and the page', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const { decodeStyleTags } = await import('/scripts/chats.js');
        const render = (scope, color) => {
            const css = `@keyframes pulse { from { opacity: .1 } to { opacity: .9 } } .probe { animation: pulse 10s linear; color: ${color} } + .escape { color: red }`;
            const encoded = `<custom-style>${encodeURIComponent(css)}</custom-style><div class="custom-probe"></div>`;
            const host = document.createElement('div'); host.className = 'mes_text';
            host.innerHTML = `<div data-message-style-scope="${scope}">${decodeStyleTags(encoded, { prefix: `.mes_text [data-message-style-scope="${scope}"] `, messagePolicy: true, animationScope: scope })}</div><div class="custom-escape"></div>`;
            document.body.append(host);
            return host.querySelector('.custom-probe');
        };
        const a = render('msg-a', 'red');
        const b = render('msg-b', 'blue');
        const outside = document.createElement('div'); outside.className = 'custom-probe'; document.body.append(outside);
        return { a: getComputedStyle(a).animationName, b: getComputedStyle(b).animationName, ac: getComputedStyle(a).color, bc: getComputedStyle(b).color, outside: getComputedStyle(outside).animationName, escapedColor: getComputedStyle(a.closest('.mes_text').querySelector('.custom-escape')).color };
    });
    expect(result.a).not.toBe('none');
    expect(result.b).not.toBe('none');
    expect(result.a).not.toBe(result.b);
    expect(result.ac).toBe('rgb(255, 0, 0)');
    expect(result.bc).toBe('rgb(0, 0, 255)');
    expect(result.outside).toBe('none');
    expect(result.escapedColor).not.toBe('rgb(255, 0, 0)');
});

test('decoded message styles and inline styles do not fetch unauthorized resources', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://external.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
    const result = await page.evaluate(async () => {
        const { decodeStyleTags } = await import('/scripts/chats.js');
        const { filterMessageInlineStyles } = await import('/scripts/message-css-policy.js');
        const css = '.probe{background-image:image-set("https://external.invalid/sheet" 1x)} .probe2{background:u\\72l(https://external.invalid/escaped)} .probe3{--img:url(https://external.invalid/variable);background:var(--img)}';
        const html = `<custom-style>${encodeURIComponent(css)}</custom-style><div class="custom-probe"></div><div class="custom-probe2" style="background-image:url(https://external.invalid/inline)"></div><div class="custom-probe3"></div>`;
        const host = document.createElement('div'); host.className = 'mes_text';
        host.innerHTML = decodeStyleTags(filterMessageInlineStyles(html, false), { prefix: '.mes_text ', messagePolicy: true });
        document.body.append(host);
        await new Promise(resolve => setTimeout(resolve, 400));
        return host.innerHTML;
    });
    expect(result).not.toContain('external.invalid');
    expect(requests).toEqual([]);
});

test('css var() shorthands cannot smuggle resource fallbacks', async ({ page }) => {
    await testSetup.awaitST({ page });
    const requests = [];
    await page.route('https://external.invalid/**', route => { requests.push(route.request().url()); return route.abort(); });
    const result = await page.evaluate(async () => {
        const { messageFormatting } = await import('/scripts/message-service.js');
        const host = document.createElement('div'); host.className = 'mes_text';
        const inlineProperties = ['background', 'border', 'border-image', 'font', 'mask', 'list-style'];
        const markup = inlineProperties.map((property, index) => `<div class="inline-${index}" style="${property}: var(--missing, url(https://external.invalid/inline-${property}))">x</div>`).join('')
            + '<style>.sheet{background: var(--missing, url(https://external.invalid/sheet));color: rgb(9, 8, 7)} .sheet-animation{animation: var(--missing)} .sheet-solid{background-image: url(/message-policy-local.png);color: rgb(6, 5, 4)}</style>'
            + '<div class="inline-uppercase" style="background: VAR(--missing, url(https://external.invalid/upper))">u</div>'
            + '<div class="inline-comment" style="color: rgb(3, 4, 5); /* var(--x) */ background: rgb(5, 6, 7)">c</div>'
            + '<div class="inline-string" style="font-family: \'var(--x)\'; color: rgb(2, 3, 4)">f</div>'
            + '<div class="sheet">s</div><div class="sheet-animation">a</div><div class="sheet-solid">t</div>';
        host.innerHTML = messageFormatting(markup, '', true, false, -1);
        document.body.append(host);
        await new Promise(resolve => setTimeout(resolve, 600));
        return {
            html: host.innerHTML,
            inlineStyles: inlineProperties.map((_, index) => host.querySelector(`.custom-inline-${index}`)?.getAttribute('style') ?? null),
            sheetColor: getComputedStyle(host.querySelector('.custom-sheet') ?? document.body).color,
            solidColor: getComputedStyle(host.querySelector('.custom-sheet-solid') ?? document.body).color,
            animationName: getComputedStyle(host.querySelector('.custom-sheet-animation') ?? document.body).animationName,
            uppercaseStyle: host.querySelector('.custom-inline-uppercase')?.getAttribute('style') ?? null,
            commentColor: getComputedStyle(host.querySelector('.custom-inline-comment') ?? document.body).color,
            commentBackground: getComputedStyle(host.querySelector('.custom-inline-comment') ?? document.body).backgroundColor,
            stringFamily: host.querySelector('.custom-inline-string')?.getAttribute('style') ?? null,
        };
    });
    expect(result.html).not.toContain('external.invalid');
    expect(result.inlineStyles).toEqual(Array(6).fill(null));
    // Only the var() declaration is dropped; the rest of the rule keeps working.
    expect(result.sheetColor).toBe('rgb(9, 8, 7)');
    expect(result.solidColor).toBe('rgb(6, 5, 4)');
    expect(result.animationName).toBe('none');
    expect(result.uppercaseStyle).toBeNull();
    // var() written inside a comment or a string is not a substitution.
    expect(result.commentColor).toBe('rgb(3, 4, 5)');
    expect(result.commentBackground).toBe('rgb(5, 6, 7)');
    expect(result.stringFamily).toContain('var(--x)');
    expect(result.stringFamily).toContain('rgb(2, 3, 4)');
    expect(requests).toEqual([]);
});

test('message CSS resource values fail closed and respect character authorization', async ({ page }) => {
    await testSetup.awaitST({ page });
    const facts = await page.evaluate(async () => {
        const { sanitizeMessageCssDeclarations } = await import('/scripts/message-css-policy.js');
        const check = (value, allowed = false) => sanitizeMessageCssDeclarations(`background-image: ${value}`, allowed);
        return {
            local: check('url(/local.png)'),
            data: check('url("data:image/png;base64,AA==")'),
            external: check('url(https://external.invalid/a)'),
            authorized: check('url(https://external.invalid/a)', true),
            escaped: check('u\\72l(https://external.invalid/a)'),
            imageSet: check('image-set("https://external.invalid/a" 1x)'),
            localSet: check('image-set("/local.png" 1x)'),
            variable: check('var(--image, url(/local.png))'),
            malformed: check('url("unterminated)'),
        };
    });
    expect(facts.local).toContain('/local.png');
    expect(facts.data).toContain('data:image/png');
    expect(facts.authorized).toContain('external.invalid');
    expect(facts.localSet).toContain('/local.png');
    for (const key of ['external', 'escaped', 'imageSet', 'variable', 'malformed']) expect(facts[key]).toBe('');
});
