import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/message-service.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('export function appendMediaToMessage('), source.indexOf('export function addCopyToCodeBlocks(')).replace('export ', '');

test('media adapter normalizes the message and schedules a React refresh without accessing the legacy row', () => {
    const refresh = jest.fn();
    const normalize = jest.fn();
    const append = new Function('ensureMessageMediaIsArray', 'scheduleMainChatMessageListPanelRefresh', `${code}; return appendMediaToMessage;`)(normalize, refresh);
    const message = { extra: { files: [{ name: 'notes.txt', size: 12 }] } };
    const row = Object.freeze({});
    append(message, row, 'adjust');
    expect(normalize).toHaveBeenCalledWith(message);
    expect(refresh).toHaveBeenCalledTimes(1);
});
