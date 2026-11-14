import { Fragment, useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { MainChatCommands } from '../../compat/workspace-commands';
import { getMainChatStore, type MainChatSnapshot } from '../../stores/main-chat-store';
import { MainChatMessageRow } from './MainChatMessageRow';
import { MainChatGreetingPicker } from './MainChatGreetingPicker';
import { useMainChatHotkeys } from './useMainChatHotkeys';
import { TurnSummaryCard } from './TurnSummaryCard';
import { projectChatTurnCards } from '../../../public/scripts/chat-turn-card-projection.js';

const EMPTY_TURN_SUMMARIES: NonNullable<MainChatSnapshot['turnSummaries']> = [];

export function MainChatMessageListWorkspacePanel({
    commands,
}: {
    commands?: MainChatCommands;
}) {
    const mainChatStore = getMainChatStore();
    const mainChatStoreSnapshot = useSyncExternalStore(
        mainChatStore.subscribe,
        mainChatStore.getState().getSnapshot,
        mainChatStore.getState().getSnapshot,
    );
    const snapshot = mainChatStoreSnapshot;
    useMainChatHotkeys({ snapshot, commands });
    const messageIds = mainChatStoreSnapshot.window.visibleMessageIds.length > 0
        ? mainChatStoreSnapshot.window.visibleMessageIds
        : mainChatStoreSnapshot.orderedMessageIds;
    const messages = useMemo(() => messageIds
        .map(messageId => mainChatStoreSnapshot.messagesById[messageId])
        .filter((message): message is NonNullable<typeof message> => Boolean(message)), [messageIds, mainChatStoreSnapshot]);
    // Turn-summary display projection: covered ids collapse into a card at the
    // anchor position; expanded cards keep the card header and render the
    // covered rows underneath. Auto-refill is authoritative in the legacy
    // reconcile (status flip reintroduces raw rows on the next snapshot).
    const [expandedTurnKeys, setExpandedTurnKeys] = useState<ReadonlySet<string>>(() => new Set());
    const turnSummaries = mainChatStoreSnapshot.turnSummaries ?? EMPTY_TURN_SUMMARIES;
    const turnSummaryByAnchor = useMemo(() => {
        const map = new Map<string, (typeof turnSummaries)[number]>();
        const visibleIds = new Set(messages.map(message => message.id));
        for (const entry of turnSummaries) {
            // Anchor at the first covered message that is actually rendered —
            // the record's coveredMessageIds[0] can sit outside the current
            // window slice, which would hide the card entirely.
            const anchor = entry.coveredMessageIds.find(id => visibleIds.has(id));
            if (anchor !== undefined) {
                map.set(anchor, entry);
            }
        }
        return map;
    }, [turnSummaries, messages]);
    const coveredMessageIds = useMemo(() => {
        const ids = new Set<string>();
        for (const entry of turnSummaries) {
            for (const coveredId of entry.coveredMessageIds) {
                ids.add(coveredId);
            }
        }
        return ids;
    }, [turnSummaries]);
    // Drop expansion state for turn keys that no longer resolve (chat switch,
    // summary removal) so stale keys cannot leak into another chat's cards.
    const expandedActiveTurnKeys = useMemo(() => {
        const validKeys = new Set(turnSummaries.map(entry => entry.turnKey));
        const pruned = new Set<string>();
        for (const key of expandedTurnKeys) {
            if (validKeys.has(key)) {
                pruned.add(key);
            }
        }
        return pruned;
    }, [expandedTurnKeys, turnSummaries]);
    // Rows a collapsed turn summary replaces on screen: these render as the
    // summary card (anchor) or not at all (remaining covered rows).
    const collapsedMessageIds = useMemo(() => {
        const ids = new Set<string>();
        for (const message of messages) {
            if (!coveredMessageIds.has(message.id)) {
                continue;
            }
            const turnSummary = turnSummaryByAnchor.get(message.id);
            if (turnSummary) {
                if (!expandedActiveTurnKeys.has(turnSummary.turnKey)) {
                    ids.add(message.id);
                }
                continue;
            }
            const owner = turnSummaries.find(entry => entry.coveredMessageIds.includes(message.id));
            if (owner && !expandedActiveTurnKeys.has(owner.turnKey)) {
                ids.add(message.id);
            }
        }
        return ids;
    }, [messages, coveredMessageIds, turnSummaryByAnchor, turnSummaries, expandedActiveTurnKeys]);
    // Card entries mirror the render order exactly, so a summary header and the
    // rows it reintroduces resolve to one card instead of two. Every message
    // stays a direct `.mes` child; the card is styling metadata only.
    const cardEntries = useMemo(() => {
        const entries: Array<{ id: string; kind?: 'summary'; role?: string; rootClassNames?: readonly string[]; expanded?: boolean }> = [];
        for (const message of messages) {
            const turnSummary = turnSummaryByAnchor.get(message.id);
            if (collapsedMessageIds.has(message.id)) {
                if (turnSummary) {
                    entries.push({ id: `summary:${turnSummary.turnKey}`, kind: 'summary', expanded: false });
                }
                continue;
            }
            if (turnSummary) {
                entries.push({ id: `summary:${turnSummary.turnKey}`, kind: 'summary', expanded: true });
            }
            entries.push({ id: message.id, role: message.role, rootClassNames: message.rootClassNames });
        }
        return entries;
    }, [messages, turnSummaryByAnchor, collapsedMessageIds]);
    const turnCardByEntryId = useMemo(() => projectChatTurnCards(cardEntries), [cardEntries]);
    const handleTurnSummaryToggle = useCallback((turnKey: string, expanded: boolean) => {
        setExpandedTurnKeys(current => {
            const next = new Set(current);
            if (expanded) {
                next.add(turnKey);
            } else {
                next.delete(turnKey);
            }
            return next;
        });
    }, []);
    return (
        <>
            {/* Message-row controls render as native <button> elements carrying
                the legacy icon classes; reset the UA button chrome those classes
                never specified (.menu_button provides its own background/border,
                so only appearance is reset). */}
            <style>{`
button.mes_button {
    -webkit-appearance: none;
    appearance: none;
    background: none;
    border: none;
}

button.menu_button {
    -webkit-appearance: none;
    appearance: none;
}
`}</style>
            {snapshot.window.showMoreVisible ? (
                <button
                    type="button"
                    id="show_more_messages"
                    data-main-chat-windowing-owner="react"
                    data-main-chat-load-more-owner="react"
                    onClick={event => {
                        event.stopPropagation();
                        void commands?.loadMoreMessages();
                    }}
                >
                    Show more messages
                </button>
            ) : null}
            <MainChatGreetingPicker key={mainChatStoreSnapshot.greetings.chatId} greetings={mainChatStoreSnapshot.greetings} commands={commands} />
            {messages.map(message => {
                const turnSummary = turnSummaryByAnchor.get(message.id);
                if (collapsedMessageIds.has(message.id)) {
                    // Collapsed turn: the anchor renders the card, every other
                    // covered row disappears behind it.
                    return turnSummary ? (
                        <TurnSummaryCard
                            key={`summary:${turnSummary.turnKey}`}
                            summary={turnSummary}
                            expanded={false}
                            turnCard={turnCardByEntryId.get(`summary:${turnSummary.turnKey}`)}
                            onToggle={handleTurnSummaryToggle}
                        />
                    ) : null;
                }
                return (
                    <Fragment key={message.uid || message.id}>
                        {turnSummary ? (
                            <TurnSummaryCard
                                summary={turnSummary}
                                expanded={true}
                                turnCard={turnCardByEntryId.get(`summary:${turnSummary.turnKey}`)}
                                onToggle={handleTurnSummaryToggle}
                            />
                        ) : null}
                        <MainChatMessageRow
                            message={message}
                            commands={commands}
                            isLast={message.id === messageIds.at(-1)}
                            turnCard={turnCardByEntryId.get(message.id)}
                        />
                    </Fragment>
                );
            })}
        </>
    );
}
