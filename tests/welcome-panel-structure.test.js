import { describe, expect, test } from '@jest/globals';

import {
    expectNotContainsMarkers,
    readRepoFile,
} from './helpers/frontend-structure-contract.js';

describe('welcome panel structure', () => {
    test('keeps the welcome panel free of the recent chats region', () => {
        const welcomePanel = readRepoFile('public/scripts/templates/welcomePanel.html');
        const welcomeScreenSource = readRepoFile('public/scripts/welcome-screen.js');

        expect(welcomePanel).toContain('class="welcomePanel"');
        expect(welcomePanel).toContain('class="welcomeHeaderLogo"');
        expect(welcomePanel).toContain('class="welcomeHeaderVersionDisplay"');

        expectNotContainsMarkers(welcomePanel, [
            'Docs',
            'GitHub',
            'Discord',
            'Temporary Chat',
            'welcomeShortcuts',
            'welcomeShortcutsSeparator',
            'openTemporaryChat',
            'recentChatsTitle',
            'Recent Chats',
            'recentChatsSettings',
            'showRecentChats',
            'hideRecentChats',
            'welcomeRecent',
            'recentChatList',
            'No recent chats',
            'class="recentChat ',
            'showMoreChats',
        ], { contractName: 'welcome panel recent chats region' });

        expect(welcomeScreenSource).not.toContain('await getRecentChats()');
        expect(welcomeScreenSource).not.toContain('sendWelcomePanel(recentChats');
        expect(welcomeScreenSource).not.toContain('button.openTemporaryChat');
        expect(welcomeScreenSource).not.toContain('newAssistantChat({ temporary: true })');
    });
});
