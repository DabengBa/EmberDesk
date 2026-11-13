---
id: feature.chat_recovery
type: feature
name: Chat Recovery
related: [page.chat_workspace, feature.chat_message_actions]
---

# Feature: Chat Recovery

## ID 解释

`feature.chat_recovery` describes how users find and recover local chat edits when saving conflicts with a newer version or a chat deletion cannot be confirmed. It belongs to [Chat Workspace](page.chat_workspace) and is separate from recovery of a failed model response.

## Purpose

Keep a newer saved chat from being silently overwritten and give users a visible way to inspect, export, or restore available local work.

## User-Visible Contract

- When a save conflicts with a newer chat, the workspace reports the conflict and, if local recovery storage succeeds, directs the user to **Chat History → Recovery drafts**. The newer saved chat is not replaced by the stale edit.
- Recovery drafts are local to the browser and account. Chat History shows each available draft with its chat and character; **Restore as new chat** creates a separate chat, while **Export recovery data** retains an external copy. The local draft remains available after restoration.
- **Show unsent text** exposes captured composer, message-edit, and reasoning-edit text for selection and copying. Restoring messages does not automatically insert unsent text into the new chat.
- If deletion is unconfirmed, Chat History can show **Unconfirmed deletions** with **Retry deletion**. Retrying the same deletion does not approve deleting a newer chat version. An available recovery draft remains separately accessible.
- If recovery storage fails, the workspace reports the failure and can prevent leaving or deleting the current chat; users should keep the page open and retry after storage is available. A draft cannot be assumed to exist until it has been saved successfully.
- During character creation or rename, an in-flight save or edits made while the operation is pending can prevent the workspace from switching away. The character operation may already have succeeded on the server even when the local switch is blocked; the current chat and its edits remain on the page so the user can save or recover them before leaving.
- When an ordinary save has an unknown outcome, the workspace attempts to save the current edits as a recovery draft and reports whether it succeeded. Verify the draft in Chat History before refreshing. If local storage fails, do not refresh or leave: keep the page open, copy your work, and retry when storage is available. Edits made after the last successful checkpoint can still be lost on refresh or crash.
- If an integrity-check warning appears, the workspace saves the current edits as a recovery draft before offering to reload, then checkpoints again before reloading. If recovery storage fails, it keeps the page open and warns the user not to refresh or leave.

## Acceptance Workflows

- As a user editing a chat in two tabs, save a newer version in one tab and save the stale edits in the other. The stale tab reports a conflict and offers Chat History recovery; after reopening, inspect or export its draft and restore it as a new chat. The recovered messages are visible in the separate chat, the newer original remains intact, and captured unsent text is available for manual copying. A missing draft or replacement of the newer original is a failure.
- As a user deleting the active chat when the result cannot be confirmed, open Chat History and inspect any unconfirmed deletion and recovery draft. Retry the deletion or export/restore the draft; a newer version must not be silently deleted, and a failed retry must leave the available local copy accessible.
- As a user whose ordinary save cannot be confirmed, verify that the reported recovery draft appears in Chat History. After refreshing, inspect unsent text and restore messages as a separate chat. If recovery storage fails, the page warns against refreshing and retains the current edits for copying and retry.
- As a user whose character creation or rename is waiting, continue editing the current chat before the operation finishes. If the workspace cannot safely switch, it reports the blocked transition and retains the open edits; the user can then save or recover them. A silently switched-away edit is a failure.

## Boundaries

- Recovery drafts are not a general backup or a guarantee for edits that were never saved locally. Storage failure, clearing browser data, and a crash before a successful checkpoint can prevent recovery.
- Failed model response retry is described by [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery); this feature covers chat data and unsent local edits.
