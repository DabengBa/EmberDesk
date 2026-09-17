import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    expectNotContainsMarkers,
    readRepoFile,
} from './helpers/frontend-structure-contract.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('welcome panel structure', () => {
    test('keeps the welcome panel free of the recent chats region', () => {
        const welcomePanel = readRepoFile('app/components/welcome/WelcomePanel.tsx');
        const welcomeScreenSource = readRepoFile('public/scripts/welcome-screen.js');

        expect(welcomePanel).toContain('welcomePanel');
        expect(welcomePanel).toContain('welcomeHeaderLogo');
        expect(welcomePanel).toContain('welcomeHeaderVersionDisplay');
        expect(welcomePanel).toContain('drawer-opener');
        expect(welcomePanel).toContain('data-target="sys-settings-button"');
        expect(welcomePanel).toContain('data-target="rightNavHolder"');
        expect(welcomePanel).toContain('data-target="extensions-settings-button"');

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
            'className="recentChat ',
            'showMoreChats',
        ], { contractName: 'welcome panel recent chats region' });

        expect(welcomeScreenSource).not.toContain('await getRecentChats()');
        expect(welcomeScreenSource).not.toContain('sendWelcomePanel(recentChats');
        expect(welcomeScreenSource).not.toContain('button.openTemporaryChat');
        expect(welcomeScreenSource).not.toContain('newAssistantChat({ temporary: true })');
    });

    test('welcome panel renders through the React main-chat snapshot', () => {
        const welcomeScreenSource = readRepoFile('public/scripts/welcome-screen.js');
        const projection = readRepoFile('public/scripts/main-chat-store-projection.js');
        const workspacePanels = readRepoFile('app/workspace-panels.tsx');
        const store = readRepoFile('app/stores/main-chat-store.ts');

        expect(welcomeScreenSource).toContain('welcomePanelVisible = true');
        expect(welcomeScreenSource).toContain('scheduleMainChatMessageListPanelRefresh');
        expect(welcomeScreenSource).toContain('export function getWelcomePanelVisible');
        expect(welcomeScreenSource).not.toContain('renderTemplateAsync');

        expect(projection).toContain('welcome');
        expect(store).toContain('MainChatWelcomeSnapshot');
        expect(workspacePanels).toContain('snapshot.welcome?.visible');
        expect(workspacePanels).toContain('WelcomePanel');
    });

    test('retired welcome stylesheet and template are gone', () => {
        expect(fs.existsSync(path.join(repoRoot, 'public', 'css', 'welcome.css'))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, 'public', 'scripts', 'templates', 'welcomePanel.html'))).toBe(false);
        expect(readRepoFile('public/style.css')).not.toContain('css/welcome.css');
    });

    test('assistant welcome message keeps hidden action buttons', () => {
        const row = readRepoFile('app/components/main-chat/MainChatMessageRow.tsx');
        const projection = readRepoFile('public/scripts/main-chat-store-projection.js');

        expect(projection).toContain('extraType');
        expect(row).toContain("extraType === 'assistant_message'");
        expect(row).toContain('type: message.extraType || undefined');
    });
});
