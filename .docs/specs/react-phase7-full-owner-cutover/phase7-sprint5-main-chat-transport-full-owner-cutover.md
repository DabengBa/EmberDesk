# Phase 7 Sprint 5: Main-Chat Transport Full Owner Cutover

Status: planned

## Goal

Make the React visible transport owner cover all approved main-chat provider paths and retire request-level legacy fallback where proof exists.

## Scope

- Cover OpenAI, non-OpenAI, group, dry-run, nested visible, quiet/background generation, stop, retry, fallback, token append, and finalization.
- Use Phase 4A provider matrix proof before deleting fallback for any path.
- Keep unsupported provider paths explicitly excluded or ADR-frozen.

## Non-Goals

- Do not rewrite message renderer/windowing in this sprint.
- Do not remove extension compatibility exports.

## Acceptance

- Approved transport paths have one runtime owner.
- Request-level fallback is deleted or ADR-frozen per path.
- Stop/retry/fallback/token append/finalization behavior is covered by tests.

## Validation

```bash
bun run build:react:workspace-panels
bun run --cwd tests test:unit -- main-chat-visible-transport-owner.test.js chat-generation-lifecycle.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js
bun run test:compat
bun run docs:check
```
