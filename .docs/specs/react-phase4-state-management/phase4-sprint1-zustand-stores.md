# Phase 4 Sprint 1: Zustand Stores

Status: planned

## Goal

Introduce Zustand stores for React-owned page, panel, and main-chat state so later phases can stop reading scattered browser globals directly.

## Scope

- Define store boundaries for settings, character library panel, workspace panels, and main-chat observable state.
- Keep legacy globals as the current compatibility source where they are still public contracts.
- Add tests for store defaults, updates, subscription behavior, and reset behavior.

## Non-Goals

- Do not remove `globalThis.SillyTavern`, `eventSource`, `event_types`, or jQuery globals.
- Do not change provider transport, renderer, slash-command execution, or extension APIs.
- Do not migrate file-backed user data.

## Acceptance

- Store modules are importable from React code without importing legacy DOM modules.
- Existing React islands can read store state through a narrow adapter.
- Legacy owner/fallback paths remain unchanged.
- The roadmap's Phase 7 cutover checklist can reference the new store boundaries.

## Validation

```powershell
bun run test:compat
bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js --runInBand
bun run docs:check
```
