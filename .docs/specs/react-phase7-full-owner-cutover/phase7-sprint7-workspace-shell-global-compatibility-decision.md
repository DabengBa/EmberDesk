# Phase 7 Sprint 7: Workspace Shell And Global Compatibility Decision

Status: planned

## Goal

Decide the final runtime shape of the workspace shell and global compatibility exports.

## Scope

- Decide whether EmberDesk moves to a full SPA workspace shell or freezes the legacy jQuery shell as a compatibility facade.
- Decide the final status of `globalThis.SillyTavern`, `eventSource`, `event_types`, and `@sillytavern/*`.
- Document deletion, freeze, or long-term support in ADR.

## Non-Goals

- Do not force-delete compatibility surfaces when Phase 6 evidence is incomplete.
- Do not mix storage or backend canonical data changes into shell cutover.

## Acceptance

- Workspace shell owner split is final and documented.
- Each global compatibility export is deleted, frozen, or long-term supported.
- Rollback and user-facing compatibility risks are documented.

## Validation

```bash
bun run build:lib
bun run build:react
bun run build:react:workspace-panels
bun run test:unit
bun run test:compat
bun run perf:startup
bun run perf:interaction
bun run docs:check
```
