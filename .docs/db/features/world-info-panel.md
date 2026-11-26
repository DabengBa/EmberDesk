---
id: feature.world_info_panel
type: feature
name: World Info Panel
related: [page.chat_workspace, feature.world_book_delete, feature.character_delete, feature.character_text_replace]
---

# Feature: World Info Panel

## ID 解释

`feature.world_info_panel` represents the user-facing World Info drawer inside [Chat Workspace](page.chat_workspace). It covers selecting global worlds, opening the World Info editor, and managing visible world-book entries. It does not cover scanning internals, token budgeting, storage, or transport details.

## Purpose

Keep World Info/lorebook activation and editing available inside the chat workspace through visible selectors, entry cards, editor controls, and import/export actions.

## User-Visible Contract

- The World Info drawer belongs to [Chat Workspace](page.chat_workspace); users activate global worlds and edit books without leaving the main shell.
- Opening World Info respects already locked workspace drawers. A locked Character Management panel remains visible while World Info opens, so users can compare character details and lorebook state side by side.
- Global world activation and editor selection are independent: selecting a world to edit does not make it globally active.
- Character-specific activation is managed in the character authoring footer's searchable World Info dialog. It offers one primary book that travels with the card and multiple local auxiliary books, with clear actions. Those choices do not change global activation or editor selection, and a dialog opened for another character or an earlier create session rejects stale actions visibly.
- Empty states are explicit: no global world, no selected editor world, no entries, and no embedded character book show clear feedback rather than stale content.
- Embedded book import confirms the link only after the book and the character's primary binding are saved. If the book saves but the binding fails, the import reports that the book was saved without being linked.
- The editor toolbar exposes search, sort, create, import, export, rename, duplicate, delete, refresh, backfill, and apply-sorting actions when valid for the selected world. Entry rows provide scannable summaries and open focused editing.
- File import accepts supported JSON, lorebook, and PNG files through the toolbar or drop target; it blocks duplicate starts, shows progress and conflict decisions, and restores normal controls after success, skip, cancellation, parse failure, or failed transfer.
- Importing from a file, link, or character card sets imported entries' position to **World Info**. When triggered, they use the preset's **World Info** slot. Users may select **At Depth** manually afterward; other books are unchanged.
- Desktop shows the entry list and editor side by side. Mobile uses list/editor navigation with one scrolling area and restores list position and focus on return.
- Entry editing uses progressive disclosure: identity and trigger mode, trigger keywords, plain injection content, then a placement grid for position, depth, order, and probability. Entry enablement lives only on the list row switch, which acts immediately and persists without reselecting the entry; the editor has no second switch.
- Retired timing, automation, outlet, advanced-shell, group-scoring, case-sensitivity, whole-word, recursion, and secondary-keyword controls are no longer offered. Stored legacy values remain losslessly preserved through import/export and save for compatibility, but no longer affect activation: scanning is one non-recursive pass over the configured scan depth with whole-word, case-insensitive primary-key matching by default. Outlet-position entries fold into the merged World Info block and their macros resolve to empty strings.
- The only global scan setting left is Scan Depth, shown as a plain number beside global activation. Speaker names are not prepended to scanned messages.
- A failed entry save retains the local draft, shows a failed state, and offers retry rather than claiming success. Rapid book switching never shows a late result from the previous selection or applies an old edit to a same-numbered entry in another book. Field edits and bulk changes preserve earlier successful changes to that book.
- Keyword editing preserves complete regex expressions including commas inside the expression through save and reload. Pending keyword input reports unsaved changes and guards unload/navigation; Enter, comma, or blur commits it.
- Batch import conflicts show file-to-book mappings with an expandable complete list. Overwrite, ask individually, skip conflicts, and cancel the entire batch remain distinct choices; Escape/close cancels before imports start.
- Book and entry dialogs support keyboard navigation and return focus when dismissed. Cancel leaves the pending operation unapplied; a failed book deletion reports the error and leaves the book available.
- Move/copy actions require a labeled target world and stay disabled until a valid destination is selected. Sorting labels follow the active locale.
- Global activation offers a searchable checkbox picker, an activation count, and selected-book chips with separate open and remove actions plus Clear all. Consecutive choices keep the picker open. Opening a chip edits that book without changing activation; removing or clearing activation does not switch the editor. Keyboard users can open, search, and toggle. Long names wrap, and empty lists/searches show explicit feedback. The book header keeps new/import/refresh available, offers a per-book “make global” control, and keeps search/sort/create/multi-select in the entry-list header.
- Creating, importing, renaming, or deleting a book updates global and editor choices. Renaming an active book keeps its activation; deleting a book removes its activation. A failed list refresh keeps existing choices rather than showing an empty library. Confirmed deletion clears references even if a later refresh fails; a confirmed rename keeps the new book active and selected despite a failed follow-up refresh, without losing unrelated activations made while the rename was pending.
- A book bound to the active character can also be text-replaced through [Character Text Replace](feature.character_text_replace): that flow edits the shared book, warns when other cards use it, then refreshes the card's embedded snapshot. Entry edits made here remain visible afterward.
- Internal cutover labels never appear in the drawer; users see World Info readiness and task results.
- Entry-state controls offer normal and constant only. Legacy vectorized values remain lossless compatibility fields, not a usable capability.

