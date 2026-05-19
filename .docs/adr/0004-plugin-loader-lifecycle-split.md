# 0004 — Extract Plugin Updater and Pure Discovery From Plugin Loader

## Context

`src/plugin-loader.js` contained ~293 lines combining four concerns: filesystem discovery of plugin candidates (scanning directories, checking `package.json`, finding index files), git auto-update of repo-backed plugins, module import and shape validation, and Express router initialization with cleanup hook collection.

Two friction points:

1. `updatePlugins` was an inline function performing git operations (`git pull`, `git checkout`) interleaved with the loading logic. Testing the loading pipeline required either mocking git or skipping auto-update entirely — there was no way to test one concern without the other.
2. Plugin candidate discovery (`loadFromDirectory`, `loadFromPackage`) was coupled to `import()` — there was no way to enumerate what *would* be loaded without actually loading it. This made dry-run inspection, plugin listing UIs, and pre-validation impossible.

Additionally, `enableServerPlugins` was read eagerly at module top level via `getConfigValue`, sharing the same `process.exit(1)` problem as `ENABLE_ACCOUNTS` in `users.js`.

## Decision

Split into two modules with a clean dependency edge:

- **`plugin-updater.js`** — `updatePlugins(pluginsPath, options?)`. Standalone git auto-update for repo-backed plugins. Accepts optional `options.autoUpdate` for testability (defaults to config read). Failures are per-plugin, never propagated.
- **`plugin-loader.js`** — `loadPlugins(app, pluginsPath)`, `discoverPluginCandidates(pluginsPath)`, `clearLoadedPlugins()`. Orchestrator that calls `updatePlugins` after discovery, then imports and initializes candidates.

Key design choices:

- `discoverPluginCandidates(pluginsPath)` is a **pure filesystem function** returning `PluginCandidate[]` with `{ type: 'file'|'directory', path }`. It does NOT import any plugin module — it only reads directory entries and `package.json` files.
- `enableServerPlugins` is now lazy via `getEnableServerPlugins()` with first-call cache (same pattern as `getEnableAccounts()` in `user-storage.js`).
- `updatePlugins` accepts an `options` parameter so tests can bypass config reads: `updatePlugins(dir, { autoUpdate: false })`.

## Why

The four phases in the loading pipeline (discovery → auto-update → import+validation → init+cleanup) map to two responsibility clusters that warranted separate modules:

- **Updater** (~70 lines): pure git operations on directory entries. No Express dependency, no module imports. Self-contained error handling per directory.
- **Loader** (~200 lines): filesystem scanning, module shape validation, Express router creation, cleanup hook collection. The orchestration concern.

The discovery-vs-import split within `plugin-loader.js` is more granular (function-level, not module-level) because discovery and loading share the same `fs` and `path` dependencies and are always called together in the normal flow. Separating them into functions rather than modules avoids artificial dependency edges.

The lazy config pattern was chosen for the same reason as in the user module split: `getConfigValue` calls `process.exit(1)` when `CONFIG_PATH` is unset, making eager reads at module top level incompatible with test harnesses that set config after import.

## Consequences

- `updatePlugins` is independently testable with `{ autoUpdate: false }` — no git mocking needed.
- `discoverPluginCandidates` is a pure function: given a path, returns metadata. Testable with a temp directory and no mocks.
- The dependency graph is acyclic: `plugin-updater.js` has no imports from `plugin-loader.js`; `plugin-loader.js` imports from `plugin-updater.js`.
- `clearLoadedPlugins()` is exported for test teardown — the `loadedPlugins` Map remains module-private.
- 8 new tests cover the extracted modules (3 updater + 5 loader).
- The `loadPlugins(app, pluginsPath)` call signature in `server-main.js` is unchanged.
