import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'public/index.html'), 'utf8');
const popupTemplate = indexHtml.match(/<template id="popup_template"[\s\S]*?<\/template>/)[0];
const pastChatTemplate = indexHtml.slice(indexHtml.indexOf('<div id="past_chat_template"'), indexHtml.indexOf('<div id="tag_view_template"'));
const historyShell = indexHtml.slice(indexHtml.indexOf('<dialog id="shadow_select_chat_popup"'), indexHtml.indexOf('<!-- templates for JS to reuse'));
const backup = { file_name: 'Chat backup 2026-10-12.jsonl', last_mes: '2026-10-12', file_size: '80 KB', chat_items: 84 };

async function mountSurfaces(page) {
    await page.route('**/csrf-token', route => route.fulfill({ json: { token: 'test-token' } }));
    await page.route('**/api/**', route => route.fulfill({ status: 418, json: { error: 'Unmocked API operation' } }));
    await page.route('**/api/backups/chat/get', route => route.fulfill({ json: [backup] }));
    await page.route('**/api/backups/chat/download', route => route.fulfill({ body: JSON.stringify({ name: 'Assistant', send_date: '2026-10-12', mes: 'Backup preview.' }) }));
    await page.route('**/scripts/i18n.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const t=(parts,...values)=>typeof parts==="string"?parts:parts.reduce((text,part,index)=>text+part+(values[index]??""),"");' }));
    await page.route('**/scripts/RossAscends-mods.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const shouldSendOnEnter=()=>true; export const isMobile=()=>false;' }));
    await page.route('**/scripts/power-user.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const toastPositionClasses=[];' }));
    await page.route('**/scripts/utils.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        export const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
        export const uuidv4=()=>crypto.randomUUID();
        export const removeFromArray=(array,value)=>array.splice(array.indexOf(value),1);
        export const runAfterAnimation=(element,callback)=>queueMicrotask(callback);
        export const copyText=async text=>{window.copiedSwipe=text;};
        export const addLongPressEvent=()=>{};
        export const timestampToMoment=()=>({format:()=>''});
    ` }));
    await page.route('**/scripts/tokenizers.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const getTokenCountAsync=async()=>10;' }));
    await page.route('**/scripts/chat-branch.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const branchChat=async()=>{};' }));
    await page.route('**/script.js', route => route.fulfill({ contentType: 'text/javascript', body: `
        export const chat=[{swipes:['First candidate','Second candidate'],swipe_id:0,is_user:false}];
        export const ensureSwipes=()=>false;
        export const syncMesToSwipe=()=>{};
        export const isSwipingAllowed=()=>true;
        export const isMessageSwipeable=()=>true;
        export const swipe=async()=>{};
        export const deleteSwipe=async()=>0;
    ` }));
    await page.route('**/chat-ui-test', route => route.fulfill({ contentType: 'text/html', body: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="stylesheet" href="/webfonts/NotoSans/stylesheet.css">
        <link rel="stylesheet" href="/css/fontawesome.min.css"><link rel="stylesheet" href="/css/solid.min.css">
        <link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/css/st-tailwind.css"><link rel="stylesheet" href="/css/mobile-styles.css">
        <link rel="stylesheet" href="/react/login/assets/workspace-panels.css">
        </head><body class="no-blur noShadows"><button id="background-action">Background action</button>
        ${popupTemplate}${pastChatTemplate}${historyShell}<div id="send_form"></div><div id="options" style="display:none"></div>
        <div id="chat"><div class="mes" mesid="0"><button class="mes_swipe_picker">Choose candidate</button></div></div>
        <script src="/lib/jquery-3.5.1.min.js"></script></body></html>` }));
    await page.goto('/chat-ui-test');
    await page.evaluate(async () => {
        window.toastr = { options: {}, info() {}, warning() {}, error() {}, success() {} };
        const module = await import('/react/login/assets/workspace-panels.js');
        module.mountSelectChatPopup(document.getElementById('select_chat_popup'));
        module.mountSelectChatList(document.getElementById('select_chat_div'), {}, {
            currentChat: 'Current chat', avatarImg: '/img/ai4.png', searchQuery: '',
            items: ['Current chat', 'VeryLongChatFilename'.repeat(10)].map(fileName => ({ fileName, fileSize: '80 KB', messageCount: 84, preview: 'Chat preview.', dateLabel: 'Oct 12, 2026, 1:00 AM' })),
        });
        const buttonContainer = document.createElement('span');
        const listContainer = document.createElement('div');
        document.getElementById('select_chat_search').before(buttonContainer);
        document.getElementById('select_chat_div').before(listContainer);
        module.mountChatBackupsBrowser({ buttonContainer, listContainer, commands: {
            restoreChatBackup: async () => {
                window.restoreCalls = (window.restoreCalls ?? 0) + 1;
                return new Promise(resolve => { window.completeRestore = () => resolve(['Restored chat']); });
            },
        } });
        module.mountOptionsMenu(document.getElementById('options'));
        module.mountChatComposer(document.getElementById('send_form'));
        (await import('/scripts/keyboard.js')).initKeyboard();
        const shell = document.getElementById('shadow_select_chat_popup');
        if (shell instanceof HTMLDialogElement) shell.showModal();
        else shell.style.display = 'block';
    });
}

test.beforeEach(async ({ page }) => mountSurfaces(page));

