# React Phase 7: Full Owner Cutover And Legacy Fallback Retirement

Status: delivered archive entry
Owner doc: [React modernization roadmap](../../tech/react-modernization-roadmap.md)

## Purpose

Phase 7 is the explicit full owner cutover phase. It removes, freezes, or long-term supports legacy owners and fallbacks only after Phase 1-6 evidence is complete and an ADR or ADR update approves the cut. As of 2026-06-24, the dated implementation specs for this phase have all been delivered and are ready to leave the active `.docs/specs/` workspace; this README remains as the durable phase-level archive entry.

## Durable Entry Points

- Archive brief: [react-phase7-full-owner-cutover-sequenced-specs](../../tech/briefs/react-phase7-full-owner-cutover-sequenced-specs.md)
- Project history: [PROJECT_HISTORY](../../PROJECT_HISTORY.md)
- ADR closeout: [ADR-0007](../../adr/0007-react-page-islands-with-legacy-fallbacks.md)
- Compatibility owner doc: [third-party-extension-compatibility](../../tech/third-party-extension-compatibility.md)
- Main-chat transport proof: [main_chat_streaming_transport_bridge_processing_flow](../../logic-description/main_chat_streaming_transport_bridge_processing_flow.md)
- Main-chat renderer/windowing proof: [main-chat-rendering-call-chain](../../tech/main-chat-rendering-call-chain.md)

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

## Delivered Intent Domains

The sprint files above remain the roadmap-facing anchors. The dated implementation set was delivered in the following order and is now preserved here as an archive index rather than as active `spec.md` links:

| Order | Intent domain | Delivered closure |
|---|---|---|
| 1 | `260623-05-phase7-character-library-full-owner-cutover` | Character Library React owner became the normal list/filter/bulk state owner; legacy path is now only a documented same-entry emergency facade. |
| 2 | `260623-06-phase7-world-info-full-owner-cutover` | World Info React host now owns visible action entry points through explicit helpers while regex, prompt activation, import/export semantics, and delete cascade stay compatibility-safe. |
| 3 | `260623-07-phase7-background-library-full-owner-cutover` | Background Library React host owns visible actions and state resampling while file actions, thumbnails, folder state, and slash compatibility remain stable. |
| 4 | `260623-08-phase7-extensions-host-full-owner-cutover` | Extensions Host React surface owns visible notify/manage/install/Extras controls while protected mount points and extension protocol surfaces remain frozen for compatibility. |
| 5 | `260623-09-phase7-main-chat-transport-compat-paths` | Non-OpenAI, group, dry-run, and nested visible transport paths were converted from ambiguous fallback to explicit ADR-frozen legacy compatibility decisions. |
| 6 | `260623-10-phase7-main-chat-transport-quiet-background` | Quiet/background helper generation was separated into an explicit non-visible legacy contract instead of remaining inside the visible transport matrix. |
| 7 | `260623-11-phase7-main-chat-renderer-rich-body-owner` | React became the final visible rich-body owner for safe finalized rows while unsafe/editing/extension-mutated rows stay fail-closed on legacy ownership. |
| 8 | `260623-12-phase7-main-chat-renderer-windowing-row-lifecycle` | Row lifecycle, reading-position restore, long-chat windowing closure, and performance proof were completed under the same main-chat owner split. |
| 9 | `260623-13-phase7-global-compatibility-exports-decision` | `globalThis.SillyTavern` and `@sillytavern/*` were frozen as documented compatibility facades; `eventSource` / `event_types` remain long-term supported public contracts. |
| 10 | `260623-14-phase7-workspace-shell-final-owner-decision` | The roadmap closed by freezing the existing jQuery workspace shell as the long-term runtime facade for `/` instead of forcing a full SPA shell cutover. |

## Shared Validation Gate

```bash
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
