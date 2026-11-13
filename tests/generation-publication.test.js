import { jest } from '@jest/globals';
import { publishQuietToLoud } from '../public/scripts/generation-publication.js';
import { loadTsModule } from './helpers/load-ts-module.mjs';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function fixture() {
    const chat = [];
    let current = chat;
    let owned = true;
    const ports = {
        reply: 'answer', ownsRun: () => owned, getChat: () => current,
        transform: jest.fn(async text => text), createMessage: jest.fn(text => ({ mes: text })),
        markTainted: jest.fn(), emitSent: jest.fn(async () => {}), render: jest.fn(),
        emitRendered: jest.fn(async () => {}), save: jest.fn(async () => {}),
    };
    return { chat, ports, stop: () => { owned = false; }, switchChat: () => { current = []; }, current: () => current };
}

test('chat switch while transforming quiet output never publishes into the new chat', async () => {
    const f = fixture();
    const wait = deferred();
    f.ports.transform.mockReturnValueOnce(wait.promise);
    const pending = publishQuietToLoud(f.ports);
    f.switchChat();
    wait.resolve('answer');
    await pending;
    expect(f.current()).toEqual([]);
    expect(f.ports.markTainted).not.toHaveBeenCalled();
    expect(f.ports.emitSent).not.toHaveBeenCalled();
});

test('stop during sent event prevents render and save', async () => {
    const f = fixture();
    const wait = deferred();
    f.ports.emitSent.mockReturnValueOnce(wait.promise);
    const pending = publishQuietToLoud(f.ports);
    await new Promise(resolve => setImmediate(resolve));
    f.stop();
    wait.resolve();
    await pending;
    expect(f.ports.render).not.toHaveBeenCalled();
    expect(f.ports.emitRendered).not.toHaveBeenCalled();
    expect(f.ports.save).not.toHaveBeenCalled();
});

test('queued save receives a live ownership predicate', async () => {
    const f = fixture();
    const wait = deferred();
    let didSave = false;
    f.ports.save.mockImplementationOnce(async predicate => { await wait.promise; didSave = predicate(); });
    const pending = publishQuietToLoud(f.ports);
    await new Promise(resolve => setImmediate(resolve));
    f.stop();
    wait.resolve();
    await pending;
    expect(didSave).toBe(false);
});

test('owned quiet output publishes in order', async () => {
    const f = fixture();
    await publishQuietToLoud(f.ports);
    expect(f.chat).toEqual([{ mes: 'answer' }]);
    expect(f.ports.emitSent).toHaveBeenCalledWith(0);
    expect(f.ports.render).toHaveBeenCalledWith(f.chat[0]);
    expect(f.ports.emitRendered).toHaveBeenCalledWith(0);
    expect(f.ports.save).toHaveBeenCalledTimes(1);
});

test('completion runs inside the real typed lifecycle lease, not after release', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const chat = [];
    const stable = createGenerationLifecycleService(() => ({ chatId: 'a', chatReference: chat, contextRevision: 0 }));
    const seen = [];
    await stable.run({ foreground: true, execute: async () => 'reply',
        onComplete: async (result, ownsRun) => { seen.push(result, ownsRun()); },
    });
    expect(seen).toEqual(['reply', true]);
});

test('completion is suppressed if ownership is lost before quiet generation returns', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    let chat = [];
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', chatReference: chat, contextRevision: 0 }));
    const wait = deferred();
    const onComplete = jest.fn();
    const pending = lifecycle.run({ foreground: true, execute: () => wait.promise, onComplete });
    chat = [];
    wait.resolve('reply');
    await pending;
    expect(onComplete).not.toHaveBeenCalled();
});

test('typed lifecycle retains foreground admission until asynchronous publication ends', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const chat = [];
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', chatReference: chat, contextRevision: 0 }));
    const wait = deferred();
    const entered = deferred();
    const first = lifecycle.run({ foreground: true, execute: async () => 'reply', onComplete: async () => { entered.resolve(); await wait.promise; } });
    await entered.promise;
    const duplicate = jest.fn();
    expect(await lifecycle.run({ foreground: true, execute: duplicate })).toBeUndefined();
    expect(duplicate).not.toHaveBeenCalled();
    wait.resolve();
    expect(await first).toBe('reply');
    expect(await lifecycle.run({ foreground: true, execute: async () => 'next' })).toBe('next');
});

test('publication failure releases typed lifecycle admission', async () => {
    const { createGenerationLifecycleService } = await loadTsModule('app/lib/generation/attempt-executor.ts');
    const lifecycle = createGenerationLifecycleService(() => ({ chatId: 'a', contextRevision: 0 }));
    await expect(lifecycle.run({ foreground: true, execute: async () => 'reply', onComplete: async () => { throw new Error('publication failed'); } })).rejects.toThrow('publication failed');
    expect(await lifecycle.run({ foreground: true, execute: async () => 'next' })).toBe('next');
});
