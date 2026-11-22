/* global window, document */
// From the repository root: pnpm run build:lib && node tests/highlight-built.integration.runner.mjs
// Requires the Playwright Chromium installation used by the E2E lane.
import assert from 'node:assert/strict';
import { once } from 'node:events';

import path from 'node:path';
import { gzipSync } from 'node:zlib';
import express from 'express';
import { chromium } from '@playwright/test';
import full from 'highlight.js';
import { createServer as createViteServer, parseAst } from 'vite';
import getViteLibServeMiddleware from '../src/middleware/vite-lib-serve.ts';

const app = express();
app.use(getViteLibServeMiddleware());
app.get('/highlight-helper.js', (req, res) => res.sendFile(path.resolve('public/scripts/highlight-code-block.js')));
app.get('/fixture.html', (req, res) => res.type('html').send('<!doctype html><title>highlight fixture</title>'));
app.use((req, res) => res.status(404).send('not found'));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
let vite;
const previousBackend = process.env.VITE_BACKEND_ORIGIN;
try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const seen = new Set();
    async function sizeStatic(url) {
        if (seen.has(url)) return { raw: 0, gzip: 0 };
        seen.add(url);
        const response = await fetch(origin + url);
        assert.equal(response.status, 200, url);
        const body = Buffer.from(await response.arrayBuffer());
        const text = body.toString();
        let raw = body.length, gzip = gzipSync(body).length;
        for (const node of parseAst(text).body) {
            if (!['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)) continue;
            const specifier = node.source?.value;
            if (typeof specifier !== 'string' || !specifier.startsWith('.')) continue;
            const child = new URL(specifier, origin + url).pathname;
            const subtotal = await sizeStatic(child);
            raw += subtotal.raw;
            gzip += subtotal.gzip;
        }
        return { raw, gzip };
    }
    const size = await sizeStatic('/lib.js');
    assert.ok(seen.size > 1, 'the entry transitive static imports must be counted');
    console.log(`startup: raw=${size.raw} gzip=${size.gzip} files=${[...seen].join(',')}`);
    for (const url of ['/highlight-chunks/no-such-file.js', '/highlight-chunks/other.txt', '/highlight-chunks/sub/file.js', '/scripts/message-service.js']) {
        assert.equal((await fetch(origin + url)).status, 404, url);
    }
    assert.equal((await fetch(origin + '/lib.js', { method: 'POST' })).status, 404);

    const common = [
        ['js', 'const x = 1;'], ['typescript', 'const x: number = 1;'], ['python', 'def f(x):\n    return x + 1'],
        ['json', '{"value": true}'], ['html', '<script>const x = 1;</script>'],
        ['css', 'a { color: red; }'], ['bash', 'echo "$HOME"'],
        ['js', 'const query = graphql`query { user { id } }`;'],
    ];
    const rust = 'fn main() { println!("hello"); }';
    const auto = 'def hello(name):\n    return "hello " + name';
    const expectedCommon = common.map(([language, code]) => full.highlight(code, { language, ignoreIllegals: true }).value);
    const expectedRust = full.highlight(rust, { language: 'rust', ignoreIllegals: true }).value;
    const expectedAuto = full.highlightAuto(auto);

    process.env.VITE_BACKEND_ORIGIN = origin;
    vite = await createViteServer({ configFile: path.resolve('vite.config.ts'), configLoader: 'runner',
        server: { port: 0, host: '127.0.0.1' }, logLevel: 'silent' });
    await vite.listen();
    const proxyOrigin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const chunkResponses = [];
    page.on('response', response => {
        if (new URL(response.url()).pathname.startsWith('/highlight-chunks/')) chunkResponses.push([new URL(response.url()).pathname, response.status()]);
    });
    await page.goto(`${proxyOrigin}/fixture.html`);
    const result = await page.evaluate(async ({ common, rust, auto, expectedCommon, expectedRust, expectedAuto }) => {
        const lib = await import('/lib.js');
        const { highlightCodeBlock } = await import('/highlight-helper.js');
        const identity = lib.hljs === lib.default.hljs && window.hljs === undefined;
        const initialLanguages = lib.hljs.listLanguages();
        const create = (label, text) => {
            const pre = document.createElement('pre'), code = document.createElement('code'), button = document.createElement('i');
            if (label) code.className = label;
            code.textContent = text;
            pre.appendChild(code);
            document.body.appendChild(pre);
            highlightCodeBlock(lib.hljs, code, button);
            code.appendChild(button);
            return { code, button };
        };
        const stripButton = ({ code, button }) => { button.remove(); return code.innerHTML; };
        const commonHtml = common.map(([name, text]) => stripButton(create(`language-${name}`, text)));
        const skipped = create('no-highlight', '<b>raw</b>');
        const deferred = create('language-rust', rust);
        const detected = create('', auto);
        const unknown = create('language-not-a-language', 'not code');
        const before = { deferred: deferred.code.dataset.highlighted, detected: detected.code.dataset.highlighted,
            copyAttached: deferred.button.parentNode === deferred.code, skipped: skipped.code.dataset.highlighted };
        await lib.hljs.loadAllLanguages();
        await Promise.resolve();
        const normalize = html => { const element = document.createElement('code'); element.innerHTML = html; return element.innerHTML; };
        return { identity, initialLanguages, commonHtml, before, expectedCommon: expectedCommon.map(normalize),
            expectedRust: normalize(expectedRust), expectedAuto: normalize(expectedAuto), languages: lib.hljs.listLanguages(),
            rustHtml: stripButton(deferred), autoHtml: stripButton(detected), autoLanguage: detected.code.result.language,
            unknownHighlighted: unknown.code.dataset.highlighted, unknownCopyAttached: unknown.button.parentNode === unknown.code };
    }, { common, rust, auto, expectedCommon, expectedRust, expectedAuto: expectedAuto.value });
    assert.equal(result.identity, true);
    assert.ok(!result.initialLanguages.includes('rust'));
    assert.deepEqual(result.commonHtml, result.expectedCommon);
    assert.deepEqual(result.before, { deferred: undefined, detected: undefined, copyAttached: true, skipped: undefined });
    assert.equal(result.rustHtml, result.expectedRust);
    assert.equal(result.autoHtml, result.expectedAuto);
    assert.equal(result.autoLanguage, expectedAuto.language);
    assert.deepEqual(result.languages, full.listLanguages());
    assert.equal(result.unknownHighlighted, undefined);
    assert.equal(result.unknownCopyAttached, true);
    assert.ok(chunkResponses.every(([, status]) => status === 200));
    assert.ok(chunkResponses.some(([url]) => !seen.has(url)), 'browser loaded a real lazy chunk');
    for (const [url] of chunkResponses) {
        const direct = await fetch(origin + url);
        const proxied = await fetch(proxyOrigin + url);
        assert.equal(direct.status, 200);
        assert.equal(proxied.status, 200);
        assert.deepEqual(Buffer.from(await direct.arrayBuffer()), Buffer.from(await proxied.arrayBuffer()));
    }
    console.log(`browser chunks: ${JSON.stringify(chunkResponses)}`);
    console.log('highlight-built: ok');
} finally {
    await browser?.close();
    await vite?.close();
    await new Promise(resolve => server.close(resolve));
    if (previousBackend === undefined) delete process.env.VITE_BACKEND_ORIGIN;
    else process.env.VITE_BACKEND_ORIGIN = previousBackend;
}
