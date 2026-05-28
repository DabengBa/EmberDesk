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

1. The user chooses the directly exposed delete button for a specific [character card](term.character_card), or uses the retained delete option in the character actions menu.
2. If message generation is in progress, EmberDesk blocks deletion and asks the user to stop generation first.
3. EmberDesk checks whether the character references any world info files (`extensions.world`).
4. EmberDesk presents a confirmation dialog. If the workspace is in a temporary chat, the dialog includes an inline warning that unsaved messages will be lost. If linked world info files exist, the same dialog includes a **World Info Cascade** section listing each world with its entry count and the number of other characters still bound to it. Worlds shared with other characters display a warning.
5. The user optionally checks which world info files to delete and whether to also delete chat files (checked by default), or uses "Delete All" to select chat deletion and every world info deletion option in one action.
6. The user confirms deletion.
7. EmberDesk removes the deleted character and deletes any selected world info files.
8. EmberDesk removes the deleted row from the visible character library. For an ordinary unfiltered single-character delete, the current page is reconciled incrementally: the row disappears, the pagination range updates, and remaining visible character row identities are resynced without clearing the whole list.
9. A success toast confirms the deletion.
10. If the deleted character was the current selected character, the selected-character title area no longer reopens a stale editor for the removed card; the workspace stays in a safe empty or library state.

### Batch (Multi-Select) Deletion

1. The user enters bulk-select mode from the character library panel and selects one or more [character cards](term.character_card).
2. The user clicks the bulk delete button or uses the right-click context menu delete option.
3. EmberDesk gathers state: whether the user is in a temporary chat.
4. EmberDesk pre-fetches world info metadata for all selected characters.
5. EmberDesk shows a **single unified confirmation dialog** containing:
   - Character names displayed as scrollable tag labels
   - An info banner if the user is in a temporary chat (unsaved messages will be lost)
   - A "Also delete the chat files" checkbox (checked by default)
   - A World Info Cascade section (if any selected characters have linked world info), with per-world checkboxes
   - A "Delete All" button that selects chat file deletion and all world info checkboxes in one action
6. The user confirms deletion (or cancels).
7. EmberDesk closes the current chat, deletes all selected characters with their chosen options, and removes selected world info files. If generation is active, deletion is blocked until the user stops generation.
8. The character library keeps the user's pagination context when the post-delete page can be safely computed: the same page stays visible when it still exists, or the library moves to the last valid page after the delete.
9. A success toast ("Deleted N character(s)") confirms the result.
10. The workspace refreshes related context such as groups and the character library.

## Business Rules And Boundaries

- Deletion is destructive and must remain an explicit user-confirmed action.
- The selected-character delete affordance must remain directly discoverable and keyboard/screen-reader reachable; the menu option is a compatibility entry, not the only visible path.
- Both single and batch delete use a unified confirmation dialog — ordinary UI delete flows do not show a separate temporary-chat or world-info confirmation after the user confirms that dialog.
- When deletion starts from a temporary chat, the temporary-chat loss warning appears inside that same unified confirmation dialog, and the workspace also exposes the temporary-chat state outside the dialog so users are not relying on the confirmation alone.
- After deleting the active character, clicking the selected-character title area must not read or display stale deleted-card data.
- The success path should update the visible library immediately.
- Ordinary single-character deletion in the unfiltered library uses an incremental visible-list reconcile when the current page can be safely computed. Search/tag filters, bogus-folder drilldown, in-flight printing, and ambiguous entity changes keep the existing full-refresh fallback.
- Bulk delete in the unfiltered library keeps pagination context after one or more successful deletions when the target page can be computed from the after-delete snapshot. The target is the original page when it still exists, otherwise the last valid page.
- When that safe single-delete path succeeds, it uses the same current-page update rules as ordinary library browsing so pagination text, row identity hooks, and bulk-edit selectors stay aligned instead of splitting into a delete-only special case.
- During ordinary single-character deletion, early chat-closing and menu-switch side effects are suppressed from repainting the character library before the incremental reconcile can remove the affected row.
- Once deletion starts, pending delayed character saves are cancelled so a stale edit-submit cannot race the delete and restore a removed row.
- If an earlier edit response finishes after the card was already removed locally, EmberDesk does not refresh that deleted card back into the visible library.
- Removing rows from the library is part of this feature; re-browsing the remaining library belongs to [Character Library Panel](feature.character_library_panel).
- The "Also delete the chat files" checkbox is checked by default.
- World info files are unchecked by default in the cascade section — the user must actively opt in to delete them (or use "Delete All").
- "Delete All" selects the chat-file checkbox and all world info checkboxes — it means complete optional cleanup, not selective deletion.
- Deleting a character does not affect other characters' world info references. See [ADR-0005](../adr/0005-delete-no-cross-character-world-ref-cleanup.md). For the inverse flow (deleting a world book and optionally clearing bound character references), see [Delete World Book](feature.world_book_delete).
- A failed cascade (world file deletion) does not block the character deletion itself.
- If the World Info editor panel is open showing a world that gets cascade-deleted, EmberDesk closes the editor and clears all related client-side references (cache, global selection, character world field, persona lorebook).
- If generation is in progress when deletion is triggered, EmberDesk shows a "Please stop the message generation first" notice and does not continue the destructive flow.
- If the preflight world info request fails, the dialog degrades gracefully by omitting the World Info Cascade section.

## ID Boundary Notes

This feature exists separately from library browsing because destructive confirmation, removal feedback, and post-delete workspace updates are a distinct user-visible contract with higher risk than normal list interaction.

## Outcomes

- **Success**: the deleted card(s) disappear from the visible library, any user-selected world info files are removed, and a success toast confirms the action. Ordinary single deletes should keep the visible library context stable while updating pagination and row identity; delayed edit/save responses for deleted cards should not make them reappear, and active-character navigation should fall back safely when the active card was deleted.
- **Cancel**: the dialog closes without side effects; the workspace and current chat remain unchanged.
- **Failure**: EmberDesk should not pretend the row is gone if the delete action does not complete successfully. Individual character failures show a toastr warning and remaining characters continue processing.
