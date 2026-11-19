import { Theme } from '@astryxdesign/core';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { translate } from '../../compat/i18n.js';
import { createWorkspacePortalMount } from '../../compat/workspace-portals';
import { emberDeskTheme } from '../../lib/theme-tokens';
import { ContractButton } from '../contract/ContractButton';

const resultLabels = {
    character: 'Character imported', lorebook: 'World book imported', skipped: 'Skipped', failed: 'Import failed',
} as const;

type ImportResult = keyof typeof resultLabels;
type ImportLink = (input: string) => Promise<ImportResult>;
type ResultRow = { input: string; result: ImportResult };

function ExternalImportDialog({ importLink, close, openFilePicker }: {
    importLink: ImportLink; close: () => void; openFilePicker: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const textarea = useRef<HTMLTextAreaElement>(null);
    const status = useRef<HTMLOutputElement>(null);
    const busy = useRef(false);
    const titleId = useId();
    const [phase, setPhase] = useState<'edit' | 'importing' | 'results'>('edit');
    const [input, setInput] = useState('');
    const [rows, setRows] = useState<ResultRow[]>([]);
    const retrying = rows.length > 0;
    const failures = rows.filter(row => row.result === 'failed');

    useLayoutEffect(() => {
        const element = dialog.current;
        element?.showModal();
        return () => { element?.close(); };
    }, []);
    useLayoutEffect(() => {
        if (phase === 'edit') textarea.current?.focus();
        else status.current?.focus();
    }, [phase]);

    async function submit() {
        const links = input.split('\n').map(value => value.trim()).filter(Boolean);
        if (phase !== 'edit' || busy.current || !links.length) return;
        busy.current = true;
        setRows(current => current.filter(row => row.result !== 'failed'));
        setPhase('importing');
        try {
            for (const link of links) {
                let result: ImportResult = 'failed';
                try { result = await importLink(link); }
                catch (error) { console.error('External import failed:', error); }
                setRows(current => [...current, { input: link, result }]);
            }
        } finally {
            busy.current = false;
            setPhase('results');
        }
    }

    function dismiss() {
        if (busy.current) return;
        if (phase === 'edit' && retrying) setPhase('results');
        else close();
    }

    return <dialog ref={dialog} className="external-import-dialog" aria-labelledby={titleId}
        onCancel={event => { event.preventDefault(); dismiss(); }}
        onClose={event => {
            if (busy.current) {
                if (!event.currentTarget.open) event.currentTarget.showModal();
            } else close();
        }}>
        <form onSubmit={event => { event.preventDefault(); void submit(); }}>
            <h2 id={titleId}>{translate('Import by link')}</h2>
            {phase === 'edit' ? <textarea ref={textarea} className="text_pole" rows={4}
                aria-label={translate('Link or ID')} placeholder={translate('Link or ID, one per line')}
                spellCheck={false} value={input} onChange={event => setInput(event.target.value)}
                onKeyDown={event => {
                    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    void submit();
                }} /> : <>
                <output ref={status} tabIndex={-1} className={phase === 'importing' ? undefined : 'sr-only'}>
                    {phase === 'importing' ? translate('Importing…') : translate('Import complete')}
                </output>
                {rows.length > 0 && <ul className="external-import-results" role="list">
                    {rows.map((row, index) => <li key={index}>
                        <span>{row.input}</span>
                        <strong>{translate(resultLabels[row.result])}</strong>
                    </li>)}
                </ul>}
            </>}
            {phase === 'edit' ? <footer>
                <ContractButton label="Cancel" onClick={dismiss} />
                <ContractButton label={retrying ? 'Retry' : 'Import'} variant="primary" type="submit" disabled={!input.trim()} />
            </footer> : phase === 'results' && <footer>
                {failures.length > 0 && <>
                    <ContractButton label="Import from file" onClick={() => { close(); openFilePicker(); }} />
                    <ContractButton label="Edit and retry" onClick={() => {
                        setInput(failures.map(row => row.input).join('\n'));
                        setPhase('edit');
                    }} />
                </>}
                <ContractButton label="Done" variant="primary" onClick={close} />
            </footer>}
        </form>
    </dialog>;
}

export function mountExternalImportDialog(host: HTMLElement, importLink: ImportLink, close: () => void, openFilePicker: () => void, fail: (error: unknown) => void) {
    const portal = createWorkspacePortalMount(host, fail);
    try {
        portal.render(<Theme theme={emberDeskTheme} mode="dark">
            <ExternalImportDialog importLink={importLink} close={close} openFilePicker={openFilePicker} />
        </Theme>, true);
    } catch (error) {
        portal.unmount();
        throw error;
    }
    return () => portal.unmount();
}
