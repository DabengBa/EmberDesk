---
id: feature.world_info_panel
type: feature
name: World Info Panel
related: [page.chat_workspace, feature.world_book_delete, feature.character_delete]
---

# Feature: World Info Panel

## ID 解释

`feature.world_info_panel` represents the user-facing World Info drawer inside [Chat Workspace](page.chat_workspace). It covers selecting global worlds, opening the World Info editor, managing visible world-book entries, and using the content editor dialog. It does not describe world scanning algorithms, token budgeting internals, storage files, or API implementation details.

## Purpose

Keep World Info/lorebook activation and editing available inside the chat workspace through visible selectors, entry cards, editor controls, and import/export actions.

## Approved Retirement Direction

World Info is a completed third-wave React sole-owner surface. The React workbench owns the visible editor workflow; framework-neutral domain and workbench services own projection, selection, and entry field updates. `public/scripts/world-info.js` remains a compatibility barrel for prompt/scan, import/export, delete cascade, slash commands, and supported extension exports. Product flag-off and legacy visible editor fallbacks are retired; missing-build failures stay fail-closed and prior-version deploy is the rollback path.

## User-Visible Contract

- The World Info drawer belongs to [Chat Workspace](page.chat_workspace); users activate global worlds and edit world books without leaving the main shell.
- Opening World Info from the top bar must respect already locked workspace drawers. In particular, a locked Character Management panel remains visible while the World Info drawer opens, so users can compare character details and lorebook state side by side.
- Global world activation and editor selection are separate controls: selecting a world to edit does not automatically make it globally active.
- Empty states are explicit. No global world, no selected editor world, no entries, and no embedded character book should show clear feedback instead of stale content.
- The editor toolbar exposes search, sort, create, import, export, rename, duplicate, delete, refresh, backfill, and apply-sorting actions when valid for the selected world.
- Entry cards provide scannable collapsed rows and focused editing through expansion or the content editor modal.
- File import accepts supported `.json`, `.lorebook`, and `.png` files through the toolbar or drop target, blocks duplicate picker starts while active, shows progress and conflict decisions, and restores normal controls after success, skip, cancellation, parse failure, or network failure.
- The React World Info workbench is the sole visible owner inside `#wi-holder`: one global-activation summary, one editor-book header, one entry list, and one entry editor. Hidden legacy workbench children stay inert compatibility hosts only (for example activation-rules DOM), not a second visible control set or product fallback.
- Desktop workbench layout places entry list and current entry editor side by side; mobile uses list/editor two-state navigation with a single active scroll root and restore of list position/focus on return.
- Entry editing uses progressive disclosure: basic identity and enablement, trigger keywords, primary content, injection placement, then collapsed advanced groups (timing/recursion, inclusion group, automation/outlet) that surface non-default summaries.
- Global activation remains a compact summary with a secondary activation-rules entry; choosing an editor book never auto-changes global activation, and changing global activation never silently switches the editor book.
- The React host routes mutations through the World Info workbench service and compatibility barrel (`public/scripts/world-info.js`). Prompt activation, regex placement, converter/import outcomes, delete cascade, and persistence remain available through the public module path; there is no product flag that restores the legacy editor as sole visible owner.
- When the same-entry React shell is enabled, its World Info entry owns only the transient active-panel/dock state and mount status; prompt activation, regex placement, converter/import outcomes, and world-book deletion semantics remain owned by the World Info service/barrel.
- When canonical SQLite World Info authority is enabled and audit-clean, the server may read and write world books through the canonical database while projecting compatible JSON files for import/export and rollback. The visible selector, editor, entry cards, prompt activation, regex placement, import/export outcome, and fallback controls remain the same user workflow.
- The visible drawer should not expose internal cutover-governance labels. Users see World Info readiness and task results, while maintainer verdicts stay in tech docs.
- Entry-state controls offer normal and constant states only. Legacy `vectorized` / `extensions.vectorized` values remain lossless import/export and save compatibility fields, but are not presented as a usable World Info capability.

