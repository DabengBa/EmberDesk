# ADR-0010: Express Runtime Owner Boundary

- Status: Accepted
- Date: 2026-06-23
- Deciders: EmberDesk maintainers
- Supersedes: none
- Superseded by: none

## Context

Phase 5 Sprint 3 asked whether EmberDesk should continue retaining Express as the backend runtime owner, or whether a later sunset plan is already admissible.

Current server ownership is broader than route handlers alone. Express currently anchors:

- middleware registration order in `src/server-main.js`
- public/static hosting
- login wall placement before private routes
- deprecated method-preserving redirects
- plugin router mounting under `/api/plugins/{id}`
- CORS proxy routing
- upload parsing
- global error handling
- final 404 behavior

Outside the Express app object itself, the runtime boundary also depends on:

- `server.js` as the only normal process entry point
- `src/server-main.js` as boot orchestrator
- `src/server-startup.js` as transport/listen owner

Phase 5 Sprint 1 provides only one Hono route-island proof for `POST /api/moving-ui/save`. That proof is useful, but it does not cover the broader host chain above.

## Decision

Retain Express 5 as EmberDesk's backend runtime owner.

Future runtime-sunset discussion is allowed only as a separate scoped effort with explicit prerequisites. This ADR does not authorize runtime replacement.

## Why Express Is Retained

The current evidence supports retention because Express still owns production-critical boundaries that are not yet matched by broader parity proof:

1. Middleware order is a tested contract, not a refactor detail.
2. Deprecated redirects, plugin routes, uploads, proxying, error handling, and final 404 behavior all depend on the current host structure.
3. Startup orchestration and transport/listen responsibilities are already split cleanly between `src/server-main.js` and `src/server-startup.js`; there is no active need to replace that split just to gain route-local typing.
4. The new Hono route-island proof demonstrates a narrow embedding pattern, not whole-runtime equivalence.
5. The rollback surface for a full runtime switch would be materially larger than the benefit currently proven.

## Prerequisites For Any Future Sunset Discussion

Any future proposal to sunset Express must first prove all of the following:

- route-family parity beyond one route island
- middleware-order equivalence for auth, sessions, CSRF, proxy, uploads, error handling, and final 404
- preserved deprecated redirect behavior, including method-preserving `308` semantics
- plugin mounting parity for `/api/plugins/{id}`
- startup-orchestrator and transport/listen parity
- a realistic rollback plan that does not widen user-data risk

Without those proofs, "sunset Express" remains out of scope.

## Consequences

Positive:

- EmberDesk keeps a well-tested and documented runtime owner.
- Phase 5 can still use narrow route-island experiments without destabilizing startup and plugin boundaries.

Negative:

- The backend remains a mixed modernization path instead of a clean-slate server rewrite.
- Any broader typed API program must work within an Express-hosted model unless future evidence changes the decision.

Neutral clarifications:

- This ADR does not block additional narrow Hono route islands.
- This ADR does not imply Drizzle adoption.
- This ADR does not change frontend cutover ownership, which still belongs to later roadmap phases.

## Evidence

- `tests/express5-route-compatibility.test.js`
- `tests/plugin-loader.test.js`
- `tests/server-startup-profiler.test.js`
- `tests/startup-critical-path.test.js`
- `tests/startup-deferred-tasks.test.js`
- `tests/startup-loader.test.js`
- `src/server-main.js`
- `src/server-startup.js`
- `src/plugin-loader.js`

Validation commands:

```powershell
bun run --cwd tests test:unit -- express5-route-compatibility.test.js plugin-loader.test.js server-startup-profiler.test.js startup-critical-path.test.js startup-deferred-tasks.test.js startup-loader.test.js --runInBand
bun run test:compat
```

## References

- Express middleware guide: https://expressjs.com/en/guide/using-middleware.html
- Express 5 migration guide: https://expressjs.com/en/guide/migrating-5.html
