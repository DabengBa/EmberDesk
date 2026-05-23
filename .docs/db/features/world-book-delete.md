---
id: feature.world_book_delete
type: feature
name: Delete World Book
related: [page.chat_workspace, feature.character_delete, term.character_card]
---

# Feature: Delete World Book

## ID 解释

`feature.world_book_delete` represents the confirmed removal of a world info / lorebook file from the user's collection, including optional cleanup of character references that point to the deleted book.

## Feature Purpose

This feature lets a user remove an unwanted world book and, when other characters still reference it, decide whether to also clear those character-level references before deletion.

## Trigger Entry

- **Delete button**: use the delete button in the World Info editor panel.
- **Preflight check**: EmberDesk calls `/api/worldinfo/delete-preflight` to determine whether any characters reference the world book.
- **Dialog selection**: depending on the preflight result, EmberDesk shows either a cascade warning dialog or a simple confirmation.

## Interaction IDs

- `feature.world_book_delete`: the full destructive delete behavior.
- `feature.world_book_delete.preflight`: the server call that gathers bound character metadata before showing the dialog.
- `feature.world_book_delete.cascade_dialog`: the warning dialog shown when other characters reference the world book.
- `feature.world_book_delete.clear_references`: the optional action that also strips the `extensions.world` field from bound characters.

## User Flow

### World Book With Bound Characters

1. The user clicks the delete button in the World Info editor.
2. EmberDesk calls `/api/worldinfo/delete-preflight` with the world book name.
3. The preflight response includes the world book's entry count and the list of bound characters.
4. Because bound characters exist, EmberDesk shows a **cascade warning dialog** containing:
   - A heading: "Delete the World/Lorebook: 'name'?"
   - The world book name, entry count, and a warning listing how many other characters still reference it.
   - A "Also clear world info references in bound characters" checkbox (unchecked by default).
   - A "Delete" button and a "Delete All" shortcut.
5. If the user checks the "clear references" checkbox and confirms, EmberDesk calls `/api/worldinfo/delete-cascade` with `clear_references: true`, which strips the `extensions.world` field from all bound characters before deleting the world file.
6. If the user confirms without checking the checkbox, EmberDesk deletes the world file only; bound characters retain their `extensions.world` reference (it becomes a dangling reference).
7. Client-side state is flushed: cache, global selection, and the editor panel are updated.

### World Book Without Bound Characters

1. The user clicks the delete button.
2. The preflight response shows zero bound characters.
3. EmberDesk shows a simple confirmation dialog: "Delete the World/Lorebook: 'name'?" with "This action is irreversible!"
4. On confirmation, EmberDesk deletes the world file via `/api/worldinfo/delete`.

### Preflight Failure

1. If the preflight request fails, EmberDesk falls through to the simple confirmation dialog.
2. Deletion proceeds via the standard `/api/worldinfo/delete` endpoint.

## Business Rules And Boundaries

- Deletion must remain an explicit user-confirmed action.
- When bound characters exist, the cascade warning dialog is mandatory; the simple confirmation is not shown.
- The "clear references" checkbox is unchecked by default — the user must actively opt in to modify other characters.
- This feature is separate from [Delete Character](feature.character_delete): deleting a character does not cascade to other characters' world references ([ADR-0005](../adr/0005-delete-no-cross-character-world-ref-cleanup.md)), but deleting a world book can optionally clear references because the referenced entity itself is being destroyed.
- If the preflight request fails, deletion still proceeds via a simple confirmation dialog; the cascade warning is skipped gracefully.
- The preflight endpoint uses the SQLite character index (when available) to find bound characters; if the index is not supported, the bound-characters list is empty and the simple confirmation is shown.

## Outcomes

- **Success**: the world file is deleted; if "clear references" was checked, bound characters have their `extensions.world` field stripped; client-side state is flushed and the editor panel is updated.
- **Cancel**: the dialog closes without side effects.
- **Failure**: individual errors during character-reference cleanup are caught and skipped; the world file deletion is not blocked by reference-cleanup failures.
