import type { KeyboardEvent } from 'react';
import type { MainChatTurnSummaryRecord } from '../../stores/main-chat-store';
import { translate, useTranslated } from '@/compat/i18n.js';

// Native buttons dispatch their own click for Enter/Space; keep those keydowns
// from reaching the document-level interactable shim (public/scripts/keyboard.js).
const stopActivationKeyPropagation = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.stopPropagation();
    }
};

/**
 * Collapsed representation of a summarized conversation turn in the main
 * chat list. The covered original messages are hidden while collapsed and
 * rendered as ordinary rows below the card when expanded — expanding never
 * mutates the canonical chat.
 */
export function TurnSummaryCard({
    summary,
    expanded,
    onToggle,
}: {
    summary: MainChatTurnSummaryRecord;
    expanded: boolean;
    onToggle: (turnKey: string, expanded: boolean) => void;
}) {
    useTranslated('');
    const toggle = () => onToggle(summary.turnKey, !expanded);
    return (
        <div
            className={`turn-summary-row${expanded ? ' turn-summary-row-expanded' : ''}`}
            data-turn-summary={summary.turnKey}
            data-main-chat-message-row-owner="react"
        >
            <button
                type="button"
                className="turn-summary-pill"
                onClick={toggle}
                onKeyDown={stopActivationKeyPropagation}
                aria-expanded={expanded}
                title={expanded
                    ? translate('Click to collapse the original text of this turn')
                    : `${summary.text}\n\n${translate('(click to expand ${0} original messages)').replace('${0}', String(summary.coveredMessageIds.length))}`}
            >
                <span className="turn-summary-tag">{translate('Turn ${0}').replace('${0}', String(summary.turnIndex + 1))}</span>
                {summary.manual ? <span className="turn-summary-badge">{translate('Handwritten')}</span> : null}
                {summary.stale ? <span className="turn-summary-badge turn-summary-badge-stale">{translate('Changed')}</span> : null}
                <span className="turn-summary-text">{summary.text || translate('Summarizing…')}</span>
                <span className="turn-summary-action">
                    {expanded ? translate('Collapse') : translate('${0} msgs').replace('${0}', String(summary.coveredMessageIds.length))}
                    <i className={`fa-solid ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true" />
                </span>
            </button>
        </div>
    );
}
