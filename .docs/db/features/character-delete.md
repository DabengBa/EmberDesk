---
id: feature.character_delete
type: feature
name: Delete Character
related: [page.chat_workspace, feature.character_library_panel, term.character_card]
---

# Feature: Delete Character

## ID 解释

`feature.character_delete` represents the confirmed removal of one [character card](term.character_card) from the user's library. It covers the visible delete result in the workspace, not generic card browsing or lower-level file cleanup details.

## Feature Purpose

This feature lets a user remove an unwanted character and immediately see the workspace reflect that change.

## Trigger Entry

- **Primary entry**: use the delete action exposed from a character's controls inside [Chat Workspace](page.chat_workspace).
- **Confirming entry**: confirm the destructive action in the UI flow that EmberDesk presents before removal.

## Interaction IDs

- `feature.character_delete`: the full destructive delete behavior.
- `feature.character_delete.primary_entry`: the UI action that begins deletion for one card.
- `feature.character_delete.confirm`: the final confirmation action that actually removes the card.
- `feature.character_delete.world_cascade`: the optional world info cleanup step shown before deletion completes.

## User Flow

1. The user chooses the delete action for a specific [character card](term.character_card).
2. EmberDesk checks whether the character references any world info files (`extensions.world`).
3. If linked world info files exist, EmberDesk shows a **World Info Cascade** dialog listing each world with its entry count and the number of other characters still bound to it. Worlds shared with other characters display a warning.
4. The user selects which world info files to delete (unchecked by default) and optionally chooses to clear world info references in remaining characters.
5. EmberDesk presents the standard confirmation step for the character deletion itself.
6. The user confirms deletion.
7. EmberDesk removes the deleted character, deletes any selected world info files, and clears references if requested.
8. EmberDesk removes the deleted row from the visible character library.
9. The workspace refreshes related context such as groups without forcing the user to wait through an extra full-list reload screen.

### Batch (Multi-Select) Deletion

When multiple characters are deleted at once, EmberDesk collects all linked world info files across the entire batch and shows a single unified cascade dialog. This ensures no world info files are silently skipped due to batch ordering.

## Business Rules And Boundaries

- Deletion is destructive and must remain an explicit user-confirmed action.
- The success path should update the visible library immediately.
- Removing the row from the library is part of this feature; re-browsing the remaining library belongs to [Character Library Panel](feature.character_library_panel).
- World info files are unchecked by default in the cascade dialog — the user must actively opt in to delete them.
- Clearing `extensions.world` references only removes the external link; the embedded `character_book` content inside each character is never touched and can be re-imported later.
- A failed cascade (world file deletion or reference clearing) does not block the character deletion itself.

## ID Boundary Notes

This feature exists separately from library browsing because destructive confirmation, removal feedback, and post-delete workspace updates are a distinct user-visible contract with higher risk than normal list interaction.

## Outcomes

- **Success**: the deleted card disappears from the visible library, any user-selected world info files are removed, and the surrounding workspace stays responsive.
- **Failure**: EmberDesk should not pretend the row is gone if the delete action does not complete successfully.
