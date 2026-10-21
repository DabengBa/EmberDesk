---
id: feature.chat_regenerate
type: feature
name: Chat Turn Regenerate
related: [page.chat_workspace, feature.chat_message_actions, feature.chat_generation_auto_recovery, feature.reply_pipeline]
---

# Feature: Chat Turn Regenerate

## ID 解释

`feature.chat_regenerate` represents the chat-options menu action labelled 重新生成 ("Regenerate reply") in [Chat Workspace](page.chat_workspace). It covers discarding the current turn's generated output and producing a replacement through the shared generation service.

It does not define message-row actions (copy/edit/branch), composer send behavior, or automatic failure recovery internals.

## Purpose

Let users re-roll the current turn — the reply the AI produced after the last user message — without re-typing, re-sending, or duplicating their prompt.

## User-Visible Contract

- The chat-options menu (the button opening 开始新聊天 / 关闭聊天 / 管理聊天文件 / 删除消息) exposes a `重新生成` entry between 管理聊天文件 and the destructive 删除消息 section.
- The entry stays mounted at all times; it is disabled while a generation is in flight, while composer slash commands are executing, while a message is being edited, when no provider is connected, and when there is no active chat or the chat is empty. Availability is re-evaluated every time the menu opens, and the handler re-validates on click.
- Clicking 重新生成 removes the generated tail of the current turn — the assistant reply plus its same-turn tool/pipeline cards and failure recovery rows — and generates a replacement with the same preceding context.
- Regeneration never creates a duplicate user message, never reads or clears the composer draft, never runs slash commands from the composer, never fires `send_if_empty`, and never attaches pending composer files.
- When the chat's last message is a user message, the action is still available and fills in the missing assistant reply without deleting anything.
- Manually inserted rows stop the cleanup: narrator notes, slash-command assistant messages, and plain system notices are never removed; if such a row sits at the end, regenerate appends a new reply after it instead.
- A generation-only greeting can be re-rolled the same way — the old first message is replaced.
- The replacement runs through the normal visible generation path: streaming, tool calls, reply-pipeline rounds, prompt triggers, and bounded automatic recovery behave exactly like a fresh send.
- When regeneration fails after automatic recovery is exhausted, the removed turn is restored verbatim and a toast announces the restore. Restore is skipped — with a visible error toast — when the active chat changed mid-flight or the chat tail no longer matches the snapshot shape; in those cases the failed attempt's rows are kept rather than destroying both turns.
- When the user stops an in-flight regeneration, whatever the new attempt already produced is kept and the old turn is not restored — including the edge case where the stop lands before any new output, which leaves the turn empty.

## Generation Boundary

The menu dispatches the `regenerate` command kind into the same visible-generation lifecycle as composer submission (`lifecycleType: 'normal'`). The service owns tail removal, snapshot, provider transport, recovery, and final result persistence; the menu and React item only project availability. Removing the tail happens before prompt assembly so the previous reply never feeds the new request.

## Semantic Interaction IDs

- `feature.chat_regenerate`: the overall regenerate-turn surface.
- `feature.chat_regenerate.menu_action`: the options-menu entry point.
- `feature.chat_regenerate.turn_cleanup`: snapshotting and removing the current turn's generated tail.
- `feature.chat_regenerate.failure_restore`: restoring the snapshotted turn after a failed regeneration.

## Acceptance Workflows

- As a user unhappy with the last reply, open the chat-options menu, pick 重新生成, and wait for the new reply; EmberDesk must replace the old turn with exactly one new reply, send no second user message, and leave the composer draft untouched — failure is a duplicated user row, a cleared draft, or the old reply's content reaching the new request.
- As a user whose last send got no reply, open the menu and pick 重新生成; EmberDesk must generate the missing assistant reply while keeping the user message — failure is a deleted or re-sent user row.
- As a user on a flaky connection, regenerate and watch every retry fail; EmberDesk must put the previous turn back in place with a visible notice — failure is losing the old reply or leaving both old and failed rows in the chat.
- As a user mid-edit or mid-generation, open the menu; EmberDesk must show 重新生成 disabled rather than allowing a conflicting run — failure is starting a second generation or deleting the message being edited.

## Feature-Specific Evidence

- The `option_regenerate` item ID, its enabled/disabled state on menu open, and its position relative to other items are primary evidence.
- Request bodies captured at the transport boundary must not contain the removed turn's text or tool invocations.
- Chat state after success must contain exactly one replacement tail; after total failure it must equal the pre-regenerate snapshot.
- `tests/chat-regenerate.test.js` covers tail identification and snapshot integrity; `tests/chat-regenerate.e2e.js` covers menu flow, prompt content, failure restore, and user-stop behavior.

## Failure Signals

- A second user message appears after regenerating.
- The composer draft is cleared, executed as a slash command, or gains a pending attachment.
- Old reply text, folded pipeline markup, or tool-card content appears in the new request.
- A failed regeneration leaves the old reply deleted or duplicated.
- The menu action fires while a generation is already running.

## Boundaries

- Message-row actions belong to [Chat Message Actions](feature.chat_message_actions).
- Automatic retry/fallback mechanics belong to [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery).
- Pipeline step execution and card folding belong to [Reply Pipeline](feature.reply_pipeline).
- The chat workspace layout belongs to [Chat Workspace](page.chat_workspace).
