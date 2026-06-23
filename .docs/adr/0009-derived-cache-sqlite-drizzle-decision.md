# ADR-0009: Derived Cache SQLite Drizzle Decision

- Status: Accepted
- Date: 2026-06-23
- Deciders: EmberDesk maintainers
- Supersedes: none
- Superseded by: none

## Context

Phase 5 Sprint 2 asked whether EmberDesk should adopt Drizzle for backend data work. The approved decision gate narrowed that question to the only mature SQLite slice currently in production:

- infrastructure helper: `src/derived-cache-sqlite.js`
- sidecar owner: `src/endpoints/character-index.js`
- read-path consumer: `src/endpoints/character-read-service.js`
- concrete file: `<user root>/_cache/character-index.sqlite`

This slice is intentionally not canonical storage. Canonical user data remains:

- `data/<user>/characters/*.png`
- `data/<user>/chats/**`

The existing handwritten `node:sqlite` path already carries the contracts that matter most here:

- `force_on` / `force_off` runtime gating
- unsupported-runtime fallback
- path guards and per-user sidecar location
- shared PRAGMA baseline
- schema reset and corrupt-DB rebuild
- reset-threshold circuit breaking
- filesystem fallback and delete-and-rebuild recovery

The decision question is therefore narrower than "Would Drizzle be nice?" It is "Does Drizzle provide enough net value on this derived sidecar to justify another abstraction layer without weakening rebuild and fallback behavior?"

## Decision

Do not adopt Drizzle for the current derived SQLite cache slice.

The project retains the existing handwritten `node:sqlite` helper and character-index owner split.

## Rationale

Drizzle is rejected for this slice because the current evidence does not show net benefit over the existing design:

1. The current sidecar is small, derived, and rebuildable. It does not need an ORM to protect a complex domain model or canonical migration history.
2. The existing helper already isolates the reusable lifecycle concerns cleanly, while `character-index.js` keeps schema and freshness rules close to the business logic that actually uses them.
3. The important reliability features here are runtime fallback, corrupt-file rebuild, reset-threshold disablement, and filesystem-authoritative recovery. Those are already implemented and covered by focused tests.
4. Adopting Drizzle would add dependency weight, schema indirection, and another mental model without proving a corresponding gain in correctness, maintainability, or test clarity for this specific sidecar.
5. Treating Drizzle as a default Phase 5 target would create pressure to broaden SQLite ownership beyond a derived cache, which conflicts with the current file-backed source-of-truth boundary.

## What This Decision Does Not Forbid

This ADR does not ban Drizzle forever.

A future sprint may reopen the question only if all of the following are true:

- the evaluation surface stays narrow and explicit
- the target slice has complexity that the handwritten helper path no longer handles well
- Drizzle can preserve delete-and-rebuild behavior, unsupported/`force_off` fallback, and filesystem-authoritative recovery
- the proposal still keeps canonical user data file-backed unless a separate canonical-storage ADR is approved

## Consequences

Positive:

- The current derived-cache stack stays simple and well aligned with the rebuildable-sidecar contract.
- The existing tests and operator expectations remain valid without adding migration tooling debt.

Negative:

- EmberDesk does not gain Drizzle's schema DSL or migration tooling on this slice.
- Future maintainers must keep using the current `node:sqlite` helper style until a stronger case exists.

Neutral clarifications:

- SQLite remains a derived acceleration artifact only.
- `DiskCache` is outside this decision gate.
- This ADR is not a decision about Hono, TanStack, or broader backend typing strategy.

## Evidence

- `tests/derived-cache-sqlite.test.js`
- `tests/character-read-service.test.js`
- `tests/interaction-performance-index.test.js`
- `src/derived-cache-sqlite.js`
- `src/endpoints/character-index.js`
- `src/endpoints/character-read-service.js`

Validation command:

```powershell
bun run --cwd tests test:unit -- derived-cache-sqlite.test.js character-read-service.test.js interaction-performance-index.test.js --runInBand
```

## References

- Drizzle SQLite docs: https://orm.drizzle.team/docs/get-started/sqlite-new
- Drizzle migrations overview: https://orm.drizzle.team/docs/migrations
- Node.js `node:sqlite` docs: https://nodejs.org/api/sqlite.html
