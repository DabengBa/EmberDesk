import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { workspacePanelStyles } from '../../styles/workspace-panels.styles.js';

type WorkspacePanelKind = 'worldInfo' | 'mainChatMessageList' | 'characterAuthoring';
type WorkspacePanelStatus = 'idle' | 'loading' | 'empty' | 'success' | 'error';
interface WorkspacePanelLegacySlot {
    id: string;
    label: string;
    ready?: boolean;
}
interface WorkspacePanelRecoveryAction {
    id: string;
    label: string;
    disabled?: boolean;
    onClick: () => void;
}

const panelShellStyles = stylex.create({
    diagnostics: {
        color: 'color-mix(in srgb, var(--SmartThemeBodyColor) 72%, var(--SmartThemeBlurTintColor) 28%)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'color-mix(in srgb, var(--SmartThemeBorderColor) 70%, transparent)',
        borderRadius: '5px',
        backgroundColor: 'color-mix(in srgb, var(--SmartThemeBlurTintColor) 70%, var(--black50a) 30%)',
        padding: {
            default: '2px 5px',
            '[open]': '2px 5px 5px',
        },
        fontSize: 'calc(var(--mainFontSize) * 0.9)',
    },
    diagnosticsSummary: {
        width: 'fit-content',
        cursor: 'pointer',
        color: {
            default: 'var(--SmartThemeEmColor)',
            ':hover': 'var(--SmartThemeBodyColor)',
            ':focus-visible': 'var(--SmartThemeBodyColor)',
        },
        listStylePosition: 'inside',
        outlineWidth: { ':focus-visible': '1px' },
        outlineStyle: { ':focus-visible': 'solid' },
        outlineColor: { ':focus-visible': 'var(--interactable-outline-color)' },
        outlineOffset: { ':focus-visible': '2px' },
        borderRadius: { ':focus-visible': '3px' },
        marginBottom: {
            [stylex.when.ancestor('[open]')]: '5px',
        },
    },
});

function getWorkspacePanelVisibleStatusLabel(status: WorkspacePanelStatus) {
    switch (status) {
        case 'loading':
            return 'opening';
        case 'empty':
            return 'needs setup';
        case 'error':
            return 'needs attention';
        case 'idle':
            return 'idle';
        case 'success':
        default:
            return 'ready';
    }
}

export function WorkspacePanelShell({
    kind,
    title,
    status,
    actions = [],
    legacyBoundary,
    hideDiagnostics = false,
    hideTitle = false,
    slots = [],
    children,
}: {
    kind: WorkspacePanelKind;
    title: string;
    status: WorkspacePanelStatus;
    actions?: WorkspacePanelRecoveryAction[];
    legacyBoundary?: string;
    hideDiagnostics?: boolean;
    hideTitle?: boolean;
    slots?: WorkspacePanelLegacySlot[];
    children: ReactNode;
}) {
    const boundaryAttributes = legacyBoundary ? {
        [`data-${kind.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}-legacy-boundary`]: legacyBoundary,
    } : {};
    const showStatusBadge = status === 'loading' || status === 'error';

    return (
        <section
            className="emberdesk-react-workspace-panel"
            data-react-workspace-panel={kind}
            data-react-workspace-panel-shell={kind}
            data-workspace-panel-status={status}
            {...boundaryAttributes}
        >
            <div className="flex-container flexFlowColumn gap8">
                {!hideTitle || showStatusBadge ? (
                    <div className="flex-container justifyspacebetween alignitemscenter gap8">
                        {!hideTitle ? <div className="title_restorable">{title}</div> : <span aria-hidden="true" />}
                        {showStatusBadge ? (
                            <span
                                {...stylex.props(
                                    workspacePanelStyles.statusBadge,
                                    status === 'loading' ? workspacePanelStyles.statusBadgeLoading : workspacePanelStyles.statusBadgeError,
                                )}
                                data-workspace-panel-status={status}
                            >
                                {getWorkspacePanelVisibleStatusLabel(status)}
                            </span>
                        ) : null}
                    </div>
                ) : null}
                {actions.length > 0 ? (
                    <div
                        {...stylex.props(workspacePanelStyles.recovery)}
                        data-workspace-panel-recovery-state={status}
                    >
                        <div {...stylex.props(workspacePanelStyles.recoveryActions)}>
                            {actions.map(action => (
                                <button
                                    key={action.id}
                                    type="button"
                                    className={`menu_button menu_button_icon ${stylex.props(workspacePanelStyles.recoveryActionButton).className ?? ''}`}
                                    data-workspace-panel-recovery-action={action.id}
                                    onClick={action.onClick}
                                    disabled={action.disabled}
                                >
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}
                {children}
                {!hideDiagnostics && (slots.length > 0 || status !== 'idle') ? (
                    <details
                        {...stylex.props(panelShellStyles.diagnostics, stylex.defaultMarker())}
                        data-workspace-panel-diagnostics={kind}
                    >
                        <summary {...stylex.props(panelShellStyles.diagnosticsSummary)}>Diagnostics</summary>
                        <div className="flex-container flexFlowColumn gap4">
                            <div className="flex-container justifyspacebetween alignitemscenter gap8">
                                <span>Status</span>
                                <span
                                    {...stylex.props(
                                        workspacePanelStyles.statusBadge,
                                        status === 'loading' ? workspacePanelStyles.statusBadgeLoading : status === 'error' ? workspacePanelStyles.statusBadgeError : null,
                                    )}
                                    data-workspace-panel-status={status}
                                >{status}</span>
                            </div>
                            {slots.length > 0 ? (
                                <div className="flex-container flexFlowColumn gap4" data-workspace-legacy-slots={kind}>
                                    {slots.map(slot => {
                                        return (
                                            <div
                                                key={slot.id}
                                                {...stylex.props(workspacePanelStyles.legacySlot)}
                                                data-workspace-legacy-slot={slot.id}
                                                data-workspace-legacy-slot-ready={slot.ready ? 'true' : 'false'}
                                            >
                                                <span>{slot.label}</span>
                                                <span
                                                    {...stylex.props(
                                                        workspacePanelStyles.legacySlotStatus,
                                                        slot.ready ? workspacePanelStyles.legacySlotStatusReady : workspacePanelStyles.legacySlotStatusPending,
                                                    )}
                                                    data-workspace-panel-legacy-ready={slot.ready ? 'true' : 'false'}
                                                >
                                                    {slot.ready ? 'Ready' : 'Legacy'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </div>
                    </details>
                ) : null}
            </div>
        </section>
    );
}
