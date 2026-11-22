import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/scripts/generation-service.js', import.meta.url), 'utf8');
const start = source.indexOf('removeCardView: () => {');
const end = source.indexOf('\n                    emitDeleted:', start);
const entry = source.slice(start, end);

test('pipeline asks React to refresh without mutating its rows', () => {
    const mount = jest.fn();
    const ports = new Function('mountReactMainChatMessageListPanel', `return { ${entry} };`)(mount);
    ports.removeCardView(7);
    expect(mount).toHaveBeenCalledTimes(1);
});
