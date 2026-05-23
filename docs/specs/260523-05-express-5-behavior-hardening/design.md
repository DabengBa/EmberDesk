# Express 5 Behavior Hardening

## Goal

Stabilize the Express 5 migration after compatibility is achieved. This step removes temporary migration workarounds, tightens tests around middleware order and edge routes, and records the new service boundary as production behavior.

## Production-Ready Result

This task is shippable when Express 5 is no longer treated as a compatibility experiment: middleware order is documented, migration-only shims are removed, and tests prove the important behavior paths that could regress.

## Source Evidence

- `src/server-main.js` owns middleware ordering and route registration before `ServerStartup.start()`.
- `src/server-startup.js` owns deprecated redirects, private route setup, 404 placement, and HTTP/HTTPS listen behavior.
- `src/middleware/basicAuth.js`, `src/middleware/whitelist.js`, CSRF setup, cookie sessions, and host validation together define the security gate.
- `src/plugin-loader.js` depends on Express router semantics for plugin initialization.
- `tests/` already includes unit coverage for startup, auth, plugin loader, and selected UI flows.

## Scope

In scope:

- Remove compatibility code that was only needed during Express 4-to-5 migration.
- Add targeted tests for security middleware order, login wall behavior, deprecated endpoint redirects, plugin route mounting, upload parsing, and 404 placement.
- Document middleware order and known Express 5 behavior in `.docs/tech/` if current docs are stale.
- Confirm production server startup logs and error messages remain actionable.

Out of scope:

- New API design.
- Splitting route modules for style.
- Changing response payload schemas.
- Frontend modernization.

## Implementation Plan

1. Review all changes made in the Express compatibility step and classify them as permanent, temporary, or suspicious.
2. Delete temporary shims that are not needed under Express 5.
3. Add focused unit tests around high-risk route/middleware surfaces.
4. Add one browser smoke path that catches static asset MIME or auth-wall regressions.
5. Update `.docs/tech/server-startup-orchestration.md` if middleware ordering or startup boundaries changed.
6. Run full unit and E2E suites.

## Acceptance Criteria

- No migration-only compatibility shim remains without a documented reason.
- Middleware order is documented and verified by focused tests where practical.
- Deprecated redirects, plugin routes, uploads, static assets, login/setup, and private API gates are verified.
- Full test suites pass.

## Rollback

Revert this hardening commit. The Express 5 compatibility migration may remain deployed if it was already production-ready.

## Risks And Boundaries

- Over-testing implementation order can make future cleanup harder. Tests should assert externally observable behavior unless order itself is the contract.
- Removing a shim too early can break a rarely used route. Prefer proving deletion with a focused test or source-backed reasoning.
- Documentation should record current behavior, not future route architecture.

