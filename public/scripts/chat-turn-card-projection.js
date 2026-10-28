/**
 * Card entry ordered as rendered inside `#chat`: either a message row or the
 * turn-summary header that replaces/reintroduces a summarized turn.
 * `rootClassNames` is the row's own class list; `hidden` marks a row the
 * stylesheet removes from layout (a folded reply pipeline); it still occupies
 * its place in the list but must not take a card corner. `expanded` on a
 * summary marks whether its covered rows follow it.
 * @typedef {{id: string, kind?: 'message'|'summary', role?: string, rootClassNames?: readonly string[], hidden?: boolean, expanded?: boolean}} ChatTurnCardEntry
 */

const HIDDEN_CLASS = 'replyPipelineHidden';

/**
 * Rows carrying the hidden marker are styled `display: none` by the
 * stylesheet, so they occupy no space in the card.
 * @param {ChatTurnCardEntry} entry
 */
function isHidden(entry) {
    return entry.hidden === true || entry.rootClassNames?.includes(HIDDEN_CLASS) === true;
}

/**
 * Only two things open a card: a user row (the turn's author) and an expanded
 * summary header (the summarized turn's visual head). Any other row continues
 * the group opened before it, including a leading fragment whose user row sits
 * outside the rendered window and is never left loose.
 *
 * A collapsed summary opens its own card; the rows it hides are not rendered,
 * so any leftover row of the same turn continues that card while the next
 * turn's user row starts a new one.
 * @param {ChatTurnCardEntry[]} entries
 * @param {number} index
 */
function startsTurnCard(entries, index) {
    const entry = entries[index];
    if (entry.kind === 'summary') {
        return true;
    }
    if (entry.role !== 'user') {
        return false;
    }
    // The user row directly under an expanded summary is one of the rows that
    // summary reintroduced, not a new turn.
    const previous = entries[index - 1];
    return !(previous?.kind === 'summary' && previous.expanded === true);
}

/**
 * Assign every rendered entry to the card it belongs to. The rendered window is
 * authoritative: rows before its first user row still form one card, so a turn
 * truncated by windowing or summary folding never scatters into loose rows.
 *
 * Positions are computed over VISIBLE entries only, so rows hidden by
 * `display: none` (for example a folded reply pipeline) cannot consume the
 * start/end slots that control the card's rounded corners.
 *
 * @param {ChatTurnCardEntry[]} entries Rendered card entries, in DOM order
 * @returns {Map<string, {turnId: string, position: 'single'|'start'|'middle'|'end'}>}
 */
export function projectChatTurnCards(entries) {
    const assignments = new Map();
    let start = 0;
    while (start < entries.length) {
        let end = start + 1;
        while (end < entries.length && !startsTurnCard(entries, end)) {
            end += 1;
        }
        // The card is named after the entry that visually opens it; for a
        // window-truncated fragment that is the first row still on screen.
        const turnId = entries[start].id;
        const visible = [];
        for (let index = start; index < end; index += 1) {
            if (!isHidden(entries[index])) {
                visible.push(index);
            }
        }
        // A card made only of hidden rows keeps its slots so it stays styled
        // if the rows become visible again.
        if (visible.length === 0) {
            for (let index = start; index < end; index += 1) {
                visible.push(index);
            }
        }
        const positions = new Map();
        for (let slot = 0; slot < visible.length; slot += 1) {
            const position = visible.length === 1 ? 'single'
                : slot === 0 ? 'start'
                    : slot === visible.length - 1 ? 'end' : 'middle';
            positions.set(visible[slot], position);
        }
        let lastPosition = null;
        for (let index = start; index < end; index += 1) {
            const position = positions.get(index);
            if (position !== undefined) {
                lastPosition = position;
            } else {
                // A hidden row paints nothing, so it borrows its neighbour's
                // corner instead of spending one on a row nobody can see.
                lastPosition ??= positions.get(visible[0]);
            }
            assignments.set(entries[index].id, { turnId, position: lastPosition });
        }
        start = end;
    }
    return assignments;
}
