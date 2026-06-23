# Phase 4 Sprint 3: Extension Migration Guide

Status: planned

## Goal

Prepare extension authors for the React/Zustand compatibility bridge without breaking current extensions.

## Scope

- Document supported compatibility exports and recommended future access paths.
- Identify high-risk extension surfaces: Tavern Helper, JS-Slash-Runner, Regex Manager, Quick Reply, Extensions Manager, and `@sillytavern/*` imports.
- Define the evidence Phase 6 must collect before Phase 7 can delete, freeze, or long-term support an export.

## Non-Goals

- Do not remove APIs during this sprint.
- Do not migrate third-party extension code.
- Do not replace the Extensions Host full owner cutover planned for Phase 7 Sprint 4.

## Acceptance

- Extension migration guidance points to stable compatibility surfaces.
- Deprecated candidates have a warning and rollback plan, not immediate deletion.
- Phase 6 validation checklist can be executed from the guide.

## Validation

```powershell
bun run test:compat
bun run docs:check
```
