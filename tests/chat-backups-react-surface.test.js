import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRepoFile } from './helpers/frontend-compatibility-contract.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('chat backups React surface (Wave A)', () => {
    test('legacy adapter delegates presentation to the workspace-panels bundle', () => {
        const adapter = readRepoFile('public/scripts/chat-backups.js');

        expect(adapter).toContain('loadWorkspacePanelsModule');
        expect(adapter).toContain('mountChatBackupsBrowser');
        expect(adapter).toContain('restoreChatBackup');
        expect(adapter).toContain('select_chat_search');
        expect(adapter).toContain('select_chat_div');

        // Presentation must live in the React component now.
        expect(adapter).not.toContain('chatBackupsListItem');
        expect(adapter).not.toContain('createContextualFragment');
        expect(adapter).not.toContain('callGenericPopup');
        expect(adapter).not.toContain("classList.add('open')");
    });

    test('adapter keeps the restore flow on legacy chat-import services', () => {
        const adapter = readRepoFile('public/scripts/chat-backups.js');

        expect(adapter).toContain("importCharacterChat");
        expect(adapter).toContain("displayPastChats");
        expect(adapter).toContain("'/api/backups/chat/download'");
        expect(adapter).toContain("formData.set('file_type', extension)");
        expect(adapter).toContain("SillyTavern.getContext()");
    });

    test('React component owns list rendering and keeps popup action contracts', () => {
        const component = readRepoFile('app/components/chat-backups/ChatBackupsBrowser.tsx');
        const styles = readRepoFile('app/styles/chat-backups.styles.ts');

        expect(component).toContain("import * as stylex from '@stylexjs/stylex'");
        expect(component).toContain("'/api/backups/chat/get'");
        expect(component).toContain("'/api/backups/chat/download'");
        expect(component).toContain("'/api/backups/chat/delete'");
        expect(component).toContain('menu_button menu_button_icon');
        expect(component).toContain('right_menu_button fa-solid fa-eye');
        expect(component).toContain('right_menu_button fa-solid fa-rotate-left');
        expect(component).toContain('right_menu_button fa-solid fa-trash');
        expect(component).toContain('createPortal');

        expect(styles).toContain('stylex.create');
        expect(styles).toContain('--SmartThemeBorderColor');
        expect(styles).toContain('--SmartThemeBlurTintColor');
    });

    test('workspace-panels bundle exports the chat-backups mount', () => {
        const workspacePanels = readRepoFile('app/workspace-panels.tsx');

        expect(workspacePanels).toContain('export function mountChatBackupsBrowser(');
        expect(workspacePanels).toContain('export function unmountChatBackupsBrowser(');
        expect(workspacePanels).toContain('ChatBackupsBrowser');
    });

    test('legacy chat-backups stylesheet is retired', () => {
        const styleCss = readRepoFile('public/style.css');
        expect(styleCss).not.toContain('css/chat-backups.css');
        expect(styleCss).not.toContain('.chatBackupsList');

        expect(fs.existsSync(path.join(repoRoot, 'public', 'css', 'chat-backups.css'))).toBe(false);
    });
});
