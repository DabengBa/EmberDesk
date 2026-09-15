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

function loadPowerUserFunction(functionName, powerUser) {
    const functionSource = extractFunctionSource(powerUserSource, functionName);
    const calls = [];
    const $ = selector => Object.fromEntries([
        ['hide', () => calls.push([selector, 'hide'])],
        ['show', () => calls.push([selector, 'show'])],
        ['addClass', value => calls.push([selector, 'addClass', value])],
        ['removeClass', value => calls.push([selector, 'removeClass', value])],
    ]);
    const fn = new Function('$', 'power_user', `${functionSource}; return ${functionName};`)($, powerUser);
    return { fn, calls };
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
            url: 'url("backgrounds/__transparent.png")',
            fitting: 'classic',
            animation: false,
        });
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

    test('restores ordinary spoiler initialization for saved true and false values', () => {
        const startupTail = powerUserSource.slice(powerUserSource.indexOf('await loadReasoningTemplates(data);'));
        expect(startupTail).toMatch(/await loadReasoningTemplates\(data\);[\s\S]*?switchSpoilerMode\(\);[\s\S]*?loadMovingUIState\(\);/);

        const enabled = loadPowerUserFunction('switchSpoilerMode', { spoiler_free_mode: true });
        enabled.fn();
        expect(enabled.calls).toEqual([
            ['#descriptionWrapper', 'hide'],
            ['#firstMessageWrapper', 'hide'],
            ['#spoiler_free_desc', 'addClass', 'flex1'],
            ['#creators_note_desc_hidden', 'show'],
        ]);

        const disabled = loadPowerUserFunction('switchSpoilerMode', { spoiler_free_mode: false });
        disabled.fn();
        expect(disabled.calls).toEqual([
            ['#descriptionWrapper', 'show'],
            ['#firstMessageWrapper', 'show'],
            ['#spoiler_free_desc', 'removeClass', 'flex1'],
            ['#creators_note_desc_hidden', 'hide'],
        ]);
    });

    test('restores Image Gallery translations', () => {
        const expectedTranslations = {
            'public/locales/fr-fr.json': 'Show Gallery',
            'public/locales/zh-cn.json': '展示图库',
            'public/locales/zh-tw.json': '檢視相簿',
        };
        for (const [relativePath, translation] of Object.entries(expectedTranslations)) {
            const locale = JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
            expect(locale['Show Gallery']).toBe(translation);
        }
    });
});
