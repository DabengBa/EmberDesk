---
id: feature.world_info_panel
type: feature
name: World Info Panel
related: [page.chat_workspace, feature.world_book_delete, feature.character_delete, feature.character_text_replace]
---

# Feature: World Info Panel

## ID 解释

`feature.world_info_panel` represents the user-facing World Info drawer inside [Chat Workspace](page.chat_workspace). It covers selecting global worlds, opening the World Info editor, and managing visible world-book entries. It does not describe world scanning algorithms, token budgeting internals, storage files, or API implementation details.

## Purpose

Keep World Info/lorebook activation and editing available inside the chat workspace through visible selectors, entry cards, editor controls, and import/export actions.

## Ownership Direction

World Info is a React sole-owner surface. The React workbench owns the visible editor workflow; framework-neutral domain and workbench services own projection, selection, and entry field updates. `public/scripts/world-info.js` remains a compatibility barrel for prompt/scan, import/export, delete cascade, and internal module exports. Missing-build failures stay fail-closed and prior-version deploy is the rollback path.

## User-Visible Contract

- The World Info drawer belongs to [Chat Workspace](page.chat_workspace); users activate global worlds and edit world books without leaving the main shell.
- Opening World Info from the top bar must respect already locked workspace drawers. In particular, a locked Character Management panel remains visible while the World Info drawer opens, so users can compare character details and lorebook state side by side.
- Global world activation and editor selection are separate controls: selecting a world to edit does not automatically make it globally active.
- Character-specific activation is managed separately from the authoring footer's searchable World Info association dialog. It offers one primary book that travels with the card and multiple local auxiliary books, including clear actions. Choosing these books does not change global activation or editor selection, and a dialog opened for another character or an earlier create session must reject stale actions visibly.
- Empty states are explicit. No global world, no selected editor world, no entries, and no embedded character book should show clear feedback instead of stale content.
- The editor toolbar exposes search, sort, create, import, export, rename, duplicate, delete, refresh, backfill, and apply-sorting actions when valid for the selected world.
- Entry rows provide scannable summaries and open focused editing in the entry editor pane.
- File import accepts supported `.json`, `.lorebook`, and `.png` files through the toolbar or drop target, blocks duplicate picker starts while active, shows progress and conflict decisions, and restores normal controls after success, skip, cancellation, parse failure, or network failure.
- The React World Info workbench is the sole visible owner inside `#wi-holder`: one global-activation summary (including the Scan Depth input), one editor-book header, one entry list, and one entry editor. Hidden legacy workbench children stay inert compatibility hosts only, not a second visible control set or product fallback.
- Desktop workbench layout places entry list and current entry editor side by side; mobile uses list/editor two-state navigation with a single active scroll root and restore of list position/focus on return.
- Entry editing uses progressive disclosure: basic identity and trigger mode (keyword-trigger/always-inject segmented control), trigger keywords, a plain injection-content textarea (no macro chips or expand modal), then a stable 2×2 injection-placement grid (position, depth, order, probability %). Entry enablement lives only on the entry-list row switch — a single enlarged inline toggle per row that flips immediately on click and persists without reselecting the entry; the entry editor carries no second enable switch. The retired advanced shell is gone: no collapsed group, timing, automation, or outlet controls. Timed effects (sticky/cooldown/delay) and the automation/outlet pair are retired from the workbench; stored entry fields (`sticky`, `cooldown`, `delay`, `automationId`, `outletName`) remain lossless import/export and save compatibility fields, content is still injected when an entry activates, and outlet-position entries fold into the merged World Info block.
- The only remaining global scan setting is Scan Depth, shown as a plain number input in the global-activation summary row. The collapsible activation-rules drawer is gone. Scan behavior is fixed: entries insert sorted evenly (no character-first/global-first strategy), speaker names are not prepended to scanned messages, keyword matching is case-insensitive and whole-word by default (per-entry `caseSensitive`/`matchWholeWords` fields can still override the global default). Retired knobs (Context % / Budget Cap / Min Activations / Max Depth / Max Recursion Steps / Recursive Scan / Alert On Overflow / Use Group Scoring / Insertion Strategy / Include Names / Case-sensitive / Match Whole Words globals) are no longer rendered; stored legacy settings and entry flags (`excludeRecursion`, `preventRecursion`, `delayUntilRecursion`, `ignoreBudget`, `group`, `groupOverride`, `groupWeight`, `useGroupScoring`) remain lossless import/export and save compatibility fields but no longer affect scanning, which is a single non-recursive pass over the configured scan depth with no inclusion-group competition. Entry timed effects (sticky/cooldown/delay) are retired from scanning — they no longer suppress, re-activate, or bias entries — and the `/wi-set-timed-effect` / `/wi-get-timed-effect` slash commands are removed. Secondary keywords are retired: `keysecondary`/`selective`/`selectiveLogic` are ignored by the scan (a primary-key match activates the entry directly) and have no editor UI; the stored fields stay lossless round-trip compatibility fields without restoring the retired `/setentryfield` command. Outlet routing is retired: `position: outlet` entries fold into the merged World Info block and `{{outlet::name}}` macros resolve to empty strings. `automationId`, `outletName`, and timed-effect fields stay lossless round-trip compatibility fields on saved data.
- Entry save feedback reflects the server response: HTTP/network failures retain the local draft, display a save-failed state, and offer retry instead of reporting success.
- Rapid book switching must not display a late result from the previous selection or apply an old entry edit to a same-numbered entry in another book. Field edits and bulk changes submitted in the same workspace preserve earlier successful changes to that book rather than overwriting them with an older copy.
- Keyword editing preserves complete regex expressions, including commas inside `/.../flags`, through save and reload.
- Batch import conflicts show file-to-book mappings, with an expandable complete list beyond the first ten. Overwrite, ask individually, skip conflicts, and cancel the entire batch are distinct choices; Esc/close cancels the batch before imports start.
- Book and entry dialogs support keyboard navigation and return focus when dismissed. Cancel leaves the pending operation unapplied; a failed book deletion reports the error and leaves the book available.
- Entry move/copy actions require a labeled target world selector and remain disabled until a valid destination is selected. Sorting labels follow the active locale and warnings use theme colors.
- Global activation is a compact banner of independently toggleable world pills (plain clicks never clear other selections) plus an activation count and the Scan Depth input; the book header keeps new/import/refresh always visible, offers a per-book "make global" toggle, and keeps search/sort/create/multi-select tools inside the entry-list pane header; choosing an editor book never auto-changes global activation, and changing global activation never silently switches the editor book.
- The React host routes mutations through the World Info workbench service and compatibility barrel (`public/scripts/world-info.js`). Prompt activation, regex placement, converter/import outcomes, delete cascade, and persistence remain available through the public module path; there is no product flag that restores the legacy editor as sole visible owner.
- When the same-entry React shell is enabled, its World Info entry owns only the transient active-panel/dock state and mount status; prompt activation, regex placement, converter/import outcomes, and world-book deletion semantics remain owned by the World Info service/barrel.
- Canonical SQLite World Info authority is enabled by default; when audit-clean, the server reads and writes world books through the canonical database while `worlds/*.json` remains an export/import surface rather than a live mirror. The visible selector, editor, entry rows, prompt activation, regex placement, and import/export outcome remain the same user workflow.
- A book bound to the active character can also be text-replaced through [Character Text Replace](feature.character_text_replace): that flow edits the shared authoritative book (with a bound-character warning when other cards use it), then refills the card's embedded `character_book` snapshot; entry edits made here remain visible and the workbench remounts after such a write.
- The visible drawer should not expose internal cutover-governance labels. Users see World Info readiness and task results, while maintainer verdicts stay in tech docs.
- Entry-state controls offer normal and constant states only. Legacy `vectorized` / `extensions.vectorized` values remain lossless import/export and save compatibility fields, but are not presented as a usable World Info capability.

