# Phase 7 Sprint 6: Main-Chat Renderer And Windowing Full Owner Cutover

Status: planned

## Goal

Make React the full owner for approved main-chat renderer and windowing behavior.

## Scope

- Cover formatter, rich media, file attachments, LaTeX, code blocks, editing rows, unsafe rows, streaming row transitions, and long-chat load-more/windowing.
- Use Phase 4B renderer/windowing proof and Phase 6 extension evidence before deleting legacy formatter owners.
- Retire or freeze `.mes_text`, `messageFormatting()`, `chat_truncation`, and `#show_more_messages` fallback paths by ADR.

## Non-Goals

- Do not change provider transport ownership in this sprint.
- Do not break extension-mutated message DOM without compatibility evidence.

## Acceptance

- Approved renderer/windowing paths have one runtime owner.
- Legacy formatter/windowing owners are deleted or ADR-frozen.
- Long-chat performance and extension compatibility remain protected.

## Validation

```bash
bun run build:react:workspace-panels
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-streaming.e2e.js
bun run test:compat
bun run perf:interaction
bun run docs:check
```
