# React Phase 7: Full Owner Cutover And Legacy Fallback Retirement

Status: planned
Owner doc: [React modernization roadmap](../../tech/react-modernization-roadmap.md)

## Purpose

Phase 7 is the explicit full owner cutover phase. It removes, freezes, or long-term supports legacy owners and fallbacks only after Phase 1-6 evidence is complete and an ADR or ADR update approves the cut.

## Entry Conditions

- Phase 1-3B guarded islands and visible owners are enabled and passing regression gates.
- Phase 4A/4B transport, renderer, and windowing evidence exists.
- Phase 5 typed API evidence exists where a surface needs route owner changes.
- Phase 6 extension compatibility evidence exists.
- Each sprint has an ADR or ADR update for fallback removal, freezing, or long-term support.

## Sprint Index

| Sprint | File | Owner cutover target |
|---|---|---|
| 1 | [Character Library](phase7-sprint1-character-library-full-owner-cutover.md) | Tag filtering, bulk effects, delete confirmation, list lifecycle, and legacy fallback retirement. |
| 2 | [World Info](phase7-sprint2-world-info-full-owner-cutover.md) | Prompt activation, regex placement, import/converter result handling, delete cascade, entry lifecycle. |
| 3 | [Background Library](phase7-sprint3-background-library-full-owner-cutover.md) | File actions, thumbnails, folder state, selection/lock effects, slash-command handoff. |
| 4 | [Extensions Host](phase7-sprint4-extensions-host-full-owner-cutover.md) | Extension host owner, install/update/delete UI protocol, mount readiness, compatibility freeze/delete decisions. |
| 5 | [Main-chat transport](phase7-sprint5-main-chat-transport-full-owner-cutover.md) | Provider transport matrix, token append, stop/retry/fallback/finalization ownership. |
| 6 | [Main-chat renderer and windowing](phase7-sprint6-main-chat-renderer-windowing-full-owner-cutover.md) | Formatter, rich media, file/code/LaTeX, editing/unsafe/streaming rows, long-chat windowing. |
| 7 | [Workspace shell and globals](phase7-sprint7-workspace-shell-global-compatibility-decision.md) | Full SPA shell decision, legacy jQuery shell, global compatibility exports. |

## Shared Validation Gate

```powershell
bun run build:lib
bun run build:react
bun run build:react:character-library
bun run build:react:workspace-panels
bun run test:unit
bun run test:compat
bun run --cwd tests test:e2e -- login.e2e.js chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-streaming.e2e.js
bun run perf:startup
bun run perf:interaction
bun run docs:check
```
