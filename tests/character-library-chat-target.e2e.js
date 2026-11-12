import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { testSetup } from './frontend/frontent-test-utils.js';

test.describe.configure({ mode: 'default' });
const avatar = 'dev-character-001.png';
const name = 'Dev Character 001';
const session = n => `${name} Session ${n}`;
const state = page => page.evaluate(() => {
    const c = window.SillyTavern.getContext();
    return { avatar: c.characters[c.characterId]?.avatar, target: c.characters[c.characterId]?.chat, messages: c.chat.map(m => m.mes) };
});
const open = (page, file) => page.evaluate(async file => {
    const app = await import('/script.js');
    await app.selectCharacterById(app.characters.findIndex(c => c.avatar === 'dev-character-001.png'));
    await app.openCharacterChat(file);
}, file);

for (const mode of ['automatic refresh', 'detail completion']) {
    test(`${mode} retains the loaded page chat and save destination across a second page switch`, async ({ page, context }, testInfo) => {
        test.setTimeout(60_000);
        // Detail proof isolates that replacement boundary from SSE publication.
        if (mode === 'detail completion') await page.route('**/api/characters/events', route => route.fulfill({ status: 204 }));
        await testSetup.awaitST({ page });
        await open(page, session('04'));
        const before = await state(page);
        expect(before.target).toBe(session('04'));
        const other = await context.newPage();
        try {
            await testSetup.awaitST({ page: other });
            await open(other, session('04'));
            const reads = [];
            page.on('response', r => { if (r.url().endsWith('/api/characters/all') && r.ok()) reads.push(r); });
            await page.evaluate(() => {
                window.__chatTargetPublished = false;
                const c = window.SillyTavern.getContext();
                c.eventSource.on(c.event_types.CHARACTER_PAGE_LOADED, () => { window.__chatTargetPublished = true; });
            });
            await open(other, session('03'));
            const otherState = await state(other);
            expect(otherState.target).toBe(session('03'));
            expect(otherState.messages).not.toEqual(before.messages);
            if (mode === 'automatic refresh') {
                await expect.poll(async () => {
                    for (const r of reads) {
                        const payload = await r.json();
                        if (Object.values(payload).some(c => c.avatar === avatar && c.chat === session('03'))) return true;
                    }
                    return false;
                }, { timeout: 12_000 }).toBe(true);
                await expect.poll(() => page.evaluate(() => window.__chatTargetPublished)).toBe(true);
            } else {
                await page.evaluate(async avatar => (await import('/script.js')).getOneCharacter(avatar), avatar);
            }
            const after = await state(page);
            const saves = [];
            page.on('request', r => { if (r.url().endsWith('/api/chats/save')) saves.push(r.postDataJSON()); });
            const marker = `local save ${mode}`;
            const saveResponse = page.waitForResponse(r => r.url().endsWith('/api/chats/save') && r.request().postData()?.includes(marker));
            await page.evaluate(async marker => {
                const app = await import('/script.js');
                app.chat[app.chat.length - 1].mes += `\n${marker}`;
                void app.saveChat();
            }, marker);
            const response = await saveResponse;
            await response.finished();
            const readDisk = n => {
                const db = new DatabaseSync(path.join(process.env.PLAYWRIGHT_DATA_ROOT, process.env.PLAYWRIGHT_USER ?? 'playwright-e2e', 'storage', 'emberdesk.sqlite'), { readOnly: true });
                try {
                    const row = db.prepare('SELECT source_jsonl FROM chat_sessions WHERE source_path LIKE ?').get(`%/${session(n)}.jsonl`);
                    return row.source_jsonl.trim().split('\n').map(JSON.parse);
                } finally { db.close(); }
            };
            const disk = {};
            for (const n of ['03', '04']) {
                disk[n] = await readDisk(n);
            }
            const proof = JSON.stringify({ mode, baseURL: testInfo.project.use.baseURL, dataRoot: process.env.PLAYWRIGHT_DATA_ROOT, before, otherState, after, saves, saveStatus: response.status(), disk }, null, 2);
            await writeFile(testInfo.outputPath('chat-target-proof.json'), proof);
            await testInfo.attach('chat-target-proof', { body: proof, contentType: 'application/json' });
            expect.soft(after).toEqual(before);
            expect.soft(saves.length).toBeGreaterThan(0);
            expect.soft([...new Set(saves.map(s => s.file_name))]).toEqual([session('04')]);
            expect.soft(response.ok()).toBe(true);
            expect.soft(disk['04'].at(-1).mes).toContain(marker);
            expect.soft(disk['03'].slice(1).map(m => m.mes)).toEqual(otherState.messages);
            // Explicit selection must still load and save the requested session.
            if (!response.ok()) return; // Preserve the real integrity dialog in red artifacts.
            await open(page, session('03'));
            expect((await state(page)).target).toBe(session('03'));
            expect((await state(page)).messages).toEqual(otherState.messages);
            await open(page, session('04'));
            expect((await state(page)).messages.at(-1)).toContain(marker);
        } finally { await other.close(); }
    });
}
