# Plugin Loader Lifecycle

## Module Responsibility

This document covers the plugin loading pipeline that discovers, updates, validates, and initializes server plugins at startup, and collects cleanup hooks for shutdown.

Primary files:

- `src/plugin-loader.js` — orchestrator: discovery, validation, initialization, cleanup collection
- `src/plugin-updater.js` — git auto-update for repo-backed plugins

## Architecture And Constraints

The loading pipeline follows four phases:

1. **Discovery** — `discoverPluginCandidates(pluginsPath)`: pure filesystem scan. Returns `PluginCandidate[]` with `{ type, path }`. Does NOT import any plugin module.
2. **Auto-update** — `updatePlugins(pluginsPath)`: standalone git operations on directory entries that are git repos. Failures are per-plugin, never propagated. Called before the loading loop.
3. **Import + validation** — `loadFromFile` → `initPlugin`: imports via `url.pathToFileURL`, validates plugin shape (`info.id`, `info.name`, `info.description`, `init` function), checks ID validity and uniqueness.
4. **Initialization + cleanup** — `initPlugin` creates Express router, calls `init(router)`, mounts routes under `/api/plugins/{id}`, collects `exit` hooks. Cleanup function returns `Promise.all(exitHooks)`.

Constraints:

- `loadPlugins(app, pluginsPath)` is the sole export consumed by `server-main.js`. The call signature is unchanged.
- Per [ADR-0010](../adr/0010-express-runtime-owner-boundary.md), plugin mounting under `/api/plugins/{id}` is part of the retained Express runtime-owner boundary. Any future server-runtime sunset proposal must prove equivalent mount and cleanup semantics first.
- `enableServerPlugins` uses lazy evaluation (same pattern as `getEnableAccounts` in `user-storage.js`).
- Plugin shape contract: `info` object with required string fields `id`, `name`, `description`; `init` function; optional `exit` function.
- Plugin ID must match `/^[a-z0-9_-]+$/` and be unique across all loaded plugins.

## Related Semantic IDs And Code Binding Points

The plugin loader has no user-facing semantic ID.

Stability-sensitive binding points:

- `loadPlugins(app, pluginsDirectory)` in `server-main.js:335`
- `cleanupPlugins()` in `server-main.js:518`
- `startupProfiler.measure('loadPlugins', ...)` in `server-main.js:335`
