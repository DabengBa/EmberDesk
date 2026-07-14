---
id: feature.chat_message_actions
type: feature
name: Chat Message Actions
related: [page.chat_workspace, feature.chat_message_rendering, feature.chat_generation_auto_recovery]
---

# Feature: Chat Message Actions

## ID 解释

`feature.chat_message_actions` represents the visible controls attached to a rendered chat message in [Chat Workspace](page.chat_workspace). It covers discovering and triggering message-row actions such as copy, edit, checkpoint, swipe, reasoning actions, and media gallery navigation.

It does not define how message text is generated, streamed, formatted, or stored.

## Purpose

Let users act on an already rendered chat message through discoverable row controls without leaving the conversation surface.

## User-Visible Contract

- Message text stays the primary content; actions must be discoverable by pointer, keyboard focus, touch/mobile paths, and accessible names without visually overwhelming the row.
- High-frequency actions such as copy, edit, and opening the action menu remain quicker to reach than secondary or destructive actions.
- Secondary actions such as checkpoint, swipe, reasoning controls, and media-gallery navigation appear only when valid for the current message state.
- Danger actions keep clear accessible names and must not visually outrank normal copy/edit actions.
- A failed generation row may expose a retry action only after [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery) has exhausted automatic attempts; using it must not resubmit the already-rendered user message as a duplicate row.
- Safe rows may show a React-owned visible action shell or the ordinary fallback shell, but the user-facing controls, mobile reachability, and compatibility hooks remain the same; unsafe or editing rows fall back cleanly.
- Save, regenerate, retry, and swipe results persist as one complete chat result without changing action ownership, action availability, row controls, or extension hooks. Storage compatibility repair and rollback remain maintainer workflows rather than visible message actions.
- The main-chat React shell may coordinate composer/action-rail placement on the existing `#send_form` and `#nonQRFormItems` containers, but row action semantics, valid-action decisions, and compatibility hooks remain governed by the message-action surface.

## Semantic Interaction IDs

- `feature.chat_message_actions`: the overall message-row action surface.
- `feature.chat_message_actions.primary_menu`: the message actions affordance attached to a message row.
- `feature.chat_message_actions.copy`: copying message text or action payload exposed by row controls.
- `feature.chat_message_actions.edit`: entering or operating message edit mode.
- `feature.chat_message_actions.checkpoint`: opening or creating checkpoint-related chat actions from the row.
- `feature.chat_message_actions.swipe`: navigating message swipes when swipe controls are visible.
- `feature.chat_message_actions.reasoning`: copying, editing, removing, or collapsing reasoning blocks when visible.
- `feature.chat_message_actions.media_gallery`: navigating swipeable media attached to a message.
- `feature.chat_message_actions.failure_retry`: retrying a failed assistant row after automatic recovery is exhausted.

## Acceptance Workflows

- As a chat user who wants to copy or edit a message, from a rendered row in [Chat Workspace](page.chat_workspace) locate the row controls by visible icon, accessible name, or keyboard focus and trigger copy or edit; EmberDesk must perform the row action while leaving message text readable and row identity stable after refresh or re-render, and failure is hidden high-frequency controls, lost focus path, or action execution on the wrong row.
- As a user operating secondary message state, from a row with swipes, reasoning, checkpoint, or media controls trigger the relevant action and then re-render or revisit the row; EmberDesk must show those controls only when valid and update the visible row state without hiding the message body, with failure signaled by inactive controls shown as usable or valid controls missing from the row.
- As a user recovering from a failed generation after automatic recovery ends, from the failed assistant row press retry and wait for the retry to settle; EmberDesk must retry from the same row context without duplicating the already-rendered user message, keep the composer usable after success or failure, and failure is a new duplicate user row or a retry action before recovery has exhausted.
- As a mobile or keyboard user on a safe row owned by React or fallback, from the same row action surface use common actions; EmberDesk must preserve role/name reachability and fallback cleanly when the row enters edit or unsafe state, and failure is a mixed React/legacy menu, unreachable action, or missing compatibility hook.

## Feature-Specific Evidence

- Visible row controls, action priority, accessible names, focus behavior, mobile reachability, retry CTA, and row-level result are primary evidence.
- Protected selectors such as `#chat > .mes`, `.mes_text`, `.mes[mesid]`, swipe, reasoning, media, and file wrappers are compatibility evidence only when visible actions remain correct.
- React owner markers and bridge calls support migration proof but do not change the user-visible action contract.
- Main-chat layout/status markers support placement proof only; they do not replace visible role/name or row-action execution evidence.

## Failure Signals

- Copy, edit, or action-menu controls are harder to reach than secondary or danger actions in normal reading state.
- A danger action lacks clear accessible naming.
- A failed-row retry duplicates the user message.
- A row entering edit or unsafe state leaves a mixed or broken action shell.
- Compatible message selectors disappear while actions are visible.

## Boundaries

- Message body rendering belongs to [Chat Message Rendering](feature.chat_message_rendering).
- Automatic generation recovery belongs to [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery).
- The chat workspace layout belongs to [Chat Workspace](page.chat_workspace).
- Streaming token timing, slash-command parsing, event timing, extension mount points, and message storage are outside this feature.