## Semantic Interaction IDs

- `feature.world_info_panel`: the complete World Info drawer and editor surface.
- `feature.world_info_panel.global_selector`: the Global World Info selector and its empty-state prompt.
- `feature.world_info_panel.editor_selector`: the World Info Editor selector that chooses which world book is edited.
- `feature.world_info_panel.toolbar`: editor actions for search, sort, create, import, export, rename, duplicate, delete, refresh, backfill, and apply sorting.
- `feature.world_info_panel.entry_card`: entry-list rows and their selection/edit affordance; the React workbench uses list/editor panes rather than expanded legacy cards.
- `feature.world_info_panel.content_editor`: a plain `注入内容` textarea in the React editor saves `content` on blur; the macro chips and expand modal are retired, and legacy entry-template modal markup remains only as inert compat host markup.
- `feature.world_info_panel.react_host`: sole-visible workbench owner for global summary, editor-book header, entry list/editor, and import/export/refresh actions; a missing build fails closed rather than restoring a legacy editor.

## Acceptance Workflows

- As a lorebook user who wants context active in all chats, from [Chat Workspace](page.chat_workspace) open the World Info drawer, choose global worlds, then separately select a world in the editor; EmberDesk must reflect global selections and editor content independently, refresh or reopen must not show stale entry content for an empty selection, and failure is editor selection silently activating global context or stale entries remaining after selection clears.
- As a user associating books with a character, open the character authoring footer's World Info dialog, search and choose a primary book and local auxiliary books, then clear either association; reopening must reflect the intended card's choices without changing global activation. An old dialog or delayed save must not apply its result to a newly selected character or create session.
- As a user editing world entries, from the editor selector choose a world, search or sort entries, and open an entry in the editor pane; EmberDesk must show the selected world's entries, keep toolbar actions scoped to that world, preserve clear loading/empty/editing states after refresh or reopen, and failure is entry data from a different world or a save failure misreported as success.
- As a user importing World Info files, from the toolbar or drop target import supported files, resolve overwrite conflicts, optionally cancel remaining batch work, and review the final result; EmberDesk must show busy/progress state, block duplicate starts, report detected format and entry counts when available, summarize imported/failed/skipped/unprocessed counts, and restore controls after completion or failure, with failure signaled by duplicate picker opens, raw technical errors as primary feedback, or hidden conflict choices.
- As a user importing embedded lorebook data from a selected character, from the toolbar-adjacent character action attempt import and then retry manually if no book exists; EmberDesk must either import and switch visibly to the imported world or show an informational no-embedded-book state, and failure is silent no-op.
- As a user comparing a character with its lorebook state, from [Chat Workspace](page.chat_workspace) lock Character Management, then open the World Info drawer; EmberDesk must show the World Info editor while the locked Character Management panel remains visible and usable, and failure is the character panel disappearing or the workspace returning to a global loading state.
- As a user of the World Info workbench, use selection, search/sort, create/import/export/refresh, and entry shortcuts; EmberDesk must preserve prompt activation, regex placement, import semantics, and deletion confirmation with one visible editor. Missing build assets must report failure instead of silently switching to legacy controls.
- As a user switching between books with the same entry numbers, edit an entry, switch books, and continue editing; old callbacks must not change the newly selected book. After an HTTP/network save failure, the still-open draft must remain available for retry, and a successful retry followed by reload must show the saved text.
- As a user editing regex keywords and multiple entries, enter a regex containing a comma, apply a bulk enable/disable action, and reload the book; the complete regex and all successful bulk changes must remain intact.

