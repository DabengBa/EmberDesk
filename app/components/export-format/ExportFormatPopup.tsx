/**
 * Character export format popup (React-owned inside #export_format_popup).
 * The shell stays the Popper target; .export_format buttons are bound via
 * document-level delegation in script.js.
 */
export function ExportFormatPopup() {
    return (
        <>
            <button className="export_format list-group-item" data-format="png" type="button">PNG</button>
            <button className="export_format list-group-item" data-format="json" type="button">JSON</button>
        </>
    );
}
