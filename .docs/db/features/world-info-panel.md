---
id: feature.world_info_panel
type: feature
name: World Info Panel
related: [page.chat_workspace, feature.world_book_delete, feature.character_delete]
---

# Feature: World Info Panel

## ID 解释

`feature.world_info_panel` represents the user-facing World Info drawer inside [Chat Workspace](page.chat_workspace). It covers selecting global worlds, opening the World Info editor, managing visible world-book entries, and using the content editor dialog. It does not describe world scanning algorithms, token budgeting internals, storage files, or API implementation details.

## Feature Purpose

This feature lets users keep lorebook context close to the chat workspace: they can activate global world info, choose a world book to edit, search and sort entries, and open individual entries without leaving the main browser shell.

## Trigger Entry

- **Drawer entry**: open the World Info drawer from the chat workspace.
- **Global activation entry**: use the Global World Info multi-select to choose one or more worlds active in all chats.
- **Editor entry**: select a world from the World Info Editor panel.
- **Entry edit entry**: open an entry card or its content editor modal.

## Interaction IDs

- `feature.world_info_panel`: the complete World Info drawer and editor surface.
- `feature.world_info_panel.global_selector`: the Global World Info selector and its empty-state prompt.
- `feature.world_info_panel.editor_selector`: the World Info Editor selector that chooses which world book is being edited.
- `feature.world_info_panel.toolbar`: the editor toolbar for search, sort, create, import, export, rename, duplicate, delete, refresh, backfill, and apply-sorting actions.
- `feature.world_info_panel.entry_card`: the collapsed entry-card list and per-entry expansion/edit affordance.
- `feature.world_info_panel.content_editor`: the modal dialog for editing entry content.
- `feature.world_info_panel.react_host`: the guarded React host/action surface that can mirror world selection, search/sort, import/export, refresh, and entry shortcuts while delegating behavior to the established World Info controls.

## User Flow

1. The user opens the World Info drawer from the main workspace.
2. EmberDesk shows a Global World Info panel and a World Info Editor panel.
3. In the global panel, the user can select zero or more worlds that remain active across chats. When no global world is active, the selector shows an empty prompt.
4. In the editor panel, the user selects a world book to inspect or modify.
5. EmberDesk shows editor controls for searching, sorting, creating, importing, exporting, renaming, duplicating, deleting, refreshing, backfilling metadata, and applying sorting. When one or more files are being imported, the import action is disabled and shows visible in-progress feedback until the active import batch finishes.
6. World entries appear as cards so the user can scan the list before expanding or editing a specific entry.
7. When entry content needs more room, the content editor opens as a modal dialog with its own title, metadata, close control, and text area.
8. In builds where the guarded React migration flag is enabled, the drawer can show a React host above the legacy editor. The host reports selector/import/drop-target readiness, shows the selected world and entry counts, and exposes world selection, search, sort, create, import, export, refresh, and entry shortcut controls that dispatch to the existing World Info action chain.

## Business Rules And Boundaries

- The drawer belongs to the chat workspace; users should not need a separate route to activate or edit World Info.
- Global world activation and editor selection are separate controls because selecting a world for editing does not automatically mean it is globally active.
- The World Info drawer can stay open alongside other workspace context, but its own panels and dialogs own their visible loading, empty, and editing states.
- The toolbar import action accepts one or more `.json`, `.lorebook`, or `.png` files from the file picker, and the World Info editor panel accepts dropped files through the same import queue. A batch imports up to 50 supported files; unsupported extensions and extra files are skipped with visible feedback.
- The toolbar import action prevents duplicate file-picker opens while an import batch is active; file parsing, conversion, overwrite checks, upload, success, skip, cancellation, and failure paths all restore the action to its normal state.
- Single-file import shows the detected source format and entry count when available so overwrite decisions and successful outcomes have visible context.
- Batch import processes files sequentially because each successful file can refresh the World Info selector and switch the editor to the imported world.
- When a batch contains files that would overwrite existing World Info names, EmberDesk asks once whether to overwrite all conflicts, skip all conflicts, or confirm each conflict individually.
- Import errors distinguish unsupported formats, damaged or incomplete files, PNG files without importable World Info data, oversized uploads, and connection/import failures when EmberDesk can identify the cause.
- Embedded World/Lorebook import is a toolbar-adjacent character action: if a selected character has no embedded book data, EmberDesk reports that empty state instead of silently doing nothing.
- Destructive world-book deletion is a separate semantic feature: [Delete World Book](feature.world_book_delete).
- Character deletion may also delete selected world info files through its cascade section, but that destructive flow belongs to [Delete Character](feature.character_delete).
- The guarded migration host is additive. If the migration flag is off, no extra World Info host is inserted; if the bundle cannot mount, the legacy controls remain the behavior owner. The React host owns its visible selection/search/sort/action controls, but it delegates to existing controls for the actual World Info action chain and does not replace global activation, import parsing, regex placement, prompt activation, converter/import result semantics, or world-book deletion behavior.
- Entry scanning, prompt injection, token budget calculations, server endpoints, and persistence details are outside this semantic ID.

## Outcomes

- **Global selection changed**: selected worlds are reflected in the global selector labels and workspace state.
- **Editor selected**: the editor panel shows the selected world book's entries and toolbar actions.
- **Entry opened**: the selected entry expands or opens the content editor dialog for focused editing.
- **Empty state**: if no global worlds or editor world are selected, the panel communicates that state without leaving stale entry content visible.
- **Import in progress**: the import action is visibly busy, duplicate import starts are blocked, batch progress shows the current file position, and the action is restored after success, skip, cancellation, parse failure, or network failure.
- **Import decision shown**: when an import would overwrite an existing world, the confirmation includes the detected format, available entry count, and action-specific overwrite/cancel choices.
- **Batch import decision shown**: when multiple selected files would overwrite existing worlds, the batch conflict summary lets the user overwrite all conflicts, skip all conflicts, or fall back to individual overwrite confirmations.
- **Import completed**: successful imports report the imported format and available entry count, then make the automatic switch to the imported World Info visible to the user.
- **Batch import completed**: after the queue ends, EmberDesk reports aggregate imported, failed, skipped, and unprocessed counts without listing a long file inventory.
- **Batch import cancelled**: cancelling remaining files from the progress toast lets the active file finish and leaves later files unprocessed in the final summary.
- **Import failed**: failed imports show a recoverable reason instead of exposing raw technical error text as the primary message.
- **No embedded book**: trying to import embedded World/Lorebook data from a selected character without embedded data produces an informational message.
- **Deletion requested**: the user is routed into the separate [Delete World Book](feature.world_book_delete) confirmation flow.
- **Migration host/action island shown**: when the guarded host is enabled, it reports selector/import/drop-target readiness and exposes React-owned world selection, search/sort, create/import/export/refresh, and entry shortcut controls while preserving the legacy action chain that completes the World Info workflow.
