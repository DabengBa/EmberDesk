---
id: feature.chat_recovery
type: feature
name: Chat Recovery
related: [page.chat_workspace, feature.chat_message_actions]
---

# Feature: Chat Recovery

## ID 解释

`feature.chat_recovery` describes how users find and recover local chat edits when saving conflicts with a newer version or a chat deletion cannot be confirmed. It belongs to [Chat Workspace](page.chat_workspace) and is separate from recovery of a failed model response; see [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery).

## Purpose

Keep a newer saved chat from being silently overwritten and give users a visible way to inspect, export, or restore available local work.

## User-Visible Contract

- When a save conflicts with a newer chat, the workspace reports the conflict and, if local recovery storage succeeds, directs the user to **Chat History → Recovery drafts**. The newer saved chat is not replaced by the stale edit.
- Recovery drafts are local to the browser and account. Chat History shows each available draft with its chat and character; **Restore as new chat** creates a separate chat, while **Export recovery data** retains an external copy. The local draft remains available after restoration.
- **Show unsent text** exposes captured composer, message-edit, and reply-edit text for inspection without inserting it into the chat.
- **Unconfirmed deletions** lists chats or characters whose deletion could not be confirmed. **Retry deletion** attempts that deletion again and never approves deletion of a newer version.
- When local recovery storage fails, the workspace tells the user that recovery cannot be guaranteed and prevents leaving the page before the unsaved work is acknowledged.
- While a character operation is pending, the workspace prevents a chat switch that would make the local edits unsafe to reconcile.
- If a chat deletion's outcome is unknown, the workspace keeps a draft and does not automatically refresh away from the current chat.
- Before an automatic reload, the workspace verifies the recovery checkpoint is available.
- Recovery drafts are not a general backup of every chat. They exist only for conflicts or interrupted operations where local work could otherwise be lost.

## Acceptance Workflows

- As a user whose local edits conflict with a newer saved chat, continue editing and then return to the chat; EmberDesk must show a conflict, direct the user to **Chat History → Recovery drafts** when a draft was saved, and must never overwrite the newer version with the stale local edit.
- As a user who wants to keep conflicting local work, open **Chat History → Recovery drafts**, inspect the listed chat and character, choose **Restore as new chat**, and separately choose **Export recovery data**; EmberDesk must create a distinct chat, provide an external copy, and keep the original draft available, and failure is replacing the newer chat or losing the draft after restoration.
- As a user with unsent composer or edit text, open the recovery draft and choose **Show unsent text**; EmberDesk must display the captured text without inserting it into the chat or sending it, and failure is the text appearing as a message or replacing the current composer draft.
- As a user with an unconfirmed deletion, open **Unconfirmed deletions**, inspect the affected chat or character, and choose **Retry deletion**; EmberDesk must retry only that deletion and must not approve deletion of a newer version, and failure is a newer chat or character disappearing after retry.
- As a user with a local storage failure while editing, attempt to leave the chat; EmberDesk must warn that recovery cannot be guaranteed and prevent leaving until the state is acknowledged, and failure is silent loss of the edit or a forced navigation.

## Failure Signals

- A newer saved chat is replaced by stale local edits after a conflict.
- A recovery draft is not listed with its chat and character, or **Restore as new chat** replaces an existing chat instead of creating a separate one.
- **Show unsent text** inserts captured text into the chat or composer.
- **Retry deletion** approves deletion of a newer version or repeats a deletion that was already confirmed.
- The workspace leaves the page or switches chats without acknowledging a recovery risk, or an automatic reload occurs before the recovery checkpoint is verified.
- Recovery drafts are presented as a general backup of all chats.

## Boundaries

- Covers conflict drafts, unconfirmed deletions, and interrupted local chat work in [Chat Workspace](page.chat_workspace).
- Does not cover retrying a failed generation; see [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery).
- Does not cover message selection, editing, or deletion controls themselves; see [Chat Message Actions](feature.chat_message_actions).
