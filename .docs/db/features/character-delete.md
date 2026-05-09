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

## User Flow

1. The user chooses the delete action for a specific [character card](term.character_card).
2. EmberDesk presents the confirmation step for this destructive action.
3. The user confirms deletion.
4. EmberDesk removes the deleted row from the visible character library.
5. The workspace refreshes related context such as groups without forcing the user to wait through an extra full-list reload screen.

## Business Rules And Boundaries

- Deletion is destructive and must remain an explicit user-confirmed action.
- The success path should update the visible library immediately.
- Removing the row from the library is part of this feature; re-browsing the remaining library belongs to [Character Library Panel](feature.character_library_panel).

## ID Boundary Notes

This feature exists separately from library browsing because destructive confirmation, removal feedback, and post-delete workspace updates are a distinct user-visible contract with higher risk than normal list interaction.

## Outcomes

- **Success**: the deleted card disappears from the visible library and the surrounding workspace stays responsive.
- **Failure**: EmberDesk should not pretend the row is gone if the delete action does not complete successfully.
