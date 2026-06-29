---
id: feature.character_delete
type: feature
name: Delete Character
related: [page.chat_workspace, feature.character_library_panel, term.character_card]
---

# Feature: Delete Character

## ID 解释

`feature.character_delete` represents the confirmed removal of one or more [character cards](term.character_card) from the user's library. It covers the visible delete result in the workspace, not generic card browsing or lower-level file cleanup details.

## Purpose

Let a user remove one or more [character cards](term.character_card) through an explicit destructive confirmation while keeping the visible library, active-character state, and optional cleanup choices coherent afterward.

## User-Visible Contract

- Character deletion must always be an explicit user-confirmed destructive action, whether it starts from a single card control or bulk-select mode.
- The selected-character delete affordance remains directly discoverable and keyboard/screen-reader reachable; compatibility menu entries are not the only path.
- Single and bulk delete use one unified confirmation dialog. Temporary-chat loss warning, optional chat-file deletion, and optional World Info cascade choices appear in that dialog instead of separate follow-up popups.
- "Also delete the chat files" is checked by default; linked World Info files are unchecked by default, and "Delete All" means selecting chat-file deletion plus every optional world-info deletion in one action.
- If generation is active, EmberDesk blocks deletion with a visible stop-generation notice and performs no destructive work until the user stops generation.
- Successful deletion removes the card rows from the visible library, shows a success toast, prevents the selected-character title from reopening deleted-card data, and keeps safe pagination context when the after-delete page can be computed.
- Delayed edit/save responses and late character-list snapshots must not restore a card that the user has already deleted locally.
- If optional world-file cleanup fails, character deletion can still complete, but the UI must not imply every optional cleanup succeeded.

## Semantic Interaction IDs

- `feature.character_delete`: the full destructive delete behavior.
- `feature.character_delete.primary_entry`: the UI action that begins deletion for one card or opens the unified dialog for a batch.
- `feature.character_delete.confirm`: the final confirmation action that removes the selected card(s).
- `feature.character_delete.world_cascade`: the optional world-info cleanup section embedded in the unified dialog.
- `feature.character_delete.delete_all`: the shortcut that selects chat-file deletion and all world-info deletion options.

## Acceptance Workflows

- As a user deleting one unwanted character, from [Chat Workspace](page.chat_workspace) use the direct delete affordance for a [character card](term.character_card), review the unified dialog, optionally adjust chat-file and world-info cleanup choices, then confirm; EmberDesk must remove the row, show success feedback, keep safe pagination and row identity when possible, and after refresh or delayed edit responses the deleted card must not reappear, with failure signaled by no confirmation, stale selected-character editor, or row resurrection.
- As a user deleting several characters, from [Character Library Panel](feature.character_library_panel) enter bulk-select mode, select cards, open bulk delete, and confirm the unified dialog; EmberDesk must show selected names, disabled-until-selection behavior, temporary-chat warning when relevant, checked chat-file deletion, unchecked world cleanup, success count, and preserved page or last-valid-page context after refresh or list reload, and failure is page reset to an unrelated position, hidden selection count, or extra popups after confirmation.
- As a user trying to delete during active generation, from either delete entry trigger deletion while generation is in progress; EmberDesk must show a stop-generation notice and leave cards, chat files, and world files unchanged until generation is stopped and the user retries, and failure is any partial deletion or cleanup while generation is still active.
- As a user deleting a character with linked World Info, from the unified dialog leave world files unchecked, select specific world files, or use Delete All; EmberDesk must respect exactly the visible choice, clear an open editor for worlds that were actually deleted, and after refresh leave other characters' world references alone unless the world itself is deleted through [Delete World Book](feature.world_book_delete), with failure signaled by unselected world deletion or cross-character reference cleanup.
- As a user cancelling deletion, from the unified dialog choose cancel; EmberDesk must close the dialog without side effects, refresh or reopen must show the same card and chat context, and failure is any removed card, closed chat, or changed cleanup state after cancel.

## Feature-Specific Evidence

- Confirmation dialog content, default checkbox states, disabled bulk delete until selection, success/warning toasts, visible row removal, pagination text, active-character title behavior, and refresh persistence are primary evidence.
- Stable row selectors and delayed-snapshot suppression are supporting evidence when they explain why deleted rows stay absent.
- World Info preflight and cleanup responses are supporting evidence only when the visible cascade section and final workspace state match the user's choices.

## Failure Signals

- Deletion proceeds without a unified confirmation.
- A generation-in-progress delete removes data instead of asking the user to stop generation first.
- Cancel closes the dialog but still removes a card, chat file, or world file.
- Deleted cards reappear after delayed edit saves, late list responses, refresh, or active-character title clicks.
- World Info files are selected for deletion by default or unselected files are removed.

## Boundaries

- Browsing, selecting, filtering, and bulk-selection affordances belong to [Character Library Panel](feature.character_library_panel).
- The character-card concept belongs to [Character Card](term.character_card).
- Deleting a world book and optionally clearing references from bound characters belongs to [Delete World Book](feature.world_book_delete).
- Chat workspace placement and current-character shell behavior belong to [Chat Workspace](page.chat_workspace).
