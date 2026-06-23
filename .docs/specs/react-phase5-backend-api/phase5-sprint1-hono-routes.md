# Phase 5 Sprint 1: Hono Route Shell

Status: planned

## Goal

Introduce a Hono route shell only where route parity, middleware order, auth, CSRF, sessions, uploads, and error handling can be proven.

## Scope

- Identify candidate private endpoints for a typed route shell.
- Preserve Express middleware order and public/static route behavior.
- Add route parity tests before switching any owner.

## Non-Goals

- Do not replace Express globally in this sprint.
- Do not alter authentication, whitelist, host checks, CSRF, upload, or proxy behavior as a convenience.

## Acceptance

- Hono routes are gated by an ADR-approved migration boundary.
- Existing Express behavior remains available as rollback.
- Focused route compatibility tests cover the touched route set.

## Validation

```powershell
bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand
bun run test:unit
bun run docs:check
```
