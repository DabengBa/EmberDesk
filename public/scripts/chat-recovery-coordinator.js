import { localforage } from '../lib.js';
import { eventSource, event_types } from './events.js';
import toastr from './notifications.js';
import { getRequestHeaders } from './request-context.js';
import { getCurrentUserHandle } from './user.js';

export function createChatRecoveryCoordinator({ snapshot, getSelectedCharacter, getChatSessionVersion, shouldPreserveCharacterChatTarget, withCurrentChatDeleteVersion, leaveTemporary, replaceCurrentChat }) {
    let chatRecoveryDrafts;
    let pendingChatRecovery;
    let conditionalHistoryDelete;

    function captureChatSaveRecovery() {
        return {
            account: getCurrentUserHandle(),
            snapshot: structuredClone(snapshot()),
        };
    }

    async function preserveChatSaveConflict(identity, captured, isCurrent) {
        if (!chatRecoveryDrafts || !pendingChatRecovery || !captured?.account) throw new Error('Recovery storage is unavailable');
        if (isCurrent() && captured.account === getCurrentUserHandle()) {
            await pendingChatRecovery.begin(identity);
            await pendingChatRecovery.checkpoint();
        } else {
            await chatRecoveryDrafts.create(captured.account, identity, captured.snapshot);
            window.dispatchEvent(new Event('emberdesk:recovery-drafts-changed'));
        }
    }

    function isLiveHistoryTarget(identity) {
        const current = getSelectedCharacter();
        return (current?.avatar === identity.avatar && current?.chat === identity.chat)
            || shouldPreserveCharacterChatTarget(identity.avatar, identity.chat);
    }

    function installChatRecovery(workspace) {
        const storage = localforage.createInstance({ name: 'EmberDesk_ChatRecovery' });
        chatRecoveryDrafts = workspace.createChatRecoveryDrafts({ storage, newId: () => crypto.randomUUID(), now: () => Date.now() });
        const atomic = workspace.createIndexedDbDeleteAtomic('EmberDesk_ChatRecovery', 'keyvaluepairs', async () => {
            await storage.ready();
            if (storage.driver() !== localforage.INDEXEDDB) throw new Error('IndexedDB recovery storage is unavailable');
        });
        conditionalHistoryDelete = workspace.createConditionalHistoryDelete({
            storage,
            atomic,
            newId: () => crypto.randomUUID(),
            readVersion: async identity => {
                // The live session's version must come from the owner of its save queue,
                // never from a fresh GET that could approve deleting unseen remote edits.
                if (isLiveHistoryTarget(identity)) throw new Error('The loaded chat version is not available to history deletion');
                const response = await fetch('/api/chats/get', {
                    method: 'POST', headers: getRequestHeaders(), cache: 'no-cache',
                    body: JSON.stringify({ avatar_url: identity.avatar, file_name: identity.chat }),
                });
                if (!response.ok) throw new Error(`Could not read chat version (${response.status})`);
                const version = response.headers.get('X-Chat-Version');
                if (!version) throw new Error('Chat version is unavailable');
                return version;
            },
            send: (request, context) => {
                const name = request.chatfile.replace(/\.jsonl$/, '');
                if (context.account !== getCurrentUserHandle()) throw new Error('Account changed');
                if (isLiveHistoryTarget({ avatar: request.avatar_url, chat: name }) && !context.replay && !context.versionLocked) throw new Error('The loaded chat version is not available to history deletion');
                return fetch('/api/chats/delete', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify(request) });
            },
        });
        const changed = () => window.dispatchEvent(new Event('emberdesk:recovery-drafts-changed'));
        pendingChatRecovery = workspace.createPendingChatRecovery({
            account: getCurrentUserHandle,
            snapshot,
            create: async (identity, snapshot, account) => {
                const draft = await chatRecoveryDrafts.create(account, identity, snapshot);
                changed();
                return draft.id;
            },
            update: async (id, snapshot, account) => {
                await chatRecoveryDrafts.update(account, id, snapshot);
                changed();
            },
        });
        // While a deletion is unresolved the user can keep editing the loaded
        // session. Persist those changes without waiting for a chat switch.
        let checkpointRunning = false;
        let checkpointWarning = false;
        setInterval(() => {
            if (checkpointRunning) return;
            checkpointRunning = true;
            void pendingChatRecovery.checkpointIfChanged().then(() => {
                checkpointWarning = false;
            }, error => {
                console.error('Recovery checkpoint failed', error);
                if (!checkpointWarning) {
                    checkpointWarning = true;
                    toastr.error('Recent edits could not be saved to the recovery draft. Keep this chat open and export your work after storage is available.', 'Recovery storage error', { timeOut: 0 });
                }
            }).finally(() => { checkpointRunning = false; });
        }, 1000);
    }

    async function deleteHistoryChatConditional(identity, deferConfirmation = false) {
        try {
            const account = getCurrentUserHandle();
            return await conditionalHistoryDelete(account, identity, isLiveHistoryTarget(identity) ? remove => withCurrentChatDeleteVersion(identity, remove) : undefined, deferConfirmation);
        } catch (error) {
            if (error instanceof Error && error.message === 'Chat deletion failed (409)') {
                toastr.error('A newer version or conflicting operation prevented deletion. Open Chat History → Recovery drafts to restore your local messages as a new chat or export your draft. Retrying the same request will not overwrite the newer version.', 'Chat deletion conflict', { timeOut: 0 });
            } else {
                toastr.error('The chat was not confirmed deleted. Retry later; any saved recovery draft remains available to export.', 'Chat deletion could not be confirmed', { timeOut: 0 });
            }
            throw error;
        } finally {
            window.dispatchEvent(new Event('emberdesk:recovery-drafts-changed'));
        }
    }

    async function beforeClearRecovery() {
        try {
            await pendingChatRecovery?.beforeClear();
        } catch (error) {
            toastr.error('The recovery draft could not be saved. The current chat has not been cleared.', 'Recovery storage error', { timeOut: 0 });
            throw error;
        }
        leaveTemporary();
    }

    async function beginChatRecovery(identity) {
        try {
            await pendingChatRecovery.begin(identity);
        } catch (error) {
            toastr.error('The recovery draft could not be saved. The chat was not deleted.', 'Recovery storage error', { timeOut: 0 });
            throw error;
        }
    }

    async function delChat(chatfile) {
        const avatar = getSelectedCharacter().avatar;
        const name = chatfile.replace('.jsonl', '');
        const current = name === getSelectedCharacter().chat;
        const account = getCurrentUserHandle();
        const identity = { avatar, chat: name };
        const session = getChatSessionVersion();
        const isCurrent = () => account === getCurrentUserHandle() && getChatSessionVersion() === session
            && getSelectedCharacter()?.avatar === avatar && getSelectedCharacter()?.chat === name;
        // A persisted replay can belong to an earlier loaded session, even if the
        // same file name is now selected. Never clear that newer session on replay.
        const earlierSession = current && await conditionalHistoryDelete.hasPending(account, identity) && !pendingChatRecovery.isActive(identity);
        if (current) {
            if (!isCurrent()) {
                throw new Error('The selected chat changed before recovery could be saved');
            }
            await beginChatRecovery(identity);
            if (!isCurrent()) throw new Error('The selected chat changed before deletion');
        }
        const operationId = await deleteHistoryChatConditional(identity, current);
        {
            // choose another chat if current was deleted
            if (current && !earlierSession && isCurrent()) {
                await replaceCurrentChat(isCurrent);
            } else if (current && earlierSession) {
                await pendingChatRecovery.checkpoint();
                toastr.warning('The earlier deletion was confirmed. The current session was kept; switch chats or reload to refresh it. A recovery copy is available.', 'Chat deletion', { timeOut: 0 });
            }
            if (current) {
                if (account !== getCurrentUserHandle()) throw new Error('Account changed');
                await conditionalHistoryDelete.confirm(account, identity, operationId);
                window.dispatchEvent(new Event('emberdesk:recovery-drafts-changed'));
            }
            await eventSource.emit(event_types.CHAT_DELETED, name);
        }
    }

    return {
        captureChatSaveRecovery, preserveChatSaveConflict, installChatRecovery, beforeClearRecovery, beginChatRecovery,
        deleteHistoryChatConditional, delChat,
        get drafts() { return chatRecoveryDrafts; },
        get conditionalDelete() { return conditionalHistoryDelete; },
    };
}
