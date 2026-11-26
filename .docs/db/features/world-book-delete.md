---
id: feature.world_book_delete
type: feature
name: Delete World Book
related: [page.chat_workspace, feature.world_info_panel, feature.character_delete, term.character_card]
---

# Feature: Delete World Book

## ID 解释

`feature.world_book_delete` represents the confirmed removal of a World Info / lorebook file from the user's collection, including explicit cleanup of character references that point to the deleted book.

## Purpose

Let a user delete a World Info book from the editor while making any cleanup of character references an explicit choice.

## User-Visible Contract

- Deleting a world book always requires explicit confirmation from the World Info editor. Cascade actions name their scope and linked-book count instead of an ambiguous “Delete All”; cancellation remains the default.
- When EmberDesk can see that other [characters](term.character_card) reference the book, it shows a cascade warning with the world name, entry count, bound-character warning, and an unchecked option to clear those references.
- The clear-references option is opt-in; deleting the book without selecting it removes the world file but leaves other characters' references untouched.
- If no bound characters are found, or if the check cannot provide bound-character details, EmberDesk falls back to a simple irreversible-delete confirmation rather than blocking deletion.
- After deletion, visible World Info state is refreshed so global selections, cached world lists, and the open editor no longer show the deleted world as editable.
- Cleanup errors for individual character references must not claim reference cleanup succeeded, but they also must not reverse the confirmed world-file deletion.

## Semantic Interaction IDs

- `feature.world_book_delete`: the full destructive delete behavior.
- `feature.world_book_delete.preflight`: the visible decision point that determines whether the user sees cascade warning or simple confirmation.
- `feature.world_book_delete.cascade_dialog`: the warning dialog shown when other characters reference the world book.
- `feature.world_book_delete.clear_references`: the optional user-selected cleanup of bound character references.

## Acceptance Workflows

- As a World Info user deleting a book with bound characters, open [World Info Panel](feature.world_info_panel), press delete, and review the cascade warning; EmberDesk must show the world name, entry count, bound-character warning, and unchecked clear-references option, then on confirmation delete the world and refresh visible state. Refresh/reopen must not show the deleted world as editable. Failure is deleting without confirmation or clearing character references without opt-in.
- As a user deleting a book with no visible bound-character risk, press delete and confirm the simple irreversible dialog; EmberDesk must remove the world and clear the editor/global selection state after refresh. Cancel must leave everything unchanged. Failure is no confirmation, stale editor content, or deletion after cancel.
- As a user whose bound-character check cannot complete, continue through the simple confirmation fallback; EmberDesk must keep deletion available through explicit confirmation and must not show invented bound-character details. Failure is a blocked delete with no recovery or a cascade warning based on unavailable evidence.
- As a user opting into reference cleanup, check clear references and confirm; EmberDesk must remove the deleted world and avoid presenting bound characters as still actively using it after refresh. Failure is claiming cleanup succeeded when errors remain or modifying unrelated character references.

## Failure Signals

- A world book is removed without explicit confirmation.
- Bound-character references are cleared by default.
- The World Info editor continues showing a deleted world as editable.
- A failed check strands the user with no confirmation path.
- Cleanup errors are hidden while the UI claims all bound references were cleared.

## Boundaries

- Opening and editing World Info belongs to [World Info Panel](feature.world_info_panel).
- Character deletion and character-owned cascade choices belong to [Delete Character](feature.character_delete).
- Character-card identity belongs to [Character Card](term.character_card).
- Deleting a character must not silently remove world references owned by other characters.
