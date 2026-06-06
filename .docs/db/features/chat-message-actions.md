---
id: feature.chat_message_actions
type: feature
name: Chat Message Actions
related: [page.chat_workspace]
---

# Feature: Chat Message Actions

## ID 解释

`feature.chat_message_actions` represents the visible controls attached to a rendered chat message in [Chat Workspace](page.chat_workspace). It covers discovering and triggering message-row actions such as copy, edit, checkpoint, swipe, reasoning actions, and media gallery navigation.

It does not define how message text is generated, streamed, formatted, or stored.

## Feature Purpose

This feature lets users operate on an existing chat message without leaving the conversation surface.

## Trigger Entry

- **Message action entry**: use the actions exposed on a rendered message row.
- **Expanded actions entry**: use additional message actions when the workspace is configured to show expanded message actions.
- **Swipe entry**: use the message swipe controls when a message has visible swipe state.
- **Reasoning entry**: use reasoning controls when the message includes an editable or collapsible reasoning block.
- **Media gallery entry**: use gallery swipe controls when a message contains swipeable media.

## Interaction IDs

- `feature.chat_message_actions`: the overall message-row action surface.
- `feature.chat_message_actions.primary_menu`: the message actions affordance attached to a message row.
- `feature.chat_message_actions.copy`: copy the message text or action payload exposed by the existing message row controls.
- `feature.chat_message_actions.edit`: enter or operate the existing message edit mode.
- `feature.chat_message_actions.checkpoint`: open or create a checkpoint-related chat action from the message row.
- `feature.chat_message_actions.swipe`: navigate message swipes when swipe controls are visible.
- `feature.chat_message_actions.reasoning`: copy, edit, remove, or collapse reasoning blocks when reasoning controls are visible.
- `feature.chat_message_actions.media_gallery`: navigate swipeable media attached to a message.

## User Flow

1. The user opens or continues a chat in [Chat Workspace](page.chat_workspace).
2. EmberDesk renders one or more message rows in the main chat region.
3. The user identifies an action on a message row by visible icon, accessible name, or keyboard focus.
4. The user triggers the action.
5. EmberDesk follows the existing action behavior, such as copying, entering edit mode, opening checkpoint chat, changing swipe, changing reasoning state, or navigating media.

## Business Rules And Boundaries

- Message text remains the primary content. Message actions should be discoverable without visually overwhelming the message body.
- Message action controls must keep stable selectors and message DOM identity so first-party modules and compatible extensions can keep locating messages.
- The protected message surfaces include `#chat > .mes`, `.mes_text`, `.mes[mesid]`, swipe controls, reasoning wrappers, media wrappers, and file wrappers.
- Hidden or inactive message actions can remain hidden according to existing workspace state, but when an action becomes visible it should have a stable role, accessible name, and focus affordance.
- This feature does not change streaming, message formatting, slash-command parsing, event timing, or extension mount points.

## ID Boundary Notes

This feature is separate from [Chat Workspace](page.chat_workspace) because message-row actions are a recurring user-visible control surface with compatibility risk. It is also separate from generation and streaming because it applies to messages that are already rendered.

## Outcomes

- **Success**: the user can discover and use the available actions on a rendered message row.
- **Hidden state**: actions that are not valid for the current message remain hidden or inactive according to the existing UI rules.
- **Compatibility state**: message DOM selectors and event-facing surfaces remain stable for compatible code.
