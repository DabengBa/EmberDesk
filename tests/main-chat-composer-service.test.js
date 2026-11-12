import { describe, expect, test } from '@jest/globals';

async function importFreshService() {
    return import(`../public/scripts/main-chat-composer-service.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('main chat composer service', () => {
    test('operates without a DOM and keeps a stable snapshot until state changes', async () => {
        const service = await importFreshService();

        const initial = service.getComposerSnapshot();
        expect(initial).toEqual({
            value: '', contextKey: null, revision: 0, contextRevision: 0,
            selectionStart: 0, selectionEnd: 0, selectionDirection: 'none',
            focused: false, composing: false, focusRequest: 0,
        });
        expect(service.getComposerSnapshot()).toBe(initial);
        expect(service.setComposerValue('hello')).toBe(true);
        expect(service.getComposerValue()).toBe('hello');
        expect(service.getComposerSnapshot()).not.toBe(initial);
        expect(service.getComposerSnapshot()).toMatchObject({ value: 'hello', revision: 1, selectionStart: 5, selectionEnd: 5 });
    });

    test('chat identity changes only on actual context changes or active rename', async () => {
        const service = await importFreshService();
        service.setComposerDraftContext('a');
        const start = service.getComposerSnapshot().contextRevision;
        service.setComposerValue('typed');
        service.updateComposerInteraction({ focused: true });
        service.setComposerDraftContext('a');
        expect(service.getComposerSnapshot().contextRevision).toBe(start);
        service.renameComposerDraftContext('other', 'renamed');
        expect(service.getComposerSnapshot().contextRevision).toBe(start);
        service.setComposerDraftContext('b');
        service.setComposerDraftContext('a');
        expect(service.getComposerSnapshot().contextRevision).toBe(start + 2);
        service.renameComposerDraftContext('a.jsonl', 'renamed-a.jsonl');
        expect(service.getComposerSnapshot().contextRevision).toBe(start + 3);
    });

    test('state and value subscriptions report their own changes and unsubscribe', async () => {
        const service = await importFreshService();
        const states = [];
        const values = [];
        const unsubscribeState = service.subscribeComposerState(() => states.push(service.getComposerSnapshot()));
        const unsubscribeValue = service.subscribeComposerValue(value => values.push(value));
        service.setComposerValue('hello');
        service.updateComposerInteraction({ selectionStart: 1, selectionEnd: 4, selectionDirection: 'backward', focused: true, composing: true });
        expect(states).toHaveLength(2);
        expect(values).toEqual(['hello']);
        expect(service.getComposerSnapshot()).toMatchObject({ revision: 1, selectionStart: 1, selectionEnd: 4, selectionDirection: 'backward', focused: true, composing: true });
        const beforeNoop = service.getComposerSnapshot();
        service.updateComposerInteraction({ focused: true });
        expect(service.getComposerSnapshot()).toBe(beforeNoop);
        expect(states).toHaveLength(2);
        unsubscribeState();
        unsubscribeValue();
        service.setComposerValue('next');
        expect(states).toHaveLength(2);
        expect(values).toEqual(['hello']);
    });

    test('clamps selection, supports explicit selection, and counts focus requests without text revisions', async () => {
        const service = await importFreshService();
        service.setComposerValue('hello', { selectionStart: 1, selectionEnd: 3, selectionDirection: 'forward' });
        expect(service.getComposerSnapshot()).toMatchObject({ selectionStart: 1, selectionEnd: 3, selectionDirection: 'forward' });
        service.updateComposerInteraction({ selectionStart: -2, selectionEnd: 100, composing: true });
        expect(service.getComposerSnapshot()).toMatchObject({ selectionStart: 0, selectionEnd: 5, composing: true, revision: 1 });
        service.requestComposerFocus();
        service.requestComposerFocus();
        expect(service.getComposerSnapshot()).toMatchObject({ focusRequest: 2, revision: 1 });
        service.setComposerValue('x');
        expect(service.getComposerSnapshot()).toMatchObject({ selectionStart: 1, selectionEnd: 1, selectionDirection: 'none', revision: 2 });
    });

    test('adopts the first context without wiping text, and restores drafts on switching', async () => {
        const service = await importFreshService();
        service.setComposerValue('before context');
        const beforeAdoption = service.getComposerSnapshot();
        service.setComposerDraftContext('chat-a');
        expect(service.getComposerSnapshot()).toMatchObject({ value: 'before context', contextKey: 'chat-a', revision: beforeAdoption.revision + 1 });
        expect(service.clearComposerValue({ expected: beforeAdoption })).toBe(false);
        const beforeSameContext = service.getComposerSnapshot();
        service.setComposerDraftContext('chat-a');
        expect(service.getComposerSnapshot()).toBe(beforeSameContext);
        service.setComposerDraftContext('chat-b');
        expect(service.getComposerValue()).toBe('');
        service.setComposerValue('draft b');
        service.setComposerDraftContext('chat-a');
        expect(service.getComposerValue()).toBe('before context');
        service.setComposerDraftContext('chat-b');
        expect(service.getComposerValue()).toBe('draft b');
    });

    test('rejects conditional set and clear after a later edit or switching away and back', async () => {
        const service = await importFreshService();
        service.setComposerDraftContext('chat-a');
        service.setComposerValue('first');
        const first = service.getComposerSnapshot();
        service.setComposerValue('later');
        expect(service.setComposerValue('stale', { expected: first })).toBe(false);
        expect(service.clearComposerValue({ expected: first })).toBe(false);
        expect(service.getComposerValue()).toBe('later');
        const beforeSwitch = service.getComposerSnapshot();
        service.setComposerDraftContext('chat-b');
        service.setComposerDraftContext('chat-a');
        expect(service.clearComposerValue({ expected: beforeSwitch })).toBe(false);
        expect(service.getComposerValue()).toBe('later');
        expect(service.clearComposerValue({ expected: service.getComposerSnapshot() })).toBe(true);
        expect(service.getComposerValue()).toBe('');
    });

    test('interaction changes preserve the expected revision and do not notify value subscribers', async () => {
        const service = await importFreshService();
        const values = [];
        service.subscribeComposerValue(value => values.push(value));
        service.setComposerValue('first');
        const expected = service.getComposerSnapshot();
        service.updateComposerInteraction({ selectionStart: 1, selectionEnd: 2, focused: true, composing: true });
        expect(service.setComposerValue('second', { expected })).toBe(true);
        expect(values).toEqual(['first', 'second']);
    });

    test('renaming migrates saved and active drafts and invalidates old snapshots', async () => {
        const service = await importFreshService();
        service.setComposerDraftContext('chat-a');
        service.setComposerValue('draft a');
        service.setComposerDraftContext('chat-b');
        service.setComposerValue('draft b');
        const beforeRename = service.getComposerSnapshot();
        service.renameComposerDraftContext('chat-b.jsonl', 'chat-b-renamed.jsonl');
        expect(service.getComposerSnapshot()).toMatchObject({ contextKey: 'chat-b-renamed', value: 'draft b', revision: beforeRename.revision + 1 });
        expect(service.setComposerValue('stale', { expected: beforeRename })).toBe(false);
        service.renameComposerDraftContext('chat-a.jsonl', 'chat-a-renamed.jsonl');
        service.setComposerDraftContext('chat-a-renamed');
        expect(service.getComposerValue()).toBe('draft a');
        service.setComposerDraftContext('chat-b-renamed');
        expect(service.getComposerValue()).toBe('draft b');
    });
});