test('backup preview is named, modal, keyboard-contained and restores focus', async ({ page }) => {
    await page.locator('[data-chat-backups-toggle]').click();
    const trigger = page.getByRole('button', { name: 'View backup' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: backup.file_name });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true);
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.locator('#background-action').evaluate(element => element.focus());
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
});

test('backup deletion returns focus to the browser when its trigger is removed', async ({ page }) => {
    await page.route('**/api/backups/chat/delete', route => route.fulfill({ json: {} }));
    const toggle = page.locator('[data-chat-backups-toggle]');
    await toggle.click();
    await page.getByRole('button', { name: 'Delete backup' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete backup?' });
    await dialog.getByRole('button', { name: 'Delete backup' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(toggle).toBeFocused();
});

test('backup loading failure has retry and an explicit empty state', async ({ page }) => {
    await page.route('**/api/backups/chat/get', route => route.fulfill({ status: 500, json: { error: 'failure' } }));
    await page.locator('[data-chat-backups-toggle]').click();
    await expect(page.getByRole('alert')).toContainText('Could not load chat backups');
    await page.route('**/api/backups/chat/get', route => route.fulfill({ json: [] }));
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('[data-chat-backups-list]').getByRole('status')).toContainText('No chat backups yet');
});

test('restore is busy and cannot be submitted twice', async ({ page }) => {
    await page.locator('[data-chat-backups-toggle]').click();
    const restore = page.getByRole('button', { name: 'Restore backup' });
    await restore.click();
    await expect(restore).toBeDisabled();
    await expect(page.locator('[data-chat-backups-list]').getByRole('status')).toContainText('Restoring backup');
    await restore.evaluate(element => element.click());
    expect(await page.evaluate(() => window.restoreCalls)).toBe(1);
    await page.evaluate(() => window.completeRestore());
    await expect(restore).toBeEnabled();
});

test('backup deletion identifies the file and preserves failed confirmation', async ({ page }) => {
    await page.route('**/api/backups/chat/delete', route => route.fulfill({ status: 500, json: { error: 'failure' } }));
    await page.locator('[data-chat-backups-toggle]').click();
    await page.getByRole('button', { name: 'Delete backup' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete backup?' });
    await expect(dialog).toContainText(backup.file_name);
    await dialog.getByRole('button', { name: 'Delete backup' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Could not delete');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete backup' })).toBeEnabled();
});

for (const width of [1440, 390]) {
    test(`history and options remain legible and reachable at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByRole('dialog', { name: /Chat History/ })).toBeVisible();
        await expect(page.getByRole('searchbox', { name: 'Search chats' })).toBeVisible();
        expect(await page.locator('#select_chat_popup').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        await expect(page.locator('[id="select_chat_name_wrapper"]')).toHaveCount(0);
        for (const button of await page.getByRole('button', { name: 'Delete chat file' }).all()) {
            const box = await button.boundingBox();
            expect(box.x + box.width).toBeLessThanOrEqual(width);
            expect(box.width).toBeGreaterThanOrEqual(width === 390 ? 44 : 32);
        }
        await page.screenshot({ path: testInfo.outputPath(`chat-history-${width}.png`) });
        await page.evaluate(() => {
            const shell = document.getElementById('shadow_select_chat_popup');
            if (shell instanceof HTMLDialogElement) shell.close();
            else shell.style.display = 'none';
            document.getElementById('options').style.display = 'block';
        });
        const items = page.locator('#options button:visible');
        const positions = await items.evaluateAll(elements => elements.map(element => {
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, opacity: getComputedStyle(element).opacity, alignment: getComputedStyle(element).justifyContent };
        }));
        expect(positions.every(item => item.opacity === '1')).toBe(true);
        expect(positions.every(item => item.alignment === 'flex-start')).toBe(true);
        expect(positions.every(item => item.x === positions[0].x)).toBe(true);
        expect(positions.every((item, index) => index === 0 || item.y > positions[index - 1].y)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`chat-options-${width}.png`) });
    });
}

test('candidate copy and expansion are keyboard buttons', async ({ page }) => {
    await page.evaluate(async () => {
        const shell = document.getElementById('shadow_select_chat_popup');
        if (shell instanceof HTMLDialogElement) shell.close();
        else shell.style.display = 'none';
        (await import('/scripts/swipe-picker.js')).initSwipePicker();
    });
    await page.getByRole('button', { name: 'Choose candidate' }).click();
    const dialog = page.getByRole('dialog', { name: 'Swipe Selection' });
    const copy = dialog.getByRole('button', { name: 'Copy' }).first();
    await copy.focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => window.copiedSwipe)).toBe('First candidate');
    const expand = dialog.getByRole('button', { name: 'Expand/Collapse' }).first();
    await expand.focus();
    await page.keyboard.press('Space');
    await expect(expand).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog.getByRole('button', { name: 'Delete Swipe' }).first()).toBeVisible();
});

test('generic rename input and actions expose native accessible controls', async ({ page }) => {
    await page.evaluate(async () => {
        const { Popup, POPUP_TYPE } = await import('/scripts/popup.js');
        const content = await fetch('/scripts/templates/chatRename.html').then(response => response.text());
        void new Popup(content, POPUP_TYPE.INPUT, 'Current chat').show();
    });
    const dialog = page.getByRole('dialog', { name: 'Enter the new name for the chat:' });
    await expect(dialog.getByRole('textbox', { name: 'Enter the new name for the chat:' })).toHaveValue('Current chat');
    expect(await dialog.getByRole('button', { name: 'Save', exact: true }).evaluate(element => element.tagName)).toBe('BUTTON');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
});
