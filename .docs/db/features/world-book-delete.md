---
id: feature.world_book_delete
type: feature
name: Delete World Book
related: [page.chat_workspace, feature.world_info_panel, feature.character_delete, term.character_card]
---

# Feature: Delete World Book

## ID 解释

`feature.world_book_delete` represents the confirmed removal of a world info / lorebook file from the user's collection, including optional cleanup of character references that point to the deleted book.

## Purpose

Let a user delete a world info/lorebook file from the World Info editor while making any cleanup of character references an explicit choice.

## User-Visible Contract

- Deleting a world book always requires explicit confirmation from the World Info editor surface.
- When EmberDesk can see that other characters reference the world book, it shows a cascade warning with the world name, entry count, bound-character warning, and an unchecked option to clear those references.
- The clear-references option is opt-in; deleting the world book without selecting it removes the world file but leaves other characters' references untouched.
- If no bound characters are found, or if the preflight cannot provide bound-character details, EmberDesk falls back to a simple irreversible-delete confirmation rather than blocking deletion.
- After deletion, visible World Info state is flushed so global selections, cached world lists, and the open editor no longer show the deleted world as editable.
- Cleanup errors for individual character references must not pretend reference cleanup succeeded, but they also must not reverse the confirmed world-file deletion.
- When canonical SQLite World Info authority is enabled, deletion commits to the canonical store first and then projects JSON-file cleanup for compatibility. Users still see the same confirmation and post-refresh absence of the deleted world; projection repair state is an operator concern, not an extra user-facing step.

## Semantic Interaction IDs

- `feature.world_book_delete`: the full destructive delete behavior.
- `feature.world_book_delete.preflight`: the visible decision point that determines whether the user sees cascade warning or simple confirmation.
- `feature.world_book_delete.cascade_dialog`: the warning dialog shown when other characters reference the world book.
- `feature.world_book_delete.clear_references`: the optional user-selected cleanup of bound character references.

## Acceptance Workflows

- As a World Info user deleting a book with bound characters, from [World Info Panel](feature.world_info_panel) press delete and review the cascade warning; EmberDesk must show the world name, entry count, bound-character warning, and unchecked clear-references option, then on confirmation delete the world and refresh visible World Info state, while refresh/reopen must not show the deleted world as editable, and failure is deleting without confirmation or clearing character references without opt-in.
- As a user deleting a world book with no visible bound-character risk, from the editor press delete and confirm the simple irreversible dialog; EmberDesk must remove the world and clear the editor/global selection state after refresh, cancel must leave everything unchanged, and failure is no confirmation, stale editor content, or deletion after cancel.
- As a user whose bound-character preflight cannot complete, from the delete action continue through the simple confirmation fallback; EmberDesk must keep deletion recoverable through explicit user confirmation and must not show invented bound-character details, with failure signaled by a blocked delete with no recovery or a cascade warning based on unavailable evidence.
- As a user opting into reference cleanup, from the cascade dialog check clear references and confirm; EmberDesk must visibly remove the deleted world and avoid leaving bound characters presented as still actively using it after refresh, and failure is claiming cleanup succeeded when errors remain or modifying unrelated character references.

## Feature-Specific Evidence

- Confirmation dialog type, cascade warning content, checkbox default, editor/global selection clearing, and post-refresh absence of the deleted world are primary evidence.
- Preflight and cascade endpoint results are supporting evidence only when they match the visible dialog and resulting World Info state.
- Backend storage mode can explain which proof surface is used, but users should still see a coherent confirmation path.

## Failure Signals

- A world book is removed without explicit confirmation.
- Bound-character references are cleared by default.
- The World Info editor continues showing a deleted world as editable.
- Preflight failure strands the user with no confirmation path.
- Cleanup errors are hidden while the UI claims all bound references were cleared.

## Boundaries

- Opening and editing World Info belongs to [World Info Panel](feature.world_info_panel).
- Character deletion and character-owned cascade choices belong to [Delete Character](feature.character_delete).
- Character-card identity belongs to [Character Card](term.character_card).
- The no-cross-character-cleanup rule for deleting characters is recorded in [ADR-0005](../adr/0005-delete-no-cross-character-world-ref-cleanup.md).
