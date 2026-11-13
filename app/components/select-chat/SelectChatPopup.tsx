import { ContractButton } from '../contract/ContractButton';
import { ContractIconButton } from '../contract/ContractIconButton';
import { translate, useTranslated } from '../../compat/i18n.js';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { createHistoryPanelController } from '../../lib/history-panel-service';
import { getRecoveryUnsentText, type RecoveryDraft } from '../../lib/chat-recovery-drafts';

export interface RecoveryDraftBridge {
    list(): Promise<RecoveryDraft[]>;
    exportDraft(draft: RecoveryDraft): void;
    restoreDraft(draft: RecoveryDraft): Promise<string>;
    listPendingDeletes(): Promise<Array<{ account: string; avatar: string; chat: string }>>;
    retryDelete(item: { account: string; avatar: string; chat: string }): Promise<void>;
}

function PendingHistoryDeletes({ bridge }: { bridge: RecoveryDraftBridge }) {
    const [items, setItems] = useState<Array<{ account: string; avatar: string; chat: string }>>([]);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        let active = true, revision = 0;
        const refresh = () => {
            const request = ++revision;
            void bridge.listPendingDeletes().then(value => {
                if (active && request === revision) { setItems(value); setError(''); }
            }, () => { if (active && request === revision) { setItems([]); setError(translate('Pending deletions could not be read from this browser.')); } });
        };
        window.addEventListener('emberdesk:recovery-drafts-changed', refresh);
        refresh();
        return () => { active = false; window.removeEventListener('emberdesk:recovery-drafts-changed', refresh); };
    }, [bridge]);
    if (!items.length && !error && !actionError) return null;
    return <section data-testid="pending-history-deletions" aria-label={translate('Unconfirmed deletions')}>
        <h3>{translate('Unconfirmed deletions')}</h3>
        <p>{translate('The server response was not confirmed. Retry uses the same deletion request; it will not delete a newer version.')}</p>
        {error && <p role="alert">{error}</p>}
        {actionError && <p role="alert">{actionError}</p>}
        <ul>{items.map(item => <li key={`${item.avatar}:${item.chat}`}>
            <span>{item.chat} · {item.avatar}</span>{' '}
            <button type="button" className="menu_button" disabled={busy} onClick={() => {
                setBusy(true);
                setActionError('');
                void bridge.retryDelete(item).catch(() => setActionError(translate('Deletion is still unconfirmed. Retry later.'))).finally(() => setBusy(false));
            }}>{translate('Retry deletion')}</button>
        </li>)}</ul>
    </section>;
}

function RecoveryDrafts({ bridge }: { bridge: RecoveryDraftBridge }) {
    const [drafts, setDrafts] = useState<RecoveryDraft[]>([]);
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState('');
    const [shown, setShown] = useState<string | null>(null);
    useEffect(() => {
        let active = true, revision = 0;
        const refresh = () => {
            const request = ++revision;
            void bridge.list().then(items => {
                if (active && request === revision) { setDrafts(items); setError(false); }
            }, () => { if (active && request === revision) { setDrafts([]); setError(true); } });
        };
        window.addEventListener('emberdesk:recovery-drafts-changed', refresh);
        refresh();
        return () => { active = false; window.removeEventListener('emberdesk:recovery-drafts-changed', refresh); };
    }, [bridge]);
    if (!drafts.length && !error) return null;
    return <section data-testid="chat-recovery-drafts" aria-label={translate('Recovery drafts')}>
        <h3>{translate('Recovery drafts')}</h3>
        <p>{translate('Restore creates a separate chat from the saved messages and metadata. Unsent text is not applied automatically: show it below to select and copy it safely. The local copy is retained.')}</p>
        <p>{translate('If a restore response is lost, retry uses the same saved snapshot. Later edits remain available in the export.')}</p>
        {error && <p role="alert">{translate('Recovery drafts could not be read from this browser.')}</p>}
        {notice && <p role="status">{notice}</p>}
        <ul>{drafts.map(draft => <li key={draft.id}>
            <span>{draft.identity.chat} · {draft.identity.avatar} · {new Date(draft.updatedAt).toLocaleString()}</span>{' '}
            <button type="button" className="menu_button" disabled={busy !== null} onClick={() => {
                setBusy(draft.id);
                setNotice('');
                void bridge.restoreDraft(draft).then(name => setNotice(`${translate('Created recovery chat')}: ${name}`), () => setNotice(translate('Could not create the recovery chat. The local copy is unchanged; retry or export it.'))).finally(() => setBusy(null));
            }}>{translate('Restore as new chat')}</button>{' '}
            <button type="button" className="menu_button" onClick={() => bridge.exportDraft(draft)}>{translate('Export recovery data')}</button>
            {' '}<button type="button" className="menu_button" aria-expanded={shown === draft.id} onClick={() => setShown(shown === draft.id ? null : draft.id)}>{translate(shown === draft.id ? 'Hide unsent text' : 'Show unsent text')}</button>
            {shown === draft.id && <div>
                <p>{translate('Select and copy the text you need. Nothing is inserted or overwritten automatically. Export contains the complete recovery data.')}</p>
                {getRecoveryUnsentText(draft.snapshot).map((item, index) => <label key={`${item.kind}-${item.messageId ?? ''}-${index}`} style={{ display: 'block' }}>
                    {item.kind === 'composer' ? translate('Composer draft') : `${translate(item.kind === 'message' ? 'Message edit draft' : 'Reasoning edit draft')} ${item.messageId}`}
                    <textarea className="text_pole" readOnly value={item.text} onFocus={event => event.currentTarget.select()} style={{ display: 'block', width: '100%' }} />
                </label>)}
                {getRecoveryUnsentText(draft.snapshot).length === 0 && <p>{translate('No unsent text was captured in this snapshot.')}</p>}
            </div>}
        </li>)}</ul>
    </section>;
}

