import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const scriptSourcePath = process.env.U006_SCRIPT_SOURCE || path.join(repoRoot, 'public/script.js');
const scriptSource = fs.readFileSync(scriptSourcePath, 'utf8');
const powerUserSource = fs.readFileSync(path.join(repoRoot, 'public/scripts/power-user.js'), 'utf8');

function extractFunctionSource(source, functionName) {
    const functionStart = source.indexOf(`function ${functionName}(`);
    expect(functionStart).toBeGreaterThanOrEqual(0);

    const bodyStart = source.indexOf('{', functionStart);
    expect(bodyStart).toBeGreaterThanOrEqual(0);

    let depth = 0;
    for (let index = bodyStart; index < source.length; index++) {
        if (source[index] === '{') depth++;
        if (source[index] === '}') depth--;
        if (depth === 0) return source.slice(functionStart, index + 1);
    }

    throw new Error(`Could not extract function source for ${functionName}`);
}

function loadPureFunction(functionName) {
    const functionSource = extractFunctionSource(scriptSource, functionName);
    const defaultSettingsSource = scriptSource.match(/const DEFAULT_BACKGROUND_SETTINGS = Object\.freeze\(\{[\s\S]*?\n\}\);/)?.[0] ?? '';
    return new Function(`${defaultSettingsSource};\n${functionSource}; return ${functionName};`)();
}

function loadBackgroundDomFunction(functionName, metadata, globalUrl) {
    const functionSource = extractFunctionSource(scriptSource, functionName);
    const calls = [];
    const $ = selector => ({
        css: (property, value) => calls.push([selector, property, value]),
    });
    const resolveActiveBackgroundUrl = loadPureFunction('resolveActiveBackgroundUrl');
    const fn = new Function('$', 'chat_metadata', 'background_settings', 'resolveActiveBackgroundUrl', `${functionSource}; return ${functionName};`)(
        $, metadata, { url: globalUrl }, resolveActiveBackgroundUrl,
    );
    return { fn, calls };
}

describe('active background settings', () => {
    test('normalizes and round-trips only the active background settings', () => {
        const normalizeBackgroundSettings = loadPureFunction('normalizeBackgroundSettings');
        const saved = {
            name: 'forest.jpg',
            url: 'url("backgrounds/forest.jpg")',
            fitting: 'contain',
            animation: true,
            sortOrder: 'z-a',
            thumbnailColumns: 8,
        };

        const loaded = normalizeBackgroundSettings(saved);

        expect(loaded).toEqual({
            name: saved.name,
            url: saved.url,
            fitting: saved.fitting,
            animation: saved.animation,
        });
        expect(normalizeBackgroundSettings(loaded)).toEqual(loaded);
    });

    test('falls back to a transparent classic background when old settings are incomplete', () => {
        const normalizeBackgroundSettings = loadPureFunction('normalizeBackgroundSettings');

        expect(normalizeBackgroundSettings({ name: 'old.jpg' })).toEqual({
            name: '__transparent.png',
            url: 'url("img/__transparent.png")',
            fitting: 'classic',
            animation: false,
        });
    });

    test('remaps the reserved transparent name to the bundled asset', () => {
        const normalizeBackgroundSettings = loadPureFunction('normalizeBackgroundSettings');
        // Settings persisted before the pixel was bundled still carry the
        // per-user backgrounds path — fresh installs would 404 on it.
        const stored = normalizeBackgroundSettings({
            name: '__transparent.png',
            url: 'url("backgrounds/__transparent.png")',
            fitting: 'cover',
            animation: true,
        });
        expect(stored.url).toBe('url("img/__transparent.png")');
        expect(stored.fitting).toBe('cover');
        expect(stored.animation).toBe(true);
        // Custom backgrounds keep their own URL untouched.
        expect(normalizeBackgroundSettings({
            name: 'forest.jpg',
            url: 'url("backgrounds/forest.jpg")',
        }).url).toBe('url("backgrounds/forest.jpg")');
    });

    test('remaps a legacy per-chat transparent background', () => {
        const resolveActiveBackgroundUrl = loadPureFunction('resolveActiveBackgroundUrl');
        const legacy = 'url("backgrounds/__transparent.png")';
        expect(resolveActiveBackgroundUrl({ custom_background: legacy }, 'url("backgrounds/global.jpg")'))
            .toBe('url("img/__transparent.png")');
        expect(resolveActiveBackgroundUrl({}, legacy)).toBe('url("img/__transparent.png")');
    });

    test('prefers chat metadata and falls back to the global background after a lock is removed', () => {
        const resolveActiveBackgroundUrl = loadPureFunction('resolveActiveBackgroundUrl');
        const globalUrl = 'url("backgrounds/global.jpg")';
        const metadata = {
            custom_background: 'url("custom/chat.jpg")',
            chat_backgrounds: ['custom/chat.jpg'],
        };

        expect(resolveActiveBackgroundUrl(metadata, globalUrl)).toBe(metadata.custom_background);
        const runtime = loadBackgroundDomFunction('applyActiveBackground', metadata, globalUrl);
        runtime.fn();
        expect(runtime.calls).toEqual([['#bg1', 'background-image', metadata.custom_background]]);

        delete metadata.custom_background;
        expect(resolveActiveBackgroundUrl(metadata, globalUrl)).toBe(globalUrl);
        runtime.fn();
        expect(runtime.calls.at(-1)).toEqual(['#bg1', 'background-image', globalUrl]);
        expect(metadata.chat_backgrounds).toEqual(['custom/chat.jpg']);
    });

    test('wires active settings into startup and the global settings payload without gallery fields', () => {
        expect(scriptSource).toContain('loadBackgroundSettings(settings);');
        expect(scriptSource).toContain('background: background_settings,');
        expect(scriptSource).toContain('eventSource.on(event_types.CHAT_CHANGED, applyActiveBackground);');
        expect(scriptSource).toContain('$(\'#bg1\').css(\'background-image\', resolveActiveBackgroundUrl(chat_metadata, background_settings.url));');
        expect(scriptSource).not.toContain('sortOrder:');
        expect(scriptSource).not.toContain('thumbnailColumns:');
    });

    test('restores Image Gallery translations', () => {
        const locale = JSON.parse(fs.readFileSync(path.join(repoRoot, 'public/locales/zh-cn.json'), 'utf8'));
        expect(locale['Show Gallery']).toBe('展示图库');
    });
});
