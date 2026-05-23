# 0002 — Split Config Resolution Into Three Pure Phases

## Context

`CommandLineParser.parse()` in `src/command-line.js` performed argv parsing, filesystem setup, config file initialization, value resolution, type coercion, and URL helper construction in a single 270-line method. `getConfigValue()` (from `src/util.js`) implicitly depended on `initConfig()` having already run (via a module-level `CONFIG_PATH` singleton), but this dependency was hidden behind sequential code. Tests had to mock filesystem and config-file state to verify any part of the pipeline.

## Decision

Split `parse()` into three exported functions with explicit boundaries:

1. **`parseArgv(args)`** — pure function, zero side effects. Reads argv, detects global mode, derives `configPath`. Returns a flat `ParsedArgv` object with nullable raw values.
2. **`prepareConfigFilesystem(configPath, isGlobal)` + `prepareDataRoot(dataRoot)`** — the only side-effect seam. Creates directories, calls `initConfig`.
3. **`resolveConfig(argv, defaultConfig)`** — pure merge. Calls `getConfigValue` (safe because Phase 2 ran first), applies `stringToBool`, validates protocols, attaches URL helpers.

`CommandLineParser.parse()` becomes a 5-line orchestrator calling 1→2→3. The external API (return type, `server.js` caller) is unchanged.

## Why

The original `parse()` mixed three concerns that have different testing needs:

- **argv parsing** should be testable without touching the filesystem. Currently, no tests exist for `command-line.js` because any test would need to mock `fs`, `getConfigValue`, and `initConfig`.
- **filesystem preparation** is inherently side-effectful and should be isolated so the other two phases can be pure.
- **config resolution** depends on the config file being initialized but should not itself perform initialization.

The `CACHED_CONFIG` singleton in `util.js` means that config-file reads are cached across the process lifetime. Splitting into phases makes the initialization order explicit: Phase 2 must complete before Phase 3 calls `getConfigValue`.

## Consequences

- `parseArgv` can be tested with zero mocks (9 tests, no fs).
- `resolveConfig` can be tested by providing all values via argv, avoiding `getConfigValue` calls (12 tests, no config file).
- The orchestrator integration tests verify the full pipeline end-to-end (6 tests).
- `config-init.js` and `server.js` are unchanged.
- The `dataRoot` resolution has a two-step pattern: `parseArgv` returns `null` when not provided on CLI, the orchestrator resolves it from config after `initConfig`, then passes it to `resolveConfig`.
