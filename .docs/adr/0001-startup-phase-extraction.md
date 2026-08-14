# 0001 — Extract Server Startup Phases Into Named Functions

## Context

`src/server-main.js` used a long `.then()` chain for the server bootstrap sequence and defined the graceful-shutdown handler as an inline closure inside `preSetupTasks()`. This made each boot phase untestable in isolation and coupled cleanup registration to the pre-listen task function.

## Decision

Replace the `.then()` chain with `async main()` and extract boot phases into named functions: `initDataPhase`, `registerMiddleware`, `collectCleanupResources`, `initRemainingServices`, and `createCleanupHandler`. The cleanup handler is now a pure factory function that accepts an injectable resources object.

## Why

Each boot phase shared module-level state through closure, so there was no seam to test one phase without running everything before it. The inline `exitProcess` closure captured `cleanupPlugins` from `loadPlugins` and could not be tested without process-level mocking. Extracting named functions with explicit parameters makes the startup sequence self-documenting and prepares it for isolated testing.

The `collectCleanupResources` / `initRemainingServices` split ensures signal handlers are registered at the same point in the boot sequence as the original inline closure (after plugin loading, before request-filter initialization), preserving shutdown coverage during the remaining pre-listen tasks.

## Consequences

- Each phase function can be imported and called independently in future tests.
- `createCleanupHandler` is testable by passing a mock resources object.
- The phase boundary between 4a and 4b is an implementation detail tied to when cleanup resources become available, not a logical domain boundary. Future phases may need re-splitting if plugin loading moves later in the sequence.
