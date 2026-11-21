import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/message-service.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('export function updateMessageBlock('), source.indexOf('/**\n * Ensures that the message media properties are arrays')).replace('export ', '');

test.each([true, false])('message block refresh updates the model and schedules React with rerenderMessage=%s', rerenderMessage => {
    const state = { chat: [{}], get chatElement() { throw Error('React owns the list'); } };
    const mount = jest.fn();
    const update = new Function('state', 'mountReactMainChatMessageListPanel', `${code}; return updateMessageBlock;`)(state, mount);
    const message = { mes: 'original', name: 'A', extra: { display_text: 'display', reasoning: 'thinking', media: [{ type: 'image', url: '/files/image.png' }] } };
    update(0, message, { rerenderMessage });
    expect(state.chat[0]).toBe(message);
    expect(state.chat[0].extra).toEqual(message.extra);
    expect(mount).toHaveBeenCalledTimes(1);
    update(0, message, { rerenderMessage });
    expect(mount).toHaveBeenCalledTimes(2);
});
