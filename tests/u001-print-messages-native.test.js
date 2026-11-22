import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/chat-ops-service.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('export async function printMessages()'), source.indexOf('/**\n * Visually removes all chat message elements.')).replace('export ', '');

test.each([true, false])('print projects chat and respects queued scroll restoration (%s)', async restore => {
    const state = { mainChatMessageUiState: new Map([[1, {}]]), reactMainChatProjectionCleared: true };
    const mount = jest.fn(), scroll = jest.fn();
    const env = { state, hasMainChatMessageListScrollRestore: () => restore, mountReactMainChatMessageListPanel: mount, scrollChatToBottom: scroll };
    const print = new Function(...Object.keys(env), code + '; return printMessages;')(...Object.values(env));
    await print();
    expect(state.mainChatMessageUiState.size).toBe(0);
    expect(state.reactMainChatProjectionCleared).toBe(false);
    expect(mount).toHaveBeenCalledTimes(1);
    if (restore) expect(scroll).not.toHaveBeenCalled();
    else expect(scroll).toHaveBeenCalledWith({ waitForFrame: true });
});
