import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('Quick Reply React surface', () => {
    const editor = readRepoFile('app/components/quick-reply/QuickReplyEditor.tsx');
    const settings = readRepoFile('app/components/quick-reply/QuickReplySettings.tsx');
    const workspace = readRepoFile('app/workspace-panels.tsx');
    const quickReplyJs = readRepoFile('public/scripts/extensions/quick-reply/src/QuickReply.js');
    const settingsUiJs = readRepoFile('public/scripts/extensions/quick-reply/src/ui/SettingsUi.js');

    test('legacy HTML templates are retired and React components own the markup', () => {
        expect(fs.existsSync(path.join(projectRoot, 'public/scripts/extensions/quick-reply/html/qrEditor.html'))).toBe(false);
        expect(fs.existsSync(path.join(projectRoot, 'public/scripts/extensions/quick-reply/html/settings.html'))).toBe(false);
        expect(editor).toContain('id="qr--modalEditor"');
        expect(settings).toContain('id="qr--settings"');
    });

    test('editor preserves contract IDs used by QuickReply.js bindings', () => {
        const ids = [
            'qr--modalEditor', 'qr--main', 'qr--modal-icon', 'qr--modal-showLabel',
            'qr--modal-label', 'qr--modal-switcher', 'qr--modal-title',
            'qr--modal-wrap', 'qr--modal-tabSize', 'qr--modal-executeShortcut',
            'qr--modal-syntax', 'qr--modal-commentKey', 'qr--modal-messageHolder',
            'qr--modal-messageSyntax', 'qr--modal-messageSyntaxInner',
            'qr--modal-message', 'qr--resizeHandle', 'qr--qrOptions',
            'qr--ctxEditor', 'qr--ctxItem', 'qr--ctxAdd', 'qr--autoExec',
            'qr--preventAutoExecute', 'qr--isHidden', 'qr--executeOnStartup',
            'qr--executeOnUser', 'qr--executeOnAi', 'qr--executeOnChatChange',
            'qr--executeOnNewChat', 'qr--executeBeforeGeneration',
        ];
        for (const id of ids) {
            expect(editor).toContain(`id="${id}"`);
        }
        // Dynamic row template stays a real <template> for content.cloneNode callers.
        expect(editor).toMatch(/<template id="qr--ctxItem">/);
    });

    test('settings preserves contract IDs used by SettingsUi.js bindings', () => {
        const ids = [
            'qr--settings', 'qr--isEnabled', 'qr--isCombined',
            'qr--showPopoutButton', 'qr--global', 'qr--chat', 'qr--character',
        ];
        for (const id of ids) {
            expect(settings).toContain(`id="${id}"`);
        }
    });

    test('legacy modules mount via workspace bundle instead of fetching templates', () => {
        expect(workspace).toContain('export function mountQuickReplyEditor');
        expect(workspace).toContain('export function mountQuickReplySettings');
        expect(quickReplyJs).toContain('loadWorkspacePanelsModule');
        expect(quickReplyJs).toContain('module.mountQuickReplyEditor(host)');
        expect(quickReplyJs).not.toContain('qrEditor.html');
        expect(settingsUiJs).toContain('loadWorkspacePanelsModule');
        expect(settingsUiJs).toContain('module.mountQuickReplySettings(host)');
        expect(settingsUiJs).not.toContain('quick-reply/html/settings.html');
    });
});
