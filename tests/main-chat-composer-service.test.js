import { describe, expect, jest, test, beforeEach, afterEach } from '@jest/globals';

class FakeTextareaElement {
    constructor(id) {
        this.id = id;
        this.value = '';
        this.dispatchedEvents = [];
        this.listeners = new Map();
    }

    dispatchEvent(event) {
        this.dispatchedEvents.push(event);
        const handler = documentListeners.get(event.type);
        if (handler) {
            handler({ target: this });
        }
        return true;
    }
}

const documentListeners = new Map();
let composerElement = null;

const fakeDocument = {
    addEventListener: jest.fn((type, handler) => documentListeners.set(type, handler)),
    removeEventListener: jest.fn((type) => documentListeners.delete(type)),
    getElementById: jest.fn((id) => (composerElement?.id === id ? composerElement : null)),
};

async function importFreshService() {
    return import(`../public/scripts/main-chat-composer-service.js?cacheBust=${Date.now()}-${Math.random()}`);
}

describe('main chat composer service', () => {
    beforeEach(() => {
        documentListeners.clear();
        composerElement = new FakeTextareaElement('send_textarea');
        globalThis.document = fakeDocument;
        globalThis.HTMLTextAreaElement = FakeTextareaElement;
    });

    afterEach(() => {
        delete globalThis.document;
        delete globalThis.HTMLTextAreaElement;
    });

    test('exposes empty value before any writes', async () => {
        const service = await importFreshService();
        expect(service.getComposerValue()).toBe('');
    });

    test('setComposerValue writes the element, dispatches input, and updates state', async () => {
        const service = await importFreshService();
        service.setComposerValue('hello world');
        expect(composerElement.value).toBe('hello world');
        expect(service.getComposerValue()).toBe('hello world');
        expect(composerElement.dispatchedEvents.some(event => event.type === 'input')).toBe(true);
    });

    test('typing syncs through the delegated input listener', async () => {
        const service = await importFreshService();
        service.getComposerValue();
        composerElement.value = 'typed text';
        composerElement.dispatchEvent(new Event('input', { bubbles: true }));
        expect(service.getComposerValue()).toBe('typed text');
    });

    test('clearComposerValue empties state and element', async () => {
        const service = await importFreshService();
        service.setComposerValue('draft');
        service.clearComposerValue();
        expect(service.getComposerValue()).toBe('');
        expect(composerElement.value).toBe('');
    });

    test('subscribers observe programmatic sets and typed input once each', async () => {
        const service = await importFreshService();
        const seen = [];
        const unsubscribe = service.subscribeComposerValue(value => seen.push(value));

        service.setComposerValue('first');
        composerElement.value = 'second';
        composerElement.dispatchEvent(new Event('input', { bubbles: true }));

        expect(seen).toEqual(['first', 'second']);

        unsubscribe();
        service.setComposerValue('third');
        expect(seen).toEqual(['first', 'second']);
    });

    test('setComposerValue tolerates a missing element and reconciles after mount', async () => {
        const service = await importFreshService();
        composerElement = null;
        service.setComposerValue('queued');

        composerElement = new FakeTextareaElement('send_textarea');
        service.initMainChatComposerService();
        expect(composerElement.value).toBe('queued');
        expect(service.getComposerValue()).toBe('queued');
    });

    test('non-composer input events are ignored', async () => {
        const service = await importFreshService();
        service.getComposerValue();
        const other = new FakeTextareaElement('other_input');
        other.value = 'noise';
        other.dispatchEvent(new Event('input', { bubbles: true }));
        expect(service.getComposerValue()).toBe('');
    });

    test('draft context stores and restores per-chat text', async () => {
        const service = await importFreshService();
        service.setComposerDraftContext('chat-a');
        service.setComposerValue('draft for a');

        service.setComposerDraftContext('chat-b');
        expect(service.getComposerValue()).toBe('');
        expect(composerElement.value).toBe('');

        service.setComposerValue('draft for b');
        service.setComposerDraftContext('chat-a');
        expect(service.getComposerValue()).toBe('draft for a');
        expect(composerElement.value).toBe('draft for a');

        service.setComposerDraftContext('chat-b');
        expect(service.getComposerValue()).toBe('draft for b');
    });

    test('first draft context call adopts the key without wiping typed text', async () => {
        const service = await importFreshService();
        service.setComposerValue('typed before chat');
        service.setComposerDraftContext('chat-a');
        expect(service.getComposerValue()).toBe('typed before chat');
    });

    test('re-entering the same draft context is a no-op', async () => {
        const service = await importFreshService();
        service.setComposerDraftContext('chat-a');
        service.setComposerValue('keep me');
        service.setComposerDraftContext('chat-a');
        expect(service.getComposerValue()).toBe('keep me');
    });

    test('renameComposerDraftContext moves the stash and live key to the new name', async () => {
        const service = await importFreshService();
        service.setComposerDraftContext('chat-a');
        service.setComposerValue('draft for a');
        service.setComposerDraftContext('chat-b');
        service.setComposerValue('draft for b');

        service.renameComposerDraftContext('chat-a.jsonl', 'chat-a-renamed.jsonl');
        service.renameComposerDraftContext('chat-b.jsonl', 'chat-b-renamed.jsonl');
        expect(service.getComposerValue()).toBe('draft for b');

        service.setComposerDraftContext('chat-a-renamed');
        expect(service.getComposerValue()).toBe('draft for a');

        service.setComposerDraftContext('chat-b-renamed');
        expect(service.getComposerValue()).toBe('draft for b');
    });
});