## Feature-Specific Evidence

- Selector labels, empty prompts, selected world title, entry cards, toolbar availability, import progress, overwrite choices, final import summary, and no-embedded-book message are primary evidence.
- Supported file extensions, batch limits, converter results, and endpoint responses are supporting evidence only when the visible import workflow matches.
- `public/scripts/world-info.js` helper routing and React host readiness markers support migration proof; they do not replace visible drawer behavior.
- Browser evidence for the locked Character Management plus World Info path should show both panels visible at the same time; DOM state such as `openDrawer` / `pinnedOpen` is supporting evidence only when the visible panels match.
- Canonical storage evidence is supporting evidence only when route payloads and visible World Info workflows remain compatible with the file-backed behavior.

## Failure Signals

- Global activation and editor selection are coupled without user intent.
- Empty states leave stale world entries visible.
- Import starts twice, loses progress feedback, or fails without a recoverable visible reason.
- Batch conflict decisions are hidden or applied differently than the user chose.
- Opening World Info closes a locked Character Management panel or strands the shell on global startup feedback.
- The workbench appears but expected World Info actions are missing or inert.
- Two visible owners appear for selector, search, sort, actions, list, or editor.
- A late selection or save targets another book, bulk changes erase successful field edits, or a failed save discards its retryable draft.
- Mobile workbench stacks list and full editor so the editor becomes unreachable, or returns from editor without restoring list focus/scroll.

## Boundaries

- Destructive world-book deletion belongs to [Delete World Book](feature.world_book_delete).
- Character deletion and character-owned World Info cascade choices belong to [Delete Character](feature.character_delete).
- Character cards belong to [Character Card](term.character_card).
- Entry scanning, prompt injection, token budgeting, persistence, and server endpoints are implementation concerns outside this semantic feature.
