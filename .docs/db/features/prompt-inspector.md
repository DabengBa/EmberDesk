---
id: feature.prompt_inspector
type: feature
name: Prompt Inspector
related: [page.chat_workspace, feature.prompt_panel, feature.reply_pipeline]
---

# Feature: Prompt Inspector

## ID 解释

`feature.prompt_inspector` represents the user-visible request-level preview reached from [Prompt Panel](feature.prompt_panel). It assembles what the next chat-completion send would show the model and displays it before anything is transmitted. It is not a last-request history viewer or a per-message token itemization surface.

## Purpose

Let users verify what the model is actually about to see — prompt order, activated World Info, character description, chat history after trimming, the pending input, tools, [Reply Pipeline](feature.reply_pipeline) step shaping, and sampling parameters — without spending a real generation.

## User-Visible Contract

- A `查看 Prompt` action sits in the `提示词管理` header row of the prompt drawer, next to `新建`. Clicking it opens a modal labelled `预览（未发送）` inside [Chat Workspace](page.chat_workspace).
- The overlay shows the pending request in one column. The model and round selector sit below the title, followed by the view switcher. In the message view, `请求顺序` and search precede the list, which preserves original indices, collapsible content, and source/token metadata when available. Search matches message text, tool names, and original indices. The pending composer message is marked `预览合成` when identified and is never written to chat history.
- In pipeline previews, recognized preset material, history summaries, verbatim chat history, and current input appear as readable text with the original indices of both the synthetic call and its matching receipt. History labels distinguish the player, AI reply, and narrator. The round instruction starts expanded. Unmatched calls and receipts remain separate; grouping and search never change the request.
- `请求详情` sits above the list and starts collapsed. It contains request parameters, including the token cap and tool choice, and expandable tool definitions. Trimmed entries and summarized turns are listed separately from the request messages.
- Pipeline preview builds the selected round with its own model; the fallback request inherits the preset. The shared history/media prefix uses the first runnable step's model, matching live assembly; later mixed-model rounds reuse that prefix. Selection never changes a live run.
- For server generation, the action selector starts on send and offers regenerate and continue when available. Send includes the composer draft and staged attachments; regenerate leaves out the replaced reply; continue includes the reply being extended. Neither regenerate nor continue includes the composer draft. Changing actions returns the round selector to the first round.
- When a runnable [Reply Pipeline](feature.reply_pipeline) exists, the selector opens on the first step. Each numbered step previews its scoped material and instruction, its forced step name, its token cap, and its reasoning effort. A separate unnumbered `兜底请求（仅当末步无可用回复时）` option previews the conditional fallback with tools disabled when definitions are available, or omitted otherwise. Selecting either preview neither sends a request nor touches live run state.
- `刷新` reassembles against current state. The full unfiltered request can be displayed or copied regardless of message search or expansion. Escape, the close button, or the backdrop dismisses the overlay.
- For server generation, the preview includes staged attachments without uploading them or removing them from the composer. Known divergences are reported as warnings, including omitted attachments, command-like input, bias-only input, budget overflow, and assembly errors. Preview never sends a generation request, adds a chat message, clears the composer, or executes commands. Command-like text is ordinary message input.
- Temporary prompt material created for a preview is scoped to that preview, so a simultaneous background generation does not consume it. Refresh takes a new snapshot of shared prompt material. Later changes by independent listeners are not automatically attributed to an already-running preview; parity with a later send assumes the relevant state and listener contributions remain unchanged.
- The overlay also supports temporary Assistant chats. Without a chat or draft to preview, or when chat completions are not in use, it shows an explanatory empty state.

## Semantic Interaction IDs

- `feature.prompt_inspector`: the request-preview overlay.
- `feature.prompt_inspector.open`: opening the preview from the prompt drawer header.
- `feature.prompt_inspector.refresh`: reassembling the preview against current state.
- `feature.prompt_inspector.round_select`: choosing a reply-pipeline round to preview.
- `feature.prompt_inspector.copy`: copying the request body JSON.
- `feature.prompt_inspector.message_expand`: expanding a message row to read its full content.

## Acceptance Workflows

- As a user about to send a message, type into the composer and open `查看 Prompt` from `提示词`; the overlay must show the pending text as the newest `预览合成` entry in order, the composer must keep its text, no message may be appended, and no request may be sent. Failure is a sent request, a cleared composer, or a preview that omits the pending text.
- As a user checking prompt composition, toggle a prompt entry or World Info content and refresh; the message list must reflect the change. With unchanged state and listener contributions, the preview must match what a subsequent real send transmits. Failure is unexplained drift under those conditions.
- As a user locating a preset, search its text, its identifier, or either original index. Display or copy the full request while a search is active; all original messages must still appear.
- As a user inspecting a prompt while background generation runs, the background request must not include the preview's temporary prompt material or World Info activation, and the preview must retain its own assembly.
- As a user inspecting a long chat after history exceeds the context budget, entries that failed the budget check must appear in the dropped-messages section. Failure is silently truncated history.
- As a user with a runnable pipeline, open or reopen the preview on the first step and switch rounds. Each step must show scoped material and instruction and its forced step name; the conditional fallback stays separate and shows tools disabled when available. The overlay must remain marked `预览（未发送）`, and failure is a preview that sends a request, mutates the live run, or ignores per-step settings.
- As a user with a staged attachment, open the preview and verify that it includes the attachment while leaving it staged. Without changing the draft, send the message; the preview and send must use the same attachment content.

## Failure Signals

- `查看 Prompt` is missing from the prompt manager header, or clicking it sends a request.
- The preview drops the pending composer text or writes it into chat.
- Live pipeline state or prompt-manager bookkeeping changes after opening or closing the overlay.
- The preview shows a different message order or parameter set than a real send.
- Temporary preview material leaks into a concurrent background generation.
- Refresh does not reflect changed prompt or World Info content.

## Boundaries

- Preset editing and entry ordering belong to [Prompt Panel](feature.prompt_panel).
- Pipeline step execution and card behavior belong to [Reply Pipeline](feature.reply_pipeline).
- Chat workspace placement belongs to [Chat Workspace](page.chat_workspace).
