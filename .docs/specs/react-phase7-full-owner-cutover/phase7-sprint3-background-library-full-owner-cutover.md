# Phase 7 Sprint 3: Background Library Full Owner Cutover

Status: planned

## Goal

Make React the full owner for Background Library panel behavior.

## Scope

- Move background file actions, thumbnail/lazy-load lifecycle, folder state, selection and lock side effects, and background slash-command handoff into the React owner path.
- Retire or freeze the legacy background controller fallback.
- Preserve current `/api/backgrounds/*` contracts.

## Non-Goals

- Do not change canonical background file storage.
- Do not alter slash-command semantics without compatibility proof.

## Acceptance

- Background Library has one runtime owner.
- Legacy background fallback is deleted or ADR-frozen.
- Upload/select/lock/unlock/auto/refresh, thumbnails, folder state, and slash handoff are covered.

## Validation

```bash
bun run build:react:workspace-panels
bun run --cwd tests test:unit -- background-panel-controller.test.js thumbnail-placeholder-background.test.js --runInBand
bun run test:compat
bun run docs:check
```