## Semantic Interaction IDs

- `feature.world_info_panel`: the complete World Info drawer and editor surface.
- `feature.world_info_panel.global_selector`: the Global World Info selector and its empty-state prompt.
- `feature.world_info_panel.editor_selector`: the World Info Editor selector that chooses which world book is edited.
- `feature.world_info_panel.toolbar`: editor actions for search, sort, create, import, export, rename, duplicate, delete, refresh, backfill, and apply sorting.
- `feature.world_info_panel.entry_card`: entry-list rows and their selection/edit affordance; the workbench uses list/editor panes rather than expanded legacy cards.
- `feature.world_info_panel.content_editor`: the plain `注入内容` textarea saves `content` after a short typing debounce or on blur. Unsaved and in-flight edits guard browser unload and block entry/book navigation until saved; failures retain the draft for retry. The macro chips and expand modal are retired, and legacy entry-template modal markup remains only as inert compat host markup.
- `feature.world_info_panel.react_host`: sole-visible workbench owner for global summary, editor-book header, entry list/editor, and import/export/refresh actions; a missing build fails closed rather than restoring a legacy editor.

## Acceptance Workflows

- As a lorebook user who wants context in all chats, open the World Info drawer from [Chat Workspace](page.chat_workspace), search and check multiple global books, open one selected chip in the editor, remove one activation, and clear the rest; EmberDesk must keep editor selection independent, show the activation count, and retain saved activation after reload. Create, import, rename, and delete must keep choices current. Failure is stale names, lost unrelated activations, editor selection silently activating global context, or stale entries after selection clears.
- As a user associating books with a character, choose a primary book and local auxiliary books in the authoring footer, then clear either association; reopening must reflect the intended card's choices without changing global activation. An old dialog or delayed save must not apply to a newly selected character or create session.
- As a user editing entries, choose a world, search or sort entries, and open one in the editor pane; EmberDesk must show that world's entries, keep toolbar actions scoped to it, preserve loading/empty/editing states after refresh or reopen, and never misreport a failed save as success.
- As a user importing files, use the toolbar or drop target, resolve conflicts, optionally cancel remaining batch work, and review the result; EmberDesk must show progress, block duplicate starts, summarize imported/failed/skipped/unprocessed counts, and restore controls after completion or failure. Failure is duplicate picker opens, raw errors as primary feedback, or hidden conflict choices.
- As a user importing embedded lorebook data from a selected character, retry manually if no book exists; EmberDesk must either import and show the world or report an informational no-book state, not a silent no-op.
- As a user comparing a character with its lorebook, lock Character Management then open World Info; both panels must remain visible and usable. Failure is the character panel disappearing or a return to global loading.
- As a user switching between books with the same entry numbers, edit an entry, switch books, and continue; a late result must not change the newly selected book. After a failed save, the draft must remain for retry and a successful retry must survive reload.
- As a user editing regex keywords and multiple entries, enter a regex with a comma, apply a bulk enable/disable action, and reload; the complete regex and successful bulk changes must remain intact.

## Failure Signals

- Global activation and editor selection are coupled without intent.
- Empty states leave stale entries visible.
- Import starts twice, loses progress, or fails without a recoverable reason.
- Batch conflict decisions are hidden or applied differently from the user's choice.
- Opening World Info closes a locked Character Management panel or strands the shell in global loading.
- Two visible owners appear for selectors, toolbar, list, or editor.
- A late selection or save targets another book, bulk changes erase successful edits, or a failed save discards its retryable draft.
- Mobile navigation makes the editor unreachable or loses list position/focus on return.

## Boundaries

- Destructive world-book deletion belongs to [Delete World Book](feature.world_book_delete).
- Character deletion and character-owned World Info cascade choices belong to [Delete Character](feature.character_delete).
- Character cards belong to [Character Card](term.character_card).
- Entry scanning, prompt injection, token budgeting, and persistence are implementation concerns outside this semantic feature.
