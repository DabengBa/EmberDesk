# Phase 7 Sprint 2: World Info Full Owner Cutover

Status: planned

## Goal

Make React the full owner for World Info panel behavior after Phase 4/6 compatibility evidence is complete.

## Scope

- Move prompt activation, regex placement UI handoff, converter/import result handling, delete cascade, and entry lifecycle into the React owner path.
- Retire or freeze legacy DOM action bridge fallback.
- Preserve world-book semantics and existing API behavior.

## Non-Goals

- Do not change World Info file format or prompt injection semantics without separate proof.
- Do not remove extension-facing regex compatibility without Phase 6 evidence.

## Acceptance

- World Info has one runtime owner for panel behavior.
- Legacy bridge is deleted or ADR-frozen.
- Import/export, converter results, delete cascade, regex placement, and prompt activation are covered.

## Validation

```powershell
bun run build:react:workspace-panels
bun run --cwd tests test:unit -- world-info-card-rendering.test.js world-info-import-feedback.test.js world-info-converters.test.js worldinfo-delete-cascade.test.js --runInBand
bun run test:compat
bun run docs:check
```
