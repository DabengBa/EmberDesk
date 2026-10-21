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
- The overlay lists the ordered `messages` of the pending request body exactly as they would be POSTed to `/api/backends/chat-completions/generate`: index, role badge, source identifier (preset prompt id or `chatHistory-N`), token count, and collapsible full content. The pending composer message is appended as the newest chat entry and marked `预览合成`; it is never written to chat storage.
- A budget strip shows context size, reserved response tokens, used tokens, and remaining budget; entries trimmed by the context budget are listed separately as dropped history.
- A parameters grid shows the request fields (`model`, `temperature`, `top_p`, `max_tokens`/`max_completion_tokens`, `stop`, `stream`, penalties, `reasoning_effort`, `verbosity`, `tool_choice`, `json_schema`, tool count) as they will be sent.
- When a runnable [Reply Pipeline](feature.reply_pipeline) exists, a round selector previews each step round (step instruction appended, forced `tool_choice`, per-step token cap and reasoning effort) and the closing no-tools round, without touching live run state.
- `刷新` reassembles against current state; `复制 JSON` copies the full request body; Escape, the close button, or the backdrop dismisses the overlay.
- The preview performs no network request, writes no chat or settings state, does not clear the composer, does not materialize pending attachments, does not execute slash commands, and stores nothing persistently — prompt content stays in memory only. Known divergence is surfaced as explicit warnings (pending attachment, slash-command input, bias-only input, budget overflow, assembly error) rather than silently omitted.
- When no character is active or the chat completion API is not in use, the overlay shows an explanatory empty state instead of a partial prompt.

## Semantic Interaction IDs

- `feature.prompt_inspector`: the request-preview overlay.
- `feature.prompt_inspector.open`: opening the preview from the prompt drawer header.
- `feature.prompt_inspector.refresh`: reassembling the preview against current state.
- `feature.prompt_inspector.round_select`: choosing a reply-pipeline round to preview.
- `feature.prompt_inspector.copy`: copying the request body JSON.
- `feature.prompt_inspector.message_expand`: expanding a message row to read its full content.

## Acceptance Workflows

- As a user about to send a message, type into the composer and open `查看 Prompt` from `提示词`; the overlay must show the pending text as the newest `预览合成` chat entry inside the ordered message list, the composer must keep its text, no message is appended to chat history, and no request reaches `/api/backends/chat-completions/generate`. Failure is a sent request, a cleared composer, or a preview that omits the pending text.
- As a user checking prompt composition, toggle a prompt entry or world info content and press `刷新`; the message list and budget strip must reflect the change, and the listed messages must equal what a subsequent real send transmits. Failure is drift between the preview body and the real request body.
- As a user inspecting a long chat, open the preview after history exceeds the context budget; entries that failed the budget check must appear in the dropped-messages section. Failure is silently truncated history.
- As a user with a runnable reply pipeline, switch the round selector; each step round must show its step instruction and step-specific `tool_choice`/token cap, and the closing round must show no tool wiring. Failure is a preview that mutates the live pipeline run or ignores per-step overrides.
- As a user with a pending attachment or `/`-prefixed input, open the preview; the overlay must show the corresponding warning instead of pretending the attachment or command result is included.

## Feature-Specific Evidence

- The `.prompt-inspector-overlay` / `.prompt-inspector-panel` modal with the `预览（未发送）` badge, message rows carrying role/identifier/token metadata, the dropped-messages section, and the parameters grid are primary evidence.
- `previewNextGenerationRequest()` in `generation-service.js` returning `{ kind: 'prompt-preview', request, entries, dropped, budget, pipeline, warnings }` is data-contract evidence; an end-to-end comparison asserting the preview body deep-equals the real POST body is parity evidence.
- `CHAT_COMPLETION_SETTINGS_READY` not being emitted during preview and `extension_prompts` snapshot/restore are no-side-effect evidence.

## Failure Signals

- `查看 Prompt` is missing from the prompt manager header, or clicking it sends a request.
- The preview drops the pending composer text, or writes it into `chat`.
- Live pipeline `runState` or prompt-manager token bookkeeping changes after opening/closing the overlay.
- The preview shows a different message order or parameter set than the request that a real send produces.
