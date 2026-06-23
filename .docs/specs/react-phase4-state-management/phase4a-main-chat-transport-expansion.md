# Phase 4A: Main-Chat Compatibility Transport Expansion

Status: planned

## Goal

Prove whether excluded main-chat transport paths can be handled by the React visible transport owner before Phase 7 removes request-level fallback.

## Scope

- Evaluate non-OpenAI, group, dry-run, nested visible, quiet, and background generation paths separately.
- Keep request-level fail-closed fallback until each path has provider matrix proof.
- Record owner split, row identity, stop/retry/fallback behavior, token append behavior, and excluded paths per transport.

## Non-Goals

- Do not remove legacy provider transport fallback.
- Do not rewrite `.mes_text` renderer or formatter ownership.
- Do not fold all transport paths into one unreviewable implementation.

## Acceptance

- Each supported path has focused unit/E2E proof.
- Unsupported paths remain explicitly excluded with fallback behavior documented.
- Phase 7 Sprint 5 receives a concrete cutover checklist.

## Validation

```powershell
bun run --cwd tests test:unit -- main-chat-visible-transport-owner.test.js chat-generation-lifecycle.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js
bun run test:compat
bun run docs:check
```
