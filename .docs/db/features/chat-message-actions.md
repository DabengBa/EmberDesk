---
id: feature.chat_message_actions
type: feature
name: Chat Message Actions
related: [page.chat_workspace, feature.chat_message_rendering, feature.chat_generation_auto_recovery, feature.chat_regenerate]
---

# Feature: Chat Message Actions

## ID 解释

`feature.chat_message_actions` represents the visible controls attached to a rendered chat message in [Chat Workspace](page.chat_workspace). It covers discovering and triggering message-row actions such as copy, edit, branch, reasoning actions, and media gallery navigation. It does not define how message text is generated, formatted, or stored.

## Purpose

Let users act on an already rendered chat message through discoverable row controls without leaving the conversation surface.

## User-Visible Contract

- Message text stays the primary content; actions must be discoverable by pointer, keyboard focus, touch/mobile paths, and accessible names without visually overwhelming the row.
- High-frequency actions such as copy, edit, and opening the action menu remain quicker to reach than secondary or destructive actions.
- Secondary actions such as branch, reasoning controls, and media-gallery navigation appear only when valid for the current message state.
- Danger actions keep clear accessible names and must not visually outrank normal copy/edit actions.
- The alternate-reply picker exposes copy, expand/collapse, branch, and delete through keyboard-operable buttons. Expansion announces its state; unavailable deletion is disabled rather than merely styled as inactive.
- Delete Messages is a contiguous range operation: selecting a message selects that message and every later message through the end of the chat. The confirmation area announces the starting message and count, disables Delete until a range is selected, and blocks duplicate submission while deletion is in progress.
- A failed generation row may expose a retry action only after [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery) has exhausted automatic attempts; using it must not resubmit the already-rendered user message as a duplicate row.
- Save, regenerate, and retry results persist as one complete chat result without changing action availability or row controls. Turn-level regeneration launched from the chat-options menu is documented by [Chat Turn Regenerate](feature.chat_regenerate).
- With the empty composer focused at the start of its text, ArrowUp edits the last editable message and Ctrl+ArrowUp edits the last editable user message, loading older history when needed. Editing existing messages remains available without a connection.
- Ctrl+Enter confirms the current message edit and Escape cancels it; when body and reasoning edits coexist, the body edit has priority. With no active edit, Escape stops visible generation. An open modal, input-method composition, or a nonempty composer/selection takes priority over chat edit shortcuts.

## Generation Action Boundary

Visible message actions start actions only. The visible generation lifecycle owns the request and its result; message rendering ownership remains a separate boundary. Turn-level regeneration launched from the chat-options menu is documented by [Chat Turn Regenerate](feature.chat_regenerate).

## Semantic Interaction IDs

- `feature.chat_message_actions`: the overall message-row action surface.
- `feature.chat_message_actions.primary_menu`: the message actions affordance attached to a message row.
- `feature.chat_message_actions.copy`: copying message text or action payload exposed by row controls.
- `feature.chat_message_actions.edit`: entering or operating message edit mode.
- `feature.chat_message_actions.branch`: creating a branch chat from the row.

- `feature.chat_message_actions.reasoning`: copying, editing, removing, or collapsing reasoning blocks when visible.
- `feature.chat_message_actions.media_gallery`: navigating swipeable media attached to a message.
- `feature.chat_message_actions.failure_retry`: retrying a failed assistant row after automatic recovery is exhausted.

## Acceptance Workflows

- As a chat user who wants to copy or edit a message, from a rendered row in [Chat Workspace](page.chat_workspace) locate the row controls by visible icon, accessible name, or keyboard focus and trigger copy or edit; EmberDesk must perform the row action while leaving message text readable and row identity stable after refresh or re-render, and failure is hidden high-frequency controls, lost focus path, or action execution on the wrong row.
- As a user operating secondary message state, from a row with reasoning, branch, or media controls trigger the relevant action and then re-render or revisit the row; EmberDesk must show those controls only when valid and update the visible row state without hiding the message body, with failure signaled by inactive controls shown as usable or valid controls missing from the row.
- As a user recovering from a failed generation after automatic recovery ends, from the failed assistant row press retry and wait for the retry to settle; EmberDesk must retry from the same row context without duplicating the already-rendered user message, keep the composer usable after success or failure, and failure is a new duplicate user row or a retry action before recovery has exhausted.
- As a mobile or keyboard user on a message row, use common actions from the same action surface; EmberDesk must preserve role and name reachability when the row enters edit or live streaming state, and failure is unreachable actions or a broken action shell.
- As a keyboard user with an empty composer, press ArrowUp or Ctrl+ArrowUp, edit the selected message, then confirm with Ctrl+Enter or cancel with Escape; EmberDesk must target the correct message even outside the initially loaded history and must not send a duplicate user message. Repeat while disconnected and while a modal or input-method composition is active; editing remains possible offline and the modal or input method keeps priority.

## Failure Signals

- Copy, edit, or action-menu controls are harder to reach than secondary or danger actions in normal reading state.
- A danger action lacks clear accessible naming.
- A failed-row retry duplicates the user message.
- A row entering edit or unsafe state leaves a mixed or broken action shell.
- Delete Messages does not announce the starting message and count, or accepts a second submission while deletion is in progress.
- An unavailable delete button appears active instead of disabled.

## Boundaries

- Message body rendering belongs to [Chat Message Rendering](feature.chat_message_rendering).
- Automatic generation recovery belongs to [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery).
- The chat workspace layout belongs to [Chat Workspace](page.chat_workspace).
- Token timing, composer submission, and message storage are outside this feature.