## Semantic Interaction IDs

- `feature.world_info_panel`: the complete World Info drawer and editor surface.
- `feature.world_info_panel.global_selector`: the Global World Info selector and its empty-state prompt.
- `feature.world_info_panel.editor_selector`: the World Info Editor selector that chooses which world book is edited.
- `feature.world_info_panel.toolbar`: editor actions for search, sort, create, import, export, rename, duplicate, delete, refresh, backfill, and apply sorting.
- `feature.world_info_panel.entry_card`: collapsed entry-card list and per-entry expansion/edit affordance in the legacy path; React workbench uses the list/editor panes instead of expanded cards as the primary path.
- `feature.world_info_panel.content_editor`: modal dialog for focused entry-content editing on the legacy path; React workbench keeps primary content editing inline in the entry editor pane.
- `feature.world_info_panel.react_host`: guarded sole-visible workbench owner for global summary, editor-book header, entry list/editor, import/export/refresh actions, and fail-closed legacy fallback.

## Acceptance Workflows

- As a lorebook user who wants context active in all chats, from [Chat Workspace](page.chat_workspace) open the World Info drawer, choose global worlds, then separately select a world in the editor; EmberDesk must reflect global selections and editor content independently, refresh or reopen must not show stale entry content for an empty selection, and failure is editor selection silently activating global context or stale entries remaining after selection clears.
- As a user editing world entries, from the editor selector choose a world, search or sort entries, open an entry card, and use the content editor modal; EmberDesk must show the selected world's entries, keep toolbar actions scoped to that world, preserve clear loading/empty/editing states after refresh or reopen, and failure is entry content from a different world or a modal without a visible close/recovery path.
- As a user importing World Info files, from the toolbar or drop target import supported files, resolve overwrite conflicts, optionally cancel remaining batch work, and review the final result; EmberDesk must show busy/progress state, block duplicate starts, report detected format and entry counts when available, summarize imported/failed/skipped/unprocessed counts, and restore controls after completion or failure, with failure signaled by duplicate picker opens, raw technical errors as primary feedback, or hidden conflict choices.
- As a user importing embedded lorebook data from a selected character, from the toolbar-adjacent character action attempt import and then retry manually if no book exists; EmberDesk must either import and switch visibly to the imported world or show an informational no-embedded-book state, and failure is silent no-op.
- As a user comparing a character with its lorebook state, from [Chat Workspace](page.chat_workspace) lock Character Management, then open the World Info drawer; EmberDesk must show the World Info editor while the locked Character Management panel remains visible and usable, and failure is the character panel disappearing or the workspace returning to a global loading state.
- As a user on a build with the guarded World Info host enabled, from the host use selection, search/sort, create/import/export/refresh, and entry shortcuts; EmberDesk must produce the same visible World Info outcomes as the established controls, flag-off or mount failure must leave legacy controls as the behavior owner, and failure is a React shortcut that bypasses prompt activation, regex placement, import semantics, or deletion confirmation.

## Feature-Specific Evidence

- Selector labels, empty prompts, selected world title, entry cards, toolbar availability, content editor modal, import progress, overwrite choices, final import summary, and no-embedded-book message are primary evidence.
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
- The guarded host appears but the established World Info controls or fallback path disappear.
- Flag-on path shows two visible owners for selector, search, sort, actions, list, or editor.
- Mobile workbench stacks list and full editor so the editor becomes unreachable, or returns from editor without restoring list focus/scroll.

## Boundaries

- Destructive world-book deletion belongs to [Delete World Book](feature.world_book_delete).
- Character deletion and character-owned World Info cascade choices belong to [Delete Character](feature.character_delete).
- Character cards belong to [Character Card](term.character_card).
- Entry scanning, prompt injection, token budgeting, persistence, and server endpoints are implementation concerns outside this semantic feature.
