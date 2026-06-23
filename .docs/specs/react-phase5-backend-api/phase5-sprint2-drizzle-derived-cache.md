# Phase 5 Sprint 2: Drizzle Derived Cache

Status: planned

## Goal

Evaluate Drizzle for derived SQLite cache paths while keeping file-backed user data as the source of truth.

## Scope

- Limit ORM ownership to derived caches such as character index data.
- Keep migrations reversible and separate from canonical user files.
- Document cache rebuild and rollback behavior.

## Non-Goals

- Do not make SQLite canonical storage.
- Do not migrate user files, chats, characters, settings, or secrets into ORM-owned tables.
- Do not remove existing cache rebuild paths without proof.

## Acceptance

- Drizzle usage is isolated to derived cache paths.
- Cache rebuild and fallback behavior remains available.
- Any canonical storage proposal is blocked until a separate ADR is accepted.

## Validation

```powershell
bun run test:unit
bun run docs:check
```