/**
 * Past-chats popup inner markup (React-owned inside #select_chat_popup).
 * #shadow_select_chat_popup shell stays legacy (display/opacity toggles);
 * #select_chat_div is the dynamic list container filled by script.js.
 * Action chrome is Astryx contract buttons; #select_chat_search stays a
 * plain input because legacy code drives it via jQuery .val()/input events.
 */
export function SelectChatPopup({ controller, onSearch, onClose, onNewChat, onImportFile, recovery }: { controller: ReturnType<typeof createHistoryPanelController>; onSearch(query: string): void; onClose(): void; onNewChat(): void; onImportFile(input: HTMLInputElement): void; recovery?: RecoveryDraftBridge }) {
    useTranslated('');
    const importInput = useRef<HTMLInputElement>(null);
    const searchLabel = useTranslated('Search chats');
    const { searchQuery } = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    return (
        <>
            <div name="selectChatPopupHeader" className="flex-container alignitemscenter justifySpaceBetween flexGap10">
                <div id="select_chat_import"> {/* import chat popup header */}
                    <form id="form_import_chat" method="post" encType="multipart/form-data" style={{ display: 'none' }} onSubmit={(event) => event.preventDefault()}>
                        <input type="file" id="chat_import_file" accept=".json, .jsonl" multiple name="avatar" ref={importInput} onChange={event => onImportFile(event.currentTarget)} />
                        <input id="chat_import_file_type" name="file_type" className="text_pole" defaultValue="" autoComplete="off" style={{ display: 'none' }} />
                        <input id="chat_import_avatar_url" name="avatar_url" className="text_pole" defaultValue="" autoComplete="off" style={{ display: 'none' }} />
                        <input id="chat_import_character_name" name="character_name" className="text_pole" defaultValue="" autoComplete="off" style={{ display: 'none' }} />
                    </form>
                </div>
                <div id="selectChatPopupHeaderText" className="TxtLrgBoldCenter">
                    <span id="ChatHistoryCharName"></span><span >{translate('Chat History')}</span>
                    <a href="usage/core-concepts/chatfilemanagement/" className="notes-link" target="_blank" rel="noreferrer" aria-label="Chat file management documentation"><span className="fa-solid fa-circle-question note-link-span" aria-hidden="true"></span></a>
                </div>
                <ContractButton id="newChatFromManageScreenButton" className="menu_button menu_button_icon" variant="ghost" label="New Chat" onClick={onNewChat} icon={<i className="fa-solid fa-plus" aria-hidden="true" />} />
                <ContractButton id="chat_import_button" className="menu_button menu_button_icon" variant="ghost" label="Import Chat" onClick={() => importInput.current?.click()} icon={<i className="fa-solid fa-file-import" aria-hidden="true" />} />
                <input type="search" id="select_chat_search" className="text_pole flex1" aria-label={searchLabel} data-i18n="[aria-label]Search chats;[placeholder]Search..." placeholder="Search..." autoComplete="off" autoFocus value={searchQuery} onChange={event => onSearch(event.currentTarget.value)} />
                <ContractIconButton id="select_chat_cross" className="chat-history-close fontsize120p" label="Close" labelKey="Close" onClick={onClose} icon={<i className="fa-solid fa-circle-xmark" aria-hidden="true" />} />
            </div>
            {recovery && <><PendingHistoryDeletes bridge={recovery} /><RecoveryDrafts bridge={recovery} /></>}
            <div id="select_chat_div" style={{ height: 'auto', maxHeight: 'calc(100dvh - var(--topBarBlockSize) - 160px)' }}></div>
        </>
    );
}
