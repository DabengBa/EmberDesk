---
id: feature.chat_regenerate
type: feature
name: Chat Turn Regenerate
related: [page.chat_workspace, feature.chat_message_actions, feature.chat_generation_auto_recovery, feature.reply_pipeline]
---

# Feature: Chat Turn Regenerate

## ID 解释

`feature.chat_regenerate` represents the chat-options menu action labelled 重新生成 ("Regenerate reply") in [Chat Workspace](page.chat_workspace). It covers discarding the current turn's generated output and producing a replacement. It does not define message-row actions, composer send behavior, or automatic failure recovery mechanics.

## Purpose

Let users re-roll the current turn — the reply the AI produced after the last user message — without re-typing, re-sending, or duplicating their prompt.

## User-Visible Contract

- The chat-options menu with 开始新聊天 / 关闭聊天 / 管理聊天文件 / 删除消息 exposes a `重新生成` entry between 管理聊天文件 and the destructive 删除消息 section.
- The entry is always present but disabled while a generation is in flight, while a message is being edited, when no provider is connected, and when there is no active chat or the chat is empty. Availability is re-evaluated whenever the menu opens and re-checked when the entry is used.
- On a server-generated turn, choosing 重新生成 immediately takes the reader to the bottom, hides the previous generated output, shows `重新生成中…` in its place, and makes Stop available. The replacement appears in the same part of the conversation without sending the old reply to the model. If the reader scrolls up after triggering regeneration, incoming output does not pull them back to the bottom. On success, only the new reply remains; there is no version history.
- Regeneration never creates a duplicate user message, never reads or clears the composer draft, and never attaches pending composer files or sends an empty-composer fallback.
- When the chat's last message is a user message, the action is still available and fills in the missing assistant reply without deleting anything.
- Manually inserted rows stop cleanup: narrator notes, manually inserted assistant messages, and plain system notices are never removed; if such a row sits at the end, regenerate appends a new reply after it.
- A generation-only greeting can be re-rolled the same way — the old first message is replaced.
- Stopping or failing before a replacement is saved restores the previous reply, if there was one, and discards partial output. A failed run shows a localized notice inviting retry. For a saved chat, switching chats or refreshing does not stop an active replacement; reopening the chat shows its current progress or saved result.
- Temporary Assistant chats can regenerate an unanswered turn like saved chats. Continue is available only with an assistant reply to extend: it preserves that reply, adds only the new text, and leaves the composer draft alone. Stop discards the unfinished addition; Retry after a failed continuation continues the same reply rather than replacing it.

## Generation Boundary

The menu starts regeneration of the current turn without submitting the composer. The replacement is shown as temporary output until it is saved.

## Semantic Interaction IDs

- `feature.chat_regenerate`: the overall regenerate-turn surface.
- `feature.chat_regenerate.menu_action`: the options-menu entry point.
- `feature.chat_regenerate.turn_cleanup`: snapshotting and removing the current turn's generated tail.
- `feature.chat_regenerate.failure_restore`: restoring the snapshotted turn after a failed regeneration.

## Acceptance Workflows

- As a user unhappy with the last reply, open the chat-options menu, choose 重新生成, and wait for the new reply; EmberDesk must replace the old turn with exactly one new reply, send no second user message, and leave the composer draft untouched — failure is a duplicated user row, a cleared draft, or the old reply's content reaching the new request.
- As a user whose last send got no reply, open the menu and choose 重新生成; EmberDesk must generate the missing assistant reply while keeping the user message — failure is a deleted or re-sent user row.
- As a user regenerating a generated reply, see the inline status and Stop before the model responds. Stop during preparation, stop midway, or let the attempt fail: the original reply must reappear exactly once, with no partial replacement saved.
- As a user mid-edit or mid-generation, open the menu; EmberDesk must show 重新生成 disabled rather than allowing a conflicting run — failure is starting a second generation or deleting the message being edited.

## Failure Signals

- A second user message appears after regenerating.
- The composer draft is cleared, submitted, or gains a pending attachment.
- Old reply text or folded pipeline content appears in the new request.
- A failed regeneration leaves the old reply deleted or duplicated.
- The menu action starts while a generation is already running.
- Regeneration pulls the reader back to the bottom after they scroll up.

## Boundaries

- Message-row actions belong to [Chat Message Actions](feature.chat_message_actions).
- Automatic retry and fallback mechanics belong to [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery).
- Pipeline step execution and card folding belong to [Reply Pipeline](feature.reply_pipeline).
- The chat workspace layout belongs to [Chat Workspace](page.chat_workspace).
- The same menu offers Continue when the last saved reply can be extended. It appends to that reply without consuming the composer draft or creating a second assistant message. If the attempt fails, the previous reply stays saved.
