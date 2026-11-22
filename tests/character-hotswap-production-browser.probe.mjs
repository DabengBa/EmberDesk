// Standalone focused browser check. No application server, build, or data writes.
// node tests/character-hotswap-production-browser.probe.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function functionSource(source, marker) {
    const start = source.indexOf(marker);
    const end = source.indexOf('\n}\n', start);
    assert(start >= 0 && end > start, marker);
    return source.slice(start, end + 2).replace(/^export /, '');
}
const script = read('public/script.js');
const ross = read('public/scripts/RossAscends-mods.js');

const bulk = read('public/scripts/bulk-edit.js');
const utils = read('public/scripts/utils.js');
const workspaceHost = read('app/components/workspace/WorkspaceHost.tsx');
const avatarTemplate = workspaceHost.match(/<div id="inline_avatar_template"[\s\S]*?<\/div>\s*<\/div>/)?.[0]
    .replaceAll('className=', 'class=')
    .replace(/(<img [^>]*?)\s*\/>/g, '$1>');
assert(avatarTemplate);

const build = functionSource(script, 'export function buildAvatarList(');
const render = functionSource(ross, 'export async function favsToHotswap(');
const guard = functionSource(bulk, 'function guardBulkCheckboxClick(');
const debounce = functionSource(utils, 'export function debounce(');
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setContent(`<div id="right-nav-panel"><div class="hotswap"></div><div id="rm_print_characters_block"><button class="bogus_folder_select">folder</button></div></div>${avatarTemplate}`);
    await page.addScriptTag({ content: `
        window.events = [];
        const INTERACTABLE_CONTROL_CLASS = 'interactable';
        const default_avatar = 'none.png';
        const getThumbnailUrl = (_type, file) => file;
        const getEntitiesList = () => [{ type:'character', id:7, item:{ name:'A', avatar:'a.png', fav:true } }];
        ${build}
        ${render}
        const debounceMap = new WeakMap(); const debounce_timeout = { standard: 300 };
        ${debounce}
        let active; let resolveSelection;
        const pending = new Promise(resolve => { resolveSelection = resolve; });
        async function selectCharacterById(id) { events.push('select:' + id); await pending; events.push('resolved'); }
        function setActiveCharacter(id) { active = id; events.push('active:' + id); }
        const saveLater = debounce(async () => { events.push('save:' + active); }, 1000);
        function saveSettingsDebounced() { events.push('schedule'); saveLater(); }

        ${guard}
        window.enableGuard = () => document.addEventListener('click', guardBulkCheckboxClick);
        document.addEventListener('click', () => events.push('after-guard'));
        window.finishSelection = () => resolveSelection();
        window.renderHotswap = favsToHotswap;
    ` });
    assert.deepEqual(pageErrors, [], 'production hotswap registration must not use jQuery');
    await page.evaluate(() => window.renderHotswap());
    assert.equal(await page.locator('.hotswap .character_select').count(), 1);
    assert.equal(await page.locator('.bogus_folder_select .character_select').count(), 0);
    await page.locator('.hotswap .character_select img').click();
    await page.locator('.hotswap .character_select').evaluate(el => { el.setAttribute('data-chid', '8'); });
    await page.locator('.hotswap .character_select img').click();
    await page.waitForFunction(() => window.events.includes('save:8'));
    const events = await page.evaluate(() => [...window.events]);
    assert.deepEqual(events, ['select:7', 'active:7', 'schedule', 'after-guard', 'select:8', 'active:8', 'schedule', 'after-guard', 'save:8']);
    await page.evaluate(() => { window.events.length = 0; window.enableGuard(); });
    await page.locator('.hotswap .character_select img').evaluate(el => el.classList.add('bulk_select_checkbox'));
    // Guard was added after the first observer above. Add another observer after guard.
    await page.evaluate(() => document.addEventListener('click', () => window.events.push('after-bulk-guard')));
    await page.locator('.hotswap .character_select img').click();
    await page.waitForFunction(() => window.events.includes('save:8'));
    const bulkEvents = await page.evaluate(() => [...window.events]);
    assert.deepEqual(bulkEvents, ['select:8', 'active:8', 'schedule', 'after-guard', 'save:8']);
    await page.evaluate(() => window.finishSelection());
    console.log(JSON.stringify({ events, bulkEvents, note: 'actual renderer/handlers and debounce; selection and persistence are controlled' }));
} finally { await browser.close(); }
