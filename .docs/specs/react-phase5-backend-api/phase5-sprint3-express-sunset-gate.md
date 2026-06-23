# Phase 5 Sprint 3: Express Sunset Gate

Status: planned

## Goal

Decide whether migrated API routes can leave Express ownership, or whether Express must remain as the runtime fallback.

## Scope

- Review route parity, middleware order, startup behavior, auth/session/CSRF behavior, upload behavior, and error/404 behavior.
- Produce an ADR update before disabling any Express owner path.
- Keep rollback instructions executable.

## Non-Goals

- Do not remove Express because Hono exists.
- Do not couple API sunset to React workspace full owner cutover.
- Do not change canonical storage.

## Acceptance

- Express sunset or fallback retention is explicitly decided by ADR.
- Route compatibility, startup, and rollback proof exist before any removal.
- Phase 7 can rely on typed API evidence where relevant without inheriting backend ambiguity.

## Validation

```powershell
bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand
bun run test:unit
bun run test:compat
bun run docs:check
```
