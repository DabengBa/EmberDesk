import { expect, jest, test } from '@jest/globals';

jest.unstable_mockModule('../public/scripts/notifications.js', () => ({ default: {} }));
jest.unstable_mockModule('../public/scripts/events.js', () => ({ eventSource: {}, event_types: {} }));
jest.unstable_mockModule('../public/scripts/frontend-frame.js', () => ({ isFrontendContent: () => false }));
jest.unstable_mockModule('../public/scripts/utils.js', () => ({ uuidv4: () => 'id' }));
const { registerMessageShellContext } = await import('../public/scripts/message-shell-context.js');
const { updateMessageElement } = await import('../public/scripts/message-service.js');

test('compatibility row adapter preserves identity and schedules a React refresh without mutating the row', () => {
    const refresh = jest.fn();
    registerMessageShellContext({ state: {}, scheduleMainChatMessageListPanelRefresh: refresh });
    const row = Object.freeze({ content: 'React-owned content' });
    expect(updateMessageElement({}, { messageElement: row })).toBe(row);
    expect(row.content).toBe('React-owned content');
    expect(refresh).toHaveBeenCalledTimes(1);
});
