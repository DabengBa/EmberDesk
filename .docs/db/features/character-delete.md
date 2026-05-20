---
id: feature.character_delete
type: feature
name: Delete Character
related: [page.chat_workspace, feature.character_library_panel, term.character_card]
---

# Feature: Delete Character

## ID 解释

`feature.character_delete` represents the confirmed removal of one or more [character cards](term.character_card) from the user's library. It covers the visible delete result in the workspace, not generic card browsing or lower-level file cleanup details.

## Feature Purpose

This feature lets a user remove unwanted characters and immediately see the workspace reflect that change, through a single unified confirmation dialog.

## Trigger Entry

- **Single delete entry**: use the delete action exposed from a character's controls inside [Chat Workspace](page.chat_workspace).
- **Batch delete entry**: enter bulk-select mode from the character library panel, select one or more cards, then use the bulk delete button or right-click context menu.
- **Confirming entry**: confirm the destructive action in the unified confirmation dialog that EmberDesk presents before removal.

## Interaction IDs

- `feature.character_delete`: the full destructive delete behavior.
- `feature.character_delete.primary_entry`: the UI action that begins deletion for one card (single) or opens the unified dialog (batch).
- `feature.character_delete.confirm`: the final confirmation action that actually removes the card(s).
- `feature.character_delete.world_cascade`: the optional world info cleanup section embedded in the unified dialog.
- `feature.character_delete.delete_all`: the "Delete All" shortcut that selects all world info files and chat file deletion in one click.

## User Flow

### Single Character Deletion

1. The user chooses the delete action for a specific [character card](term.character_card).
2. If message generation is in progress, EmberDesk automatically stops it.
3. EmberDesk checks whether the character references any world info files (`extensions.world`).
4. EmberDesk presents a confirmation dialog. If linked world info files exist, the dialog includes a **World Info Cascade** section listing each world with its entry count and the number of other characters still bound to it. Worlds shared with other characters display a warning.
5. The user optionally checks which world info files to delete and whether to also delete chat files.
6. The user confirms deletion.
7. EmberDesk removes the deleted character, deletes any selected world info files, and clears references if requested.
8. EmberDesk removes the deleted row from the visible character library.
9. A success toast confirms the deletion.

### Batch (Multi-Select) Deletion

1. The user enters bulk-select mode from the character library panel and selects one or more [character cards](term.character_card).
2. The user clicks the bulk delete button or uses the right-click context menu delete option.
3. EmberDesk gathers state: whether generation is in progress, whether the user is in a temporary chat, and whether the active chat character is in the selection.
4. EmberDesk pre-fetches world info metadata for all selected characters.
5. EmberDesk shows a **single unified confirmation dialog** containing:
   - Character names displayed as scrollable tag labels
   - An info banner if generation will be stopped automatically
   - An info banner if the active chat character is in the selection
   - An info banner if the user is in a temporary chat
   - A "Also delete the chat files" checkbox
   - A World Info Cascade section (if any selected characters have linked world info), with per-world checkboxes and a "Also clear world info references in remaining characters" option
   - A "Delete All" button that selects all world info checkboxes and the chat file checkbox in one action
6. The user confirms deletion (or cancels).
7. EmberDesk stops any active generation, closes the current chat, deletes all selected characters with their chosen options, and removes selected world info files.
8. A success toast ("Deleted N character(s)") confirms the result.
9. The workspace refreshes related context such as groups and the character library.

## Business Rules And Boundaries

- Deletion is destructive and must remain an explicit user-confirmed action.
- Both single and batch delete use a unified confirmation dialog — no separate cascading popups.
- The success path should update the visible library immediately.
- Removing rows from the library is part of this feature; re-browsing the remaining library belongs to [Character Library Panel](feature.character_library_panel).
- World info files are unchecked by default in the cascade section — the user must actively opt in to delete them (or use "Delete All").
- "Delete All" selects all world info checkboxes and the "delete chat files" checkbox — it means complete cleanup, not selective deletion.
- Clearing `extensions.world` references only removes the external link; the embedded `character_book` content inside each character is never touched and can be re-imported later.
- A failed cascade (world file deletion or reference clearing) does not block the character deletion itself.
- If generation is in progress when deletion is triggered, it is stopped automatically — the user is informed via an info banner but is not blocked.
- If the preflight world info request fails, the dialog degrades gracefully by omitting the World Info Cascade section.

## ID Boundary Notes

This feature exists separately from library browsing because destructive confirmation, removal feedback, and post-delete workspace updates are a distinct user-visible contract with higher risk than normal list interaction.

## Outcomes

- **Success**: the deleted card(s) disappear from the visible library, any user-selected world info files are removed, and a success toast confirms the action.
- **Cancel**: the dialog closes without side effects; the workspace and current chat remain unchanged.
- **Failure**: EmberDesk should not pretend the row is gone if the delete action does not complete successfully. Individual character failures show a toastr warning and remaining characters continue processing.
