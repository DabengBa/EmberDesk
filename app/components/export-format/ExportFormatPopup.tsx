import { ContractButton } from '../contract/ContractButton';

/**
 * Character export format popup (React-owned inside #export_format_popup).
 * The shell remains the Popper target; React buttons invoke the export command
 * directly and retain their stable classes and format attributes.
 */
export function ExportFormatPopup({ onExport }: { onExport?: (format: string) => void } = {}) {
    return (
        <>
            <ContractButton className="export_format list-group-item" data-format="png" label="PNG" width="100%" onClick={onExport ? event => { event.stopPropagation(); onExport('png'); } : undefined} />
            <ContractButton className="export_format list-group-item" data-format="json" label="JSON" width="100%" onClick={onExport ? event => { event.stopPropagation(); onExport('json'); } : undefined} />
        </>
    );
}
