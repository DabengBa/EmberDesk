# React Phase 4: State Management And Main-Chat Backlog

Status: planned
Owner doc: [React modernization roadmap](../../tech/react-modernization-roadmap.md)

## Purpose

Phase 4 creates the state and compatibility foundation required before any Phase 7 full owner cutover. It does not delete legacy globals or remove guarded fallbacks.

## Sprint Index

| Sprint | Canonical delivery spec | Delivery boundary |
|---|---|---|
| 1 | [Zustand store foundation](../260623-01-react-phase4-zustand-store-foundation/spec.md) | Introduce stores for migrated React surfaces without changing legacy ownership. |
| 2 | [Global compatibility bridge](../260623-02-react-phase4-global-compatibility-bridge/spec.md) | Keep `globalThis.SillyTavern`, `eventSource`, and `event_types` compatible while stores become observable. |
| 3 | [Extension migration guide](../260623-03-react-phase4-extension-migration-guide/spec.md) | Document supported extension-facing migration paths and compatibility expectations. |
| 4A | [Main-chat transport expansion](../260623-04-react-phase4a-main-chat-transport-expansion/spec.md) | Prove excluded transport paths can move toward React ownership while retaining request-level fallback. |
| 4B | [Main-chat renderer extraction](../260623-05-react-phase4b-main-chat-renderer-windowing-extraction/spec.md) | Extract renderer/windowing contracts before any full renderer cutover. |

The sibling `phase4-*.md` files in this folder are short roadmap stubs only. Use the canonical dated `spec.md` links above for `delivery-workflow`.

## Non-Goals

- No full SPA workspace shell.
- No deletion of legacy global exports.
- No removal of guarded island, build-missing, or request-level fallback.
- No canonical storage change.

## Shared Validation Gate

```powershell
bun run test:compat
bun run --cwd tests test:unit -- main-chat-visible-transport-owner.test.js chat-generation-lifecycle.test.js react-workspace-panels-helpers.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-streaming.e2e.js
bun run perf:interaction
bun run docs:check
```
