# Phase 4 Sprint 2: Global Compatibility Bridge

Status: planned

## Goal

Create a tested compatibility bridge between React/Zustand state and legacy extension-facing globals.

## Scope

- Map which values remain public compatibility exports.
- Add bridge lifecycle tests for initialization, update propagation, teardown, and fail-closed behavior.
- Preserve protected extension surfaces documented in [third-party extension compatibility](../../tech/third-party-extension-compatibility.md).

## Non-Goals

- Do not remove or rename public compatibility exports.
- Do not make breaking extension API changes.
- Do not move extension execution into React.

## Acceptance

- Compatibility exports continue to work with `bun run test:compat`.
- Each bridge export has an owner, fallback behavior, and Phase 7 deletion/freeze decision path.
- Any unsupported export is documented as retained legacy owner, not silently dropped.

## Validation

```powershell
bun run test:compat
bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js --runInBand
bun run docs:check
```
