import { t, translate } from './i18n.js';
import { getFileExtension } from './utils.js';
import { displayPastChats, importCharacterChat } from '/script.js';
import { getRequestHeaders } from './request-context.js';
import { loadWorkspacePanelsModule } from './workspace-panels-react-bridge.js';

/**
 * Downloads a backup file and re-imports it as a chat for the active character.
 * Runs legacy-side because chat import + past-chats refresh are owned by script.js.
 * @param {string} name File name of the backup to restore.
 * @returns {Promise<string[]|null>} Imported chat names, or null on failure.
 */
async function restoreChatBackup(name) {
    const response = await fetch('/api/backups/chat/download', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ name: name }),
    });

    if (!response.ok) {
        toastr.error(t`Failed to download backup, try again later.`);
        console.error('Failed to download chat backup:', response.statusText);
        return null;
    }

    const blob = await response.blob();
    const file = new File([blob], name, { type: 'application/octet-stream' });

    const extension = getFileExtension(file);

    if (extension !== 'jsonl') {
        toastr.warning(t`Only .jsonl files are supported for chat imports.`);
        return null;
    }

    const context = SillyTavern.getContext();

    const formData = new FormData();
    formData.set('file_type', extension);
    formData.set('avatar', file);
    formData.set('avatar_url', context.characters[context.characterId]?.avatar || '');
    formData.set('user_name', context.name1);
    formData.set('character_name', context.name2);

    const result = await importCharacterChat(formData, { refresh: false });

    if (result.length === 0) {
        toastr.error(t`Failed to import chat backup, try again later.`);
        return null;
    }

    toastr.success(`Chat imported: ${result.join(', ')}`);
    await displayPastChats(result);
    return result;
}

let isMounted = false;
let refreshToken = 0;

export function addChatBackupsBrowser() {
    if (isMounted) {
        refreshToken += 1;
        void mountBrowser();
        return;
    }

    const searchSibling = document.getElementById('select_chat_search');
    const listSibling = document.getElementById('select_chat_div');
    if (!searchSibling || !listSibling) {
        console.error('Could not find sibling elements for BackupsBrowser');
        return;
    }

    const buttonContainer = document.createElement('span');
    buttonContainer.setAttribute('data-chat-backups-button-host', 'true');
    searchSibling.parentNode.insertBefore(buttonContainer, searchSibling);

    const listContainer = document.createElement('div');
    listContainer.setAttribute('data-chat-backups-list-host', 'true');
    listSibling.parentNode.insertBefore(listContainer, listSibling);

    isMounted = true;
    void mountBrowser();

    async function mountBrowser() {
        try {
            const module = await loadWorkspacePanelsModule();
            module.mountChatBackupsBrowser({
                buttonContainer,
                listContainer,
                refreshToken,
                commands: { restoreChatBackup, translate },
            });
        } catch (error) {
            console.error('Failed to mount chat backups browser:', error);
        }
    }
}
