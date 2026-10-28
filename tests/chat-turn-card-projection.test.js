import { describe, expect, test } from '@jest/globals';
import { projectChatTurnCards } from '../public/scripts/chat-turn-card-projection.js';
import { readRepoFile } from './helpers/frontend-structure-contract.js';

const row = (id, role, rootClassNames = []) => ({ id, role, rootClassNames });
// A rendered summary header is expanded unless stated otherwise: it precedes
// the covered rows it reintroduces. Collapsed summaries render alone.
const summary = (turnKey, expanded = true) => ({ id: `summary:${turnKey}`, kind: 'summary', expanded });

describe('chat turn card projection', () => {
    test('assigns the user, every tool result (including failures and pipeline), and final answer to one card', () => {
        const rows = [
            row('user', 'user'),
            row('success', 'system', ['toolCall']),
            row('failure', 'system', ['toolCall']),
            row('pipeline', 'system', ['toolCall', 'replyPipelineHidden']),
            row('answer', 'character'),
            row('next-user', 'user'),
        ];

        expect(projectChatTurnCards(rows)).toEqual(new Map([
            ['user', { turnId: 'user', position: 'start' }],
            ['success', { turnId: 'user', position: 'middle' }],
            ['failure', { turnId: 'user', position: 'middle' }],
            // A hidden row inherits the last visible slot instead of spending
            // the card's bottom corner on a row nobody can see.
            ['pipeline', { turnId: 'user', position: 'middle' }],
            ['answer', { turnId: 'user', position: 'end' }],
            ['next-user', { turnId: 'next-user', position: 'single' }],
        ]));
    });

    test('keeps a turn fragment cut off by the message window as one card', () => {
        expect(projectChatTurnCards([row('old-tool', 'system'), row('old-answer', 'character'), row('new-user', 'user'), row('new-answer', 'character')]))
            .toEqual(new Map([
                ['old-tool', { turnId: 'old-tool', position: 'start' }],
                ['old-answer', { turnId: 'old-tool', position: 'end' }],
                ['new-user', { turnId: 'new-user', position: 'start' }],
                ['new-answer', { turnId: 'new-user', position: 'end' }],
            ]));
    });

    test('ignores rows hidden by the reply pipeline when placing the card corners', () => {
        expect(projectChatTurnCards([
            row('user', 'user'),
            row('answer', 'character'),
            row('pipeline', 'system', ['replyPipelineHidden']),
        ])).toEqual(new Map([
            ['user', { turnId: 'user', position: 'start' }],
            ['answer', { turnId: 'user', position: 'end' }],
            ['pipeline', { turnId: 'user', position: 'end' }],
        ]));
    });

    test('hides a pipeline row sitting between two visible rows without shifting them', () => {
        expect(projectChatTurnCards([
            row('user', 'user'),
            row('pipeline', 'system', ['replyPipelineHidden']),
            row('answer', 'character'),
        ])).toEqual(new Map([
            ['user', { turnId: 'user', position: 'start' }],
            ['pipeline', { turnId: 'user', position: 'start' }],
            ['answer', { turnId: 'user', position: 'end' }],
        ]));
    });

    test('anchors an expanded turn summary as the card head above its original rows', () => {
        expect(projectChatTurnCards([
            summary('t1'),
            row('user', 'user'),
            row('tool', 'system'),
            row('answer', 'character'),
        ])).toEqual(new Map([
            ['summary:t1', { turnId: 'summary:t1', position: 'start' }],
            ['user', { turnId: 'summary:t1', position: 'middle' }],
            ['tool', { turnId: 'summary:t1', position: 'middle' }],
            ['answer', { turnId: 'summary:t1', position: 'end' }],
        ]));
    });

    test('merges a collapsed summary with the rest of its rendered turn into one card', () => {
        expect(projectChatTurnCards([
            summary('t1', false),
            row('answer', 'character'),
            row('next-user', 'user'),
        ])).toEqual(new Map([
            ['summary:t1', { turnId: 'summary:t1', position: 'start' }],
            ['answer', { turnId: 'summary:t1', position: 'end' }],
            ['next-user', { turnId: 'next-user', position: 'single' }],
        ]));
    });

    test('renders a fully collapsed summary as its own single card', () => {
        expect(projectChatTurnCards([summary('t1', false), row('next-user', 'user')])).toEqual(new Map([
            ['summary:t1', { turnId: 'summary:t1', position: 'single' }],
            ['next-user', { turnId: 'next-user', position: 'single' }],
        ]));
    });

    test('marks original message rows for one shared card without a wrapper or moved body', () => {
        const panel = readRepoFile('app/workspace-panels.tsx');
        const row = readRepoFile('app/components/main-chat/MainChatMessageRow.tsx');
        const styles = readRepoFile('public/style.css');

        expect(panel).toContain('projectChatTurnCards(cardEntries)');
        expect(row).toContain('data-turn-card={turnCard?.turnId}');
        expect(row).toContain('data-turn-card-position={turnCard?.position}');
        expect(styles).toContain('#chat > .mes[data-turn-card]');
        expect(styles).toContain('#chat > .mes[data-turn-card] .mes_block');
        expect(styles).toContain('#chat > .mes[data-turn-card-position="middle"],\n#chat > .mes[data-turn-card-position="end"] {\n    margin-top: -2px;');
        expect(row).not.toContain('toolAuxiliaryHtml');
        expect(panel).not.toContain('toolAuxiliaryHtml');
    });

    test('keeps the delete-mode selection highlight visible inside a turn card', () => {
        const styles = readRepoFile('public/style.css');
        const legacy = styles.slice(styles.indexOf('#chat .mes.selected'));
        const legacyBlock = legacy.slice(legacy.indexOf('{') + 1, legacy.indexOf('}'));
        const cardSurface = styles.slice(styles.indexOf('#chat > .mes[data-turn-card]'), styles.indexOf('#chat > .turn-summary-row[data-turn-card]'));

        // The batch-selection highlight is the legacy rule; it keeps painting
        // because the card surface never targets a selected row.
        expect(legacyBlock).toContain('--SmartThemeQuoteColor');
        for (const selector of ['#chat > .mes[data-turn-card]:not(.selected) {',
            '#chat > .mes[data-turn-card]:not(.selected):hover,',
            '#chat > .mes[data-turn-card]:not(.selected):focus-within {']) {
            expect(styles).toContain(selector);
        }
        expect(styles).not.toContain('#chat > .mes[data-turn-card] {\n    background-color');

        // Corner geometry must stay out of the :not(.selected) rule: painting
        // it there gave the `:not(.selected)` background selector a higher
        // specificity than the position selectors, so every row rendered four
        // square corners in the browser.
        const unselectedRule = cardSurface.slice(cardSurface.indexOf('#chat > .mes[data-turn-card]:not(.selected) {'));
        expect(unselectedRule.slice(0, unselectedRule.indexOf('}'))).not.toContain('border-radius');

        // Every corner slot therefore has to carry [data-turn-card] to out-rank
        // that background rule, or the rounding silently disappears again.
        for (const position of ['single', 'start', 'end']) {
            const selector = `#chat > .mes[data-turn-card][data-turn-card-position="${position}"]`;
            expect(styles).toContain(selector);
        }
        expect(styles).toContain('#chat > .turn-summary-row[data-turn-card][data-turn-card-position="end"]');
    });

    test('styles the turn summary header as part of the shared card surface', () => {
        const styles = readRepoFile('public/style.css');

        expect(styles).toContain('#chat > .turn-summary-row[data-turn-card]');
        expect(styles).toContain('#chat > .turn-summary-row[data-turn-card][data-turn-card-position="single"],\n#chat > .turn-summary-row[data-turn-card][data-turn-card-position="start"]');
    });

    test('feeds the projection the exact render order so summaries join their rows instead of a second card', () => {
        const panel = readRepoFile('app/workspace-panels.tsx');
        const entries = panel.slice(panel.indexOf('const cardEntries = useMemo('), panel.indexOf('const turnCardByEntryId = useMemo('));
        const card = readRepoFile('app/components/main-chat/TurnSummaryCard.tsx');

        // A collapsed turn renders only its summary; an expanded one renders
        // the summary header followed by the rows it reintroduces.
        expect(entries).toContain("entries.push({ id: `summary:${turnSummary.turnKey}`, kind: 'summary', expanded: false });");
        expect(entries).toContain("entries.push({ id: `summary:${turnSummary.turnKey}`, kind: 'summary', expanded: true });");
        expect(entries).toContain('entries.push({ id: message.id, role: message.role, rootClassNames: message.rootClassNames });');
        // Both summary render paths must receive the projected card.
        expect(panel.match(/turnCard=\{turnCardByEntryId\.get\(`summary:\$\{turnSummary\.turnKey\}`\)\}/g)).toHaveLength(2);
        expect(card).toContain('data-turn-card={turnCard?.turnId}');
        expect(card).toContain('data-turn-card-position={turnCard?.position}');
    });
    test('mounts the message list without a wrapper element so rows stay direct #chat children', () => {
        const panel = readRepoFile('app/workspace-panels.tsx');
        const renderCall = panel.slice(panel.indexOf('function renderIntoPanel('), panel.indexOf('function renderSettingsPanel('));

        // The Astryx Theme provider renders a div; wrapping the main chat list
        // in it demotes every .mes row to a grandchild of #chat.
        expect(renderCall).toContain("mount.kind === 'mainChatMessageList'");
        expect(renderCall).toContain(': <Theme theme={emberDeskTheme} mode="dark">{panel}</Theme>');
    });
});
