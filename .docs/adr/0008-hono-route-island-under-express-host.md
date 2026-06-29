# ADR-0008: Hono Route Island Under Express Host

- Status: Accepted
- Date: 2026-06-23
- Deciders: EmberDesk maintainers
- Supersedes: none
- Superseded by: none

## Context

Phase 5 Sprint 1 needs a typed route experiment without reopening EmberDesk's server host boundary.

Current hard constraints:

- `server.js` remains the only normal process entry point.
- `src/server-main.js` keeps ownership of middleware order, deprecated redirects, private-route fan-out, error handling, and final 404 behavior.
- `src/server-startup.js` keeps transport/listen ownership.
- `tests/express5-route-compatibility.test.js` already treats the Express 5 host chain as a production contract.
- The first candidate endpoint, `POST /api/moving-ui/save`, is narrow, already private-route only, and behavior-preserving for callers.

The project wanted to learn whether Hono can improve route-local structure and validation without implying a wider runtime migration.

## Decision

Adopt Hono only as a route-local island under the existing Express host for `POST /api/moving-ui/save`.

The accepted boundary is:

- Express remains the runtime owner.
- Express middleware continues to own body parsing, sessions, user resolution, CSRF, auth wall, route order, error handling, and final 404 behavior.
- Hono owns only the `/save` subroute behavior inside `src/endpoints/moving-ui.js`.
- The route island reads `request.body` and `request.user` through an explicit bridge; it does not recreate host middleware responsibilities.
- Validation stays intentionally narrow: `name` is required; the remaining payload passes through unchanged.
- Success and validation-failure responses stay observably equivalent to the legacy route contract for existing callers.

This ADR does not authorize:

- promoting Hono to the top-level server
- migrating more route families by default
- treating the route island proof as evidence that Express can be sunset

## Rollback

Rollback is code-level and narrow:

1. remove the Hono dependency and bridge
2. restore `src/endpoints/moving-ui.js` to a plain Express `router.post('/save', ...)`
3. keep the existing endpoint URL and payload contract unchanged

No product flag or user-data migration is required because the external route contract does not change.

## Consequences

Positive:

- EmberDesk now has one concrete typed route-island proof under the real Express host.
- Route-local request validation can tighten without duplicating the host chain.
- Future route-island experiments have a concrete rollback model and parity-test pattern.

Negative:

- The server now carries a second route framework dependency.
- Host/route dual-stack complexity exists, so adoption must stay narrow and evidence-based.

Neutral clarifications:

- This does not change user-visible product semantics.
- This does not change the canonical file-backed data model.
- This does not reduce the evidence required for any future runtime-owner discussion.

## Evidence

- `tests/moving-ui-hono-route-island.test.js`
- `tests/express5-route-compatibility.test.js`
- `src/endpoints/moving-ui.js`

Validation command:

```bash
bun run --cwd tests test:unit -- express5-route-compatibility.test.js moving-ui-hono-route-island.test.js --runInBand
```

## References

- Hono routing and `app.fetch()` model: https://hono.dev/docs/api/routing
- Hono Node.js getting started: https://hono.dev/docs/getting-started/nodejs
- Express middleware guide: https://expressjs.com/en/guide/using-middleware.html
