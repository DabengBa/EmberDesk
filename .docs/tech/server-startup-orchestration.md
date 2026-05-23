# Server Startup Orchestration

## Module Responsibility

This document covers the server-side boot pipeline in `src/server-main.js` that brings EmberDesk from process start to accepting HTTP connections. It describes the phase structure, cleanup contract, and key module interactions.

For browser-side startup and `APP_READY`, see [startup-app-ready-optimization.md](startup-app-ready-optimization.md).

Primary files:

- `src/server-main.js` — coordinator: phase sequencing, cleanup wiring, signal handlers
- `src/server-startup.js` — transport: IP detection, HTTP/HTTPS creation, listen failure handling
- `src/server-startup-profiler.js` — instrumentation: stage timing, event marks, JSON profile output
- `src/command-line.js` — config resolution pipeline (see [config-resolution.md](config-resolution.md))
- `src/users.js` — barrel re-export plus middleware, routes, backup (see [user-module-split.md](user-module-split.md))
- `src/plugin-loader.js` — plugin discovery, validation, init, cleanup (see [plugin-loader-lifecycle.md](plugin-loader-lifecycle.md))

## Architecture And Constraints

`server-main.js` is the single entry point for all server boot work. It coordinates six phases without owning the implementation details of any one phase:

1. **Data Initialization** — `initDataPhase()`: user storage init, DNS resolution, directory creation, migrations, security verification. No Express dependency.
2. **Middleware Registration** — `registerMiddleware(app, cli)`: Express middleware stack (helmet, CORS, CSRF, sessions, auth, static files, public routes). Async due to whitelist middleware.
3. **Route Registration** — `redirectDeprecatedEndpoints(app)` + `setupPrivateEndpoints(app)`: deprecated URL redirects and all domain routers.
4. **Pre-listen Phase** — split into two sub-phases:
   - `collectCleanupResources()`: migrations, content checks, plugin loading. Returns cleanup handles.
   - Signal handler registration (SIGINT, SIGTERM, uncaughtException) via `createCleanupHandler()`.
   - `initRemainingServices()`: private request filter, request proxy, webpack compile.
5. **Listen** — `errorHandlerMiddleware` + `apply404Middleware()` + `ServerStartup.start()`: global error handler, final 404 handler, then IPv4/IPv6 server creation.
6. **Post-listen** — `postSetupTasks(result)`: browser launch, heartbeat, window title, listen log, profiler flush.

The split between 4a and 4b exists so that signal handlers are registered as soon as cleanup resources are available, before the remaining initialization tasks run. This preserves the original behavior where a SIGINT during request-filter initialization or webpack compile would still trigger plugin cleanup and cache disposal.

Constraints:

- `ServerStartup` is not modified. It owns IP auto-detection, HTTP/HTTPS server creation, and listen failure handling independently.
- Middleware order is preserved: helmet -> compression -> responseTime -> bodyParser -> CORS -> auth -> whitelist -> host whitelist -> access log -> sessions -> user data -> CSRF -> public/static routes -> auth wall -> CORS proxy -> upload parsing -> deprecated redirects -> domain routes -> error handler -> 404.
- Cleanup order is preserved: statsOnExit -> cleanupPlugins -> diskCache.dispose -> disposeCharacterIndexDatabases -> setWindowTitle -> process.exit.
- Express 5 compatibility routes are treated as production contracts, not migration experiments:
  - OAuth callbacks use `/callback{/:source}` and preserve sourced provider callback parameters inside the nested `query` wrapper consumed by the browser OpenRouter flow.
  - The optional CORS proxy uses `/proxy/*url` so the full target URL remains available to the proxy middleware.
  - User-file wildcard routes and static asset serving are covered by tests for nested files, encoded paths, extension fallback, traversal rejection, and browser-critical MIME types.
  - Deprecated endpoint redirects remain method-preserving `308` responses.

## Core Implementation

### Phase structure in main()

```
main()
  initDataPhase()
  registerMiddleware(app, cliArgs)
  redirectDeprecatedEndpoints(app)
  setupPrivateEndpoints(app)
  collectCleanupResources() → resources
  createCleanupHandler(resources) → exitProcess
  process.on(SIGINT/SIGTERM/uncaughtException)
  initRemainingServices()
  app.use(errorHandlerMiddleware)
  apply404Middleware()
  ServerStartup.start() → result
  postSetupTasks(result)
```

All phase functions are `async` except `registerMiddleware` (which is `async` only because `getWhitelistMiddleware()` returns a promise). Module-level variables `app`, `startupProfiler`, `cliArgs`, and `webpackMiddleware` are shared across phases via closure.

### Cleanup contract

`createCleanupHandler(resources)` is a pure factory that returns a one-shot async function. The `isExiting` guard prevents double execution. `resources` is populated by `collectCleanupResources()` and contains:

- `cleanupPlugins` — function returned by `loadPlugins()`, may be null
- `diskCache` — module-level `DiskCache` instance
- `statsOnExit` — stats endpoint cleanup function
- `consoleTitle` — captured `process.title` before plugins change it

Signal handlers are registered in `main()` between `collectCleanupResources()` and `initRemainingServices()`, matching the original inline closure placement.

### Error handling

`main()` is called from top-level with `.catch()` that marks a profiler error event, flushes the profile, and rethrows. This preserves the original error-reporting behavior.

After private routes and remaining services are registered, `errorHandlerMiddleware` is mounted before `apply404Middleware()`. This keeps async route failures from falling through to the final 404 handler or Express default HTML responses while still allowing unmatched paths to return the configured `url-not-found.html` body.

## Related Semantic IDs And Code Binding Points

The server startup pipeline has no user-facing semantic ID. The related browser-side semantic doc is:

- `feature.startup_bootstrap` — covers the visible loading experience, not server internals

Stability-sensitive binding points:

- `startupProfiler.mark('bootstrap:start')`
- `startupProfiler.mark('preSetupTasks:start')` / `'preSetupTasks:end'`
- `startupProfiler.mark('server:listening', { url })`
- `startupProfiler.mark('bootstrap:error', { message })`
- `startupProfiler.flush()` at listen success and on error
