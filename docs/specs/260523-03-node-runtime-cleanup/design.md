# Node Runtime Cleanup

## Goal

Remove obsolete Node 20 compatibility code and stale runtime assumptions after the application is already proven on the target LTS. This is the cleanup step that turns the runtime switch into a maintainable production state.

## Production-Ready Result

This task is shippable when the codebase no longer carries compatibility branches for unsupported Node versions, startup behavior remains unchanged on the supported LTS, and tests cover the affected startup and configuration paths.

## Source Evidence

- `server.js` owns CLI parsing, global data root setup, and dynamic import of `src/server-main.js`.
- `src/server-main.js` contains startup orchestration and historically carried Node-version compatibility logic.
- `src/command-line.js` owns config path, global mode, data root, listen/SSL/proxy/CSRF arguments, and is sensitive to import-time side effects.
- `webpack.config.js` depends on `globalThis.DATA_ROOT` unless forced to dist mode.
- `@types/node` is aligned during the runtime switch; cleanup should preserve that alignment while removing obsolete compatibility assumptions.

## Scope

In scope:

- Delete runtime compatibility branches that only exist for unsupported Node versions.
- Align development type metadata and comments with the chosen runtime.
- Remove any remaining stale docs, comments, or setup instructions that imply Node 20 is the default.
- Add or adjust narrow startup tests when cleanup touches config, data root, or import ordering.

Out of scope:

- Changing the selected LTS target again.
- Express 5 migration.
- Frontend module migration.
- Replacing Webpack.

## Implementation Plan

1. Search runtime-version checks and comments for Node 20-specific logic.
2. Remove compatibility branches only when the branch is unreachable under the supported runtime range.
3. Confirm `@types/node` and related dev metadata remain aligned with the selected runtime target.
4. Keep `server.js -> src/server-main.js` import order intact unless a test proves the cleanup requires change.
5. Run focused startup/config unit tests.
6. Run the full unit suite.
7. Start the server and run the E2E suite.
8. Update root `AGENTS.md` or setup docs only if the supported runtime text changed.

## Acceptance Criteria

- No unsupported Node 20-specific compatibility branch remains in production startup code.
- Runtime docs and package metadata agree.
- Startup, config resolution, and Webpack config behavior are still reproducible.
- Unit and E2E tests pass on the supported LTS.

## Rollback

Revert the cleanup commit. If the prior runtime-switch commit is still healthy, rollback should restore compatibility branches without changing the selected production runtime.

## Risks And Boundaries

- Some compatibility code may protect non-obvious Bun, Deno, or Electron startup paths. Do not delete those paths unless they are truly Node-version-specific.
- `globalThis.DATA_ROOT` ordering is a stability boundary; cleanup must not make `webpack.config.js` import before data root initialization during server startup.
- Tests should prove behavior through public startup/config surfaces, not through brittle implementation snapshots.
