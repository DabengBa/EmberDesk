---
id: feature.prompt_inspector
type: feature
name: Prompt Inspector
related: [page.chat_workspace, feature.prompt_panel, feature.reply_pipeline]
---

# Feature: Prompt Inspector

## ID 解释

`feature.prompt_inspector` represents the user-visible request-level preview surface reached from the [Prompt Preset Panel](feature.prompt_panel): a modal overlay that assembles the request body the next chat-completion send would produce and shows it before anything is transmitted. It reuses the real generation assembly path and stops before the fetch — it is not a last-request history viewer, not a provider-side (`postProcessPrompt`) inspector, and not a per-message token itemization surface.

## Purpose

Let users verify what the model is actually about to see — resolved prompt order, activated world info, character description, chat history after context-budget trimming, regex-substituted pending input, tools, pipeline step shaping, and sampling parameters — without spending a real generation.

## User-Visible Contract

- A `查看 Prompt` action sits in the `提示词管理` header row of the prompt preset drawer, next to `新建`. Clicking it opens a modal overlay labelled `预览（未发送）` inside [Chat Workspace](page.chat_workspace).
- The overlay shows the pending request in a single column. The `消息` view lists messages in request order with their original indices, badges, collapsible content, and source/token metadata when available. Search matches message text, tool names, and original indices. The pending composer message is marked `预览合成` when its entry is identified; it is never written to chat storage.
- In pipeline previews, a recognized synthetic `story_preset` call and its matching adjacent `OK` receipt appear together with both original indices and readable preset text. The round instruction starts expanded. Unmatched calls and receipts remain separate; grouping and search never change the request.
- `请求详情` sits above the list and starts collapsed. It contains request parameters (including the token cap and tool choice) and expandable tool definitions. When the preview reports trimmed entries or summarized turns, they are listed separately from the request messages.
- Pipeline preview builds the selected round with its own model (the fallback request inherits the preset), without mutating a live run. The shared history/media prefix uses the first runnable step's model, matching live assembly; later mixed-model rounds reuse that prefix.
- When a runnable [Reply Pipeline](feature.reply_pipeline) exists, the selector opens on the first step (for example, `轮次 1/1 · submit_story`). Each numbered step previews its scoped material and instruction, the current step name forced in `tool_choice` regardless of legacy `enforce_mode`, and its token cap and reasoning effort. The separate unnumbered `兜底请求（仅当末步无可用回复时）` option previews the conditional fallback. It uses `tool_choice: 'none'` when tool definitions are available; otherwise it omits tool wiring. Selecting either kind of preview neither sends a request nor touches live run state.
- `刷新` reassembles against current state. `原始 JSON` displays the full unfiltered request body and `复制 JSON` copies the same body, regardless of message search or expansion. Escape, the close button, or the backdrop dismisses the overlay.
- For server-side generation, the preview includes staged attachments without uploading them or removing them from the composer. The legacy preview reports known divergences as warnings, including omitted attachments, slash-command input, bias-only input, budget overflow, and assembly errors. Preview does not send a model-generation request, add a chat message, clear the composer, or execute commands. Slash-prefixed text is ordinary message input. It assembles temporary prompt data in memory; other application services and event listeners may still run during assembly, including memory maintenance.
- Temporary prompts created for a preview are scoped to that preview, so a simultaneous background generation does not consume them. A refresh takes a new snapshot of shared prompt data; changes made later by independent or contextless event listeners are not automatically attributed to an already-running preview. Consequently parity with a later send assumes the relevant state and listener contributions remain unchanged.
- The overlay also supports temporary Assistant chats. If there is no chat or draft to preview, or the chat completion API is not in use, it shows an explanatory empty state.

## Semantic Interaction IDs

- `feature.prompt_inspector`: the request-preview overlay.
- `feature.prompt_inspector.open`: opening the preview from the prompt drawer header.
- `feature.prompt_inspector.refresh`: reassembling the preview against current state.
- `feature.prompt_inspector.round_select`: choosing a reply-pipeline round to preview.
- `feature.prompt_inspector.copy`: copying the request body JSON.
- `feature.prompt_inspector.message_expand`: expanding a message row to read its full content.

## Acceptance Workflows

- As a user about to send a message, type into the composer and open `查看 Prompt` from `提示词`; the overlay must show the pending text as the newest `预览合成` chat entry inside the ordered message list, the composer must keep its text, no message is appended to chat history, and no model request is sent. Failure is a sent request, a cleared composer, or a preview that omits the pending text.
- As a user checking prompt composition, toggle a prompt entry or world info content and press `刷新`; the message list must reflect the change. With unchanged state and listener contributions, the raw JSON must contain the same ordered messages that a subsequent real send transmits. Failure is unexplained drift under those conditions.
- As a user locating a preset, search its text, `story_preset`, or either original index. Open `原始 JSON` or copy it while a search is active; both original messages must still appear in the full request.
- As a user inspecting a prompt while background generation runs, the background request must not include the preview's temporary prompt or World Info activation, and the preview must retain its own assembly.
- As a user inspecting a long chat, open the preview after history exceeds the context budget; entries that failed the budget check must appear in the dropped-messages section. Failure is silently truncated history.
- As a user with a runnable reply pipeline, open or reopen the preview on the first step, then switch the round selector. Each step round must show its step-scoped material and instruction, force that step's name in `tool_choice` even with legacy `enforce_mode: 'auto'`, and show its token cap when configured. The conditional fallback is separate from the numbered steps and must show `tool_choice: 'none'` when tools are available, or no tool wiring otherwise. It remains marked `预览（未发送）`. Failure is a preview that sends a request, mutates the live pipeline run, or ignores per-step overrides.
- As a user with a staged attachment in a server-generated chat, open the preview and verify that it includes the attachment while leaving it staged. Without changing the draft, send the message; the preview and send must use the same attachment content.

## Feature-Specific Evidence

- The `.prompt-inspector-overlay` / `.prompt-inspector-panel` modal with the `预览（未发送）` badge, searchable message rows, collapsed request details, raw JSON, and reported dropped-messages section are primary evidence.
- `previewNextGenerationRequest()` in `generation-service.js` returning `{ kind: 'prompt-preview', request, entries, dropped, budget, pipeline, warnings }` is data-contract evidence; an end-to-end comparison asserting the preview body deep-equals the real POST body is parity evidence.
- `CHAT_COMPLETION_SETTINGS_READY` not being emitted during preview and the request-scoped prompt map are evidence for the preview boundary; concurrent preview/background browser coverage verifies the isolation rather than assuming event listeners have no side effects.

## Failure Signals

- `查看 Prompt` is missing from the prompt manager header, or clicking it sends a request.
- The preview drops the pending composer text, or writes it into `chat`.
- Live pipeline `runState` or prompt-manager token bookkeeping changes after opening/closing the overlay.
- The preview shows a different message order or parameter set than the request that a real send produces.
