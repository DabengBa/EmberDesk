# Phase 7 Sprint 1: Character Library Full Owner Cutover

Status: planned

## Goal

Make the React Character Library the single runtime owner for the panel while preserving required selector compatibility.

## Scope

- Move tag filtering, bulk side effects, delete confirmation integration, list lifecycle, and legacy `characters` sync replacement into the React owner path.
- Retire or freeze the legacy panel fallback by ADR.
- Preserve protected selectors or provide documented shims.

## Non-Goals

- Do not change character file storage.
- Do not break existing character row selectors or extension hooks without a compatibility decision.

## Acceptance

- Character Library has one runtime owner.
- Legacy fallback is deleted or ADR-frozen as a compatibility facade.
- Bulk delete/tag, search/sort/filter, virtual windowing, and protected selectors are covered by tests.

## Validation

```powershell
bun run build:react:character-library
bun run --cwd tests test:unit -- character-library-react-helpers.test.js character-library-react-panel-flag.test.js --runInBand
bun run test:compat
bun run docs:check
```
