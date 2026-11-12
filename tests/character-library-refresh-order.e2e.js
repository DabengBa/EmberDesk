import { isolatedCharacterLibraryTest, expect } from './helpers/isolated-character-library-test.js';
import { testSetup } from './frontend/frontent-test-utils.js';

const test = isolatedCharacterLibraryTest({ lazy: false });

test('overlapping refreshes cannot publish an older snapshot after a newer one', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first().click();
    const result = await page.evaluate(async () => {
        const app = await import('/script.js');
        const characters = window.SillyTavern.getContext().characters;
        const originalFetch = window.fetch;
        const state = structuredClone(characters);
        state[0].name = 'U009 old snapshot';
        let releaseA;
        let signalA;
        const startedA = new Promise(resolve => { signalA = resolve; });
        let requests = 0;
        const events = [];
        window.fetch = (input, init) => {
            if (input !== '/api/characters/all') return originalFetch(input, init);
            const snapshot = structuredClone(state);
            requests++;
            events.push(`read-${requests}`);
            if (requests === 1) {
                signalA();
                return new Promise(resolve => { releaseA = () => resolve(new Response(JSON.stringify(snapshot))); });
            }
            return Promise.resolve(new Response(JSON.stringify(snapshot)));
        };
        try {
            const a = app.getCharacters().then(() => events.push('done-a'));
            await startedA;
            // Simulate a completed write after A's snapshot and before B's call.
            state[0].name = 'U009 new snapshot';
            let bDone = false;
            let nameAtBReturn;
            const b = app.getCharacters().then(() => { bDone = true; nameAtBReturn = characters[0].name; events.push('done-b'); });
            await Promise.race([b, new Promise(resolve => setTimeout(resolve, 500))]);
            const bCompletedBeforeRelease = bDone;
            releaseA();
            await Promise.all([a, b]);
            return { name: characters[0].name, nameAtBReturn, requests, bCompletedBeforeRelease, events };
        } finally {
            window.fetch = originalFetch;
        }
    });
    expect(result.name, JSON.stringify(result)).toBe('U009 new snapshot');
    expect(result.nameAtBReturn).toBe('U009 new snapshot');
    expect(result.requests).toBe(2);
    expect(result.bCompletedBeforeRelease).toBe(false);
    expect(result.events.indexOf('read-2')).toBeGreaterThan(result.events.indexOf('done-a'));
});

test('a failed refresh does not poison the queued refresh', async ({ page }) => {
    await testSetup.awaitST({ page });
    const result = await page.evaluate(async () => {
        const app = await import('/script.js');
        const characters = window.SillyTavern.getContext().characters;
        const originalFetch = window.fetch;
        const snapshot = structuredClone(characters);
        snapshot[0].name = 'U009 recovered';
        let release;
        let signal;
        const started = new Promise(resolve => { signal = resolve; });
        let count = 0;
        window.fetch = (input, init) => {
            if (input !== '/api/characters/all') return originalFetch(input, init);
            if (++count === 1) {
                signal();
                return new Promise(resolve => { release = () => resolve(new Response('{}', { status: 503 })); });
            }
            return Promise.resolve(new Response(JSON.stringify(snapshot)));
        };
        try {
            const reference = characters;
            const before = characters[0].name;
            const first = app.getCharacters();
            await started;
            const second = app.getCharacters();
            release();
            await first;
            const retainedAfterFailure = characters[0].name === before;
            await second;
            return { retainedAfterFailure, name: characters[0].name, count, same: reference === window.SillyTavern.getContext().characters };
        } finally {
            window.fetch = originalFetch;
        }
    });
    expect(result).toEqual({ retainedAfterFailure: true, name: 'U009 recovered', count: 2, same: true });
});

test('publication waits for the real page-loaded event before the next read', async ({ page }) => {
    await testSetup.awaitST({ page });
    await page.locator('[data-react-workspace-shell-chrome] nav button').filter({ hasText: '角色库' }).first().click();
    const result = await page.evaluate(async () => {
        const app = await import('/script.js');
        const { eventSource, event_types } = await import('/scripts/events.js');
        const characters = window.SillyTavern.getContext().characters;
        const originalFetch = window.fetch;
        const original = structuredClone(characters);
        let count = 0;
        let release;
        let signal;
        const entered = new Promise(resolve => { signal = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        let eventCount = 0;
        const listener = async () => {
            if (++eventCount === 1) {
                signal();
                await gate;
            }
        };
        eventSource.on(event_types.CHARACTER_PAGE_LOADED, listener);
        window.fetch = (input, init) => {
            if (input !== '/api/characters/all') return originalFetch(input, init);
            const snapshot = structuredClone(original);
            snapshot[0].name = `U009 event ${++count}`;
            return Promise.resolve(new Response(JSON.stringify(snapshot)));
        };
        try {
            const first = app.getCharacters();
            await entered;
            const second = app.getCharacters();
            await new Promise(resolve => setTimeout(resolve, 300));
            const countWhileEventBlocked = count;
            release();
            await Promise.all([first, second]);
            return { countWhileEventBlocked, count, eventCount, name: characters[0].name };
        } finally {
            release();
            eventSource.removeListener(event_types.CHARACTER_PAGE_LOADED, listener);
            window.fetch = originalFetch;
        }
    });
    expect(result).toEqual({ countWhileEventBlocked: 1, count: 2, eventCount: 2, name: 'U009 event 2' });
});
