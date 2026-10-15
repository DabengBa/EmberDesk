import type { ReactNode } from 'react';

/**
 * Shared chrome for the top-center drawer panels (正则 / 世界书 / 设置 /
 * 消息渲染设置): an optional drag grabber, one title row, and a body that
 * fills the rest of the drawer. The header carries no controls — drawers
 * close via their shell nav entry, sibling-drawer mutual exclusion, or
 * Escape, and lock state lives only on the legacy side panels.
 */
export function WorkspacePanelChrome({
    title,
    icon,
    grabberId,
    children,
}: {
    title: ReactNode;
    icon?: string;
    /** id for the drag grabber (legacy drag handlers resolve `#${hostId}header`). */
    grabberId?: string;
    children: ReactNode;
}) {
    return (
        <div className="workspace-panel-chrome">
            {grabberId ? <div id={grabberId} className="fa-solid fa-grip drag-grabber" aria-hidden="true" /> : null}
            <header className="wpc-header">
                <div className="wpc-title">
                    {icon ? <i className={`${icon} wpc-title-icon`} aria-hidden="true" /> : null}
                    <span>{title}</span>
                </div>
            </header>
            <div className="wpc-body">{children}</div>
        </div>
    );
}
