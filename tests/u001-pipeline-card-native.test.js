import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/generation-service.js', import.meta.url), 'utf8');
const start = source.indexOf('removeCardView: index => {');
const end = source.indexOf('\n                    emitDeleted:', start);
const entry = source.slice(start, end);

test.each([true, false])('pipeline removes matching legacy rows through native root (wrapped=%s)', wrapped => {
    const rows = [{ remove: jest.fn() }, { remove: jest.fn() }];
    const root = { querySelectorAll: jest.fn(() => rows) };
    const state = { chatElement: wrapped ? { jquery: 'legacy', 0: root } : root };
    const mount = jest.fn();
    const ports = new Function('shell', 'isReactMainChatOwner', 'mountReactMainChatMessageListPanel', `return { ${entry} };`)(() => ({ state }), () => false, mount);
    ports.removeCardView(7);
    expect(root.querySelectorAll).toHaveBeenCalledWith('.mes[mesid="7"]');
    expect(rows[0].remove).toHaveBeenCalledTimes(1);
    expect(rows[1].remove).toHaveBeenCalledTimes(1);
    expect(mount).not.toHaveBeenCalled();
});

test('pipeline asks React to refresh without mutating its rows', () => {
    const mount = jest.fn();
    const ports = new Function('shell', 'isReactMainChatOwner', 'mountReactMainChatMessageListPanel', `return { ${entry} };`)(() => { throw Error('React owns the list'); }, () => true, mount);
    ports.removeCardView(7);
    expect(mount).toHaveBeenCalledTimes(1);
});
