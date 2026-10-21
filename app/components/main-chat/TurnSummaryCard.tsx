import type { KeyboardEvent } from 'react';
import type { MainChatTurnSummaryRecord } from '../../stores/main-chat-store';

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
                title={expanded ? '点击收起该轮原文' : `${summary.text}\n\n（点击展开 ${summary.coveredMessageIds.length} 条原文）`}
            >
                <span className="turn-summary-tag">第 {summary.turnIndex + 1} 轮</span>
                {summary.manual ? <span className="turn-summary-badge">手写</span> : null}
                {summary.stale ? <span className="turn-summary-badge turn-summary-badge-stale">已变动</span> : null}
                <span className="turn-summary-text">{summary.text || '摘要生成中…'}</span>
                <span className="turn-summary-action">
                    {expanded ? '收起' : `${summary.coveredMessageIds.length}条`}
                    <i className={`fa-solid ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true" />
                </span>
            </button>
        </div>
    );
}
