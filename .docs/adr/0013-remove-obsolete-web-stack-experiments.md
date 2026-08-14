# ADR-0013: Remove Obsolete Web Stack Experiments

- Status: Accepted
- Date: 2026-08-07
- Deciders: EmberDesk maintainers
- Supersedes: ADR-0006, ADR-0008
- Superseded by: none

## Context

Vite is the established `/lib.js` build path. Keeping Webpack added a second compiler, middleware path, Docker precompile, dependency tree, and startup branch without a current requirement.

The only Hono route island was `POST /api/moving-ui/save`. It retained a second route framework and a request/response bridge inside an otherwise Express-owned server. The endpoint does not need framework-specific features beyond Express routing and Zod validation.

## Decision

Use Vite as the only `/lib.js` build and serving path. Remove Webpack configuration, middleware, Docker precompile, package dependency, command, and fallback.

Use Express directly for `POST /api/moving-ui/save`. Remove Hono, its route owner, and the bridge helpers. Express remains the sole backend route framework.

## Consequences

- `/lib.js` must be built by `pnpm run build:lib`; an absent artifact returns the normal 404 response.
- Docker builds the Vite library and React bundles before production dependency pruning.
- Existing moving-ui URL, payload validation, response bodies, login wall, and file-backed storage behavior remain unchanged.
- Future backend work starts with Express modules. A second route framework requires a separate accepted architecture decision and focused proof.

## Evidence

- `tests/moving-ui-express-route.test.js`
- `tests/express5-route-compatibility.test.js`
- `tests/frontend-shared-library-boundary.test.js`
- `tests/node-runtime-contract.test.js`
