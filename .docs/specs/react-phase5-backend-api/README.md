# React Phase 5: Backend API Modernization

Status: planned
Owner doc: [React modernization roadmap](../../tech/react-modernization-roadmap.md)

## Purpose

Phase 5 evaluates and introduces typed API infrastructure without changing the canonical file-backed user data model by default.

## Sprint Index

| Sprint | File | Delivery boundary |
|---|---|---|
| 1 | [Hono route shell](phase5-sprint1-hono-routes.md) | Prove route parity and middleware order before any route owner switch. |
| 2 | [Drizzle derived cache](phase5-sprint2-drizzle-derived-cache.md) | Use Drizzle only for derived SQLite cache paths unless a separate ADR changes storage ownership. |
| 3 | [Express sunset gate](phase5-sprint3-express-sunset-gate.md) | Decide whether Express routes can be retired or must remain as fallback. |

## Non-Goals

- No canonical storage migration.
- No middleware order changes without focused proof.
- No cleanup of React/legacy frontend fallbacks.

## Shared Validation Gate

```powershell
bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand
bun run test:unit
bun run test:compat
bun run docs:check
```
