import { ContractButton } from '../contract/ContractButton';

/**
 * Character export format popup (React-owned inside #export_format_popup).
 * The shell stays the Popper target; .export_format buttons are bound via
 * document-level delegation in dom-handlers.js — the delegated handler reads
 * `data-format`, so the contract classes/attribute stay on the rendered
 * <button>.
 */
export function ExportFormatPopup({ onExport }: { onExport?: (format: string) => void } = {}) {
    return (
        <>
            <ContractButton className="export_format list-group-item" data-format="png" label="PNG" width="100%" onClick={onExport ? event => { event.stopPropagation(); onExport('png'); } : undefined} />
            <ContractButton className="export_format list-group-item" data-format="json" label="JSON" width="100%" onClick={onExport ? event => { event.stopPropagation(); onExport('json'); } : undefined} />
        </>
    );
}
