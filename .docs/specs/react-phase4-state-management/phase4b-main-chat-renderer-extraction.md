# Phase 4B: Main-Chat Renderer And Windowing Extraction

Status: planned

## Goal

Extract renderer, formatter, media, and long-chat windowing contracts so Phase 7 can decide whether React can become the full renderer owner.

## Scope

- Map legacy `messageFormatting()`, media/file/code/LaTeX handling, rich body behavior, and extension hooks.
- Extract testable renderer/windowing contracts without replacing all visible rendering.
- Prove long-chat load-more/windowing behavior and extension compatibility.

## Non-Goals

- Do not remove `.mes_text` legacy formatter ownership.
- Do not replace extension mutation hooks without Phase 6 evidence.
- Do not remove `#show_more_messages` or `chat_truncation` owners.

## Acceptance

- Formatter and windowing behavior is described by tests and logic docs where needed.
- Unsafe rows, editing rows, streaming rows, and extension-mutated rows keep safe fallback behavior.
- Phase 7 Sprint 6 receives a renderer/windowing cutover checklist.

## Validation

```powershell
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js
bun run test:compat
bun run perf:interaction
bun run docs:check
```
