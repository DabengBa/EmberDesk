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

## User Flow

1. The user opens the World Info drawer from the main workspace.
2. EmberDesk shows a Global World Info panel and a World Info Editor panel.
3. In the global panel, the user can select zero or more worlds that remain active across chats. When no global world is active, the selector shows an empty prompt.
4. In the editor panel, the user selects a world book to inspect or modify.
5. EmberDesk shows editor controls for searching, sorting, creating, importing, exporting, renaming, duplicating, deleting, refreshing, backfilling metadata, and applying sorting.
6. World entries appear as cards so the user can scan the list before expanding or editing a specific entry.
7. When entry content needs more room, the content editor opens as a modal dialog with its own title, metadata, close control, and text area.

## Business Rules And Boundaries

- The drawer belongs to the chat workspace; users should not need a separate route to activate or edit World Info.
- Global world activation and editor selection are separate controls because selecting a world for editing does not automatically mean it is globally active.
- The World Info drawer can stay open alongside other workspace context, but its own panels and dialogs own their visible loading, empty, and editing states.
- Destructive world-book deletion is a separate semantic feature: [Delete World Book](feature.world_book_delete).
- Character deletion may also delete selected world info files through its cascade section, but that destructive flow belongs to [Delete Character](feature.character_delete).
- Entry scanning, prompt injection, token budget calculations, server endpoints, and persistence details are outside this semantic ID.

## Outcomes

- **Global selection changed**: selected worlds are reflected in the global selector labels and workspace state.
- **Editor selected**: the editor panel shows the selected world book's entries and toolbar actions.
- **Entry opened**: the selected entry expands or opens the content editor dialog for focused editing.
- **Empty state**: if no global worlds or editor world are selected, the panel communicates that state without leaving stale entry content visible.
- **Deletion requested**: the user is routed into the separate [Delete World Book](feature.world_book_delete) confirmation flow.
