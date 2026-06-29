# Config Resolution

## Module Responsibility

This document covers the three-phase config resolution pipeline in `src/command-line.js` that produces the `CommandLineArguments` object consumed by the rest of the server boot sequence. It describes the phase structure, the global-mode data-root isolation rule, and the key module interactions.

For the server boot pipeline that consumes the resolved config, see [server-startup-orchestration.md](server-startup-orchestration.md).

Primary files:

- `src/command-line.js` — three-phase pipeline: `parseArgv`, `prepareConfigFilesystem` / `prepareDataRoot`, `resolveConfig`
- `src/config-init.js` — config-file migration, deprecated-key rewriting, default-fill logic
- `src/util.js` — `getConfigValue`, `stringToBool`, `setConfigFilePath`, `keyToEnv`
- `default/config.yaml` — canonical default values

`src/util.js` no longer carries EmberDesk's archive/zip helper implementations. Those now live in `src/archive-utils.js` and are re-exported for compatibility, so this document intentionally treats `util.js` only as the remaining config-related helper surface.

## Architecture And Constraints

`CommandLineParser.parse()` is the sole entry point, called once from `server.js`. It orchestrates three phases with an explicit dependency order:

```
parseArgv(args)                       → ParsedArgv     (pure, no side effects)
    ↓
prepareConfigFilesystem(configPath)   → void           (side-effect: mkdir, initConfig)
prepareDataRoot(dataRoot)             → void           (side-effect: mkdir)
    ↓
resolveConfig(argv, defaults)         → CommandLineArguments  (pure merge)
```

Phase boundaries:

1. **`parseArgv`** — reads argv via yargs, detects global mode (`globalThis.FORCE_GLOBAL_MODE` or `--global`), derives `configPath`. Returns nullable raw values. Does NOT call `getConfigValue`, `initConfig`, or touch the filesystem. Deprecated CLI aliases (`--autorun` → `browserLaunchEnabled`, etc.) are mapped here.

2. **`prepareConfigFilesystem` + `prepareDataRoot`** — the only side-effect seam. Creates config parent directory in global mode, calls `initConfig` (which triggers `addMissingConfigValues` from `config-init.js`), creates data root directory. After this phase, `getConfigValue()` is safe to call because `setConfigFilePath` has been invoked.

3. **`resolveConfig`** — merges CLI overrides with config-file values via `getConfigValue`. Applies `stringToBool` to protocol fields, validates against `[true, false, 'auto']`, attaches URL helper methods (`getIPv4ListenUrl`, `getIPv6ListenUrl`, `getBrowserLaunchHostname`, `getBrowserLaunchUrl`).

Constraints:

- `server.js` is the sole caller of `CommandLineParser.parse()`. The return type shape is the external API contract.
- `config-init.js` is unchanged. Its `initConfig` → `setConfigFilePath` → `addMissingConfigValues` chain remains the config-file initialization path.
- `setConfigFilePath` in `util.js` is a module-level singleton (`CONFIG_PATH`). It logs an error if called more than once but still updates the path.
- `CACHED_CONFIG` in `util.js` is populated on first `getConfig()` call and persists for the process lifetime. `addMissingConfigValues` writes the file but does not clear this cache.

### Global-mode data root isolation

In global mode (`--global` or `globalThis.FORCE_GLOBAL_MODE`), `dataRoot` is forced to `defaultConfig.dataRoot` (the OS app-data path from `envPaths('EmberDesk')`). CLI `--dataRoot` and config-file `dataRoot` are both ignored. This ensures global/electron/bin launches always write user data to the intended OS directory, not the process cwd.

```js
const resolvedDataRoot = argv.isGlobal
    ? defaultConfig.dataRoot
    : (argv.dataRoot ?? getConfigValue('dataRoot', defaultConfig.dataRoot));
```

### dataRoot resolution in standalone mode

In standalone mode, `dataRoot` follows the standard precedence: CLI arg > config file > default (`./data`). The orchestrator resolves it after `initConfig` runs, because `getConfigValue` needs the config file to be initialized first.

## Core Implementation

### parseArgv

- yargs definition with all CLI options (including deprecated aliases)
- `isGlobal` = `globalThis.FORCE_GLOBAL_MODE ?? cliArguments.global ?? false`
- `configPath` = global mode uses `envPaths('EmberDesk').data/config.yaml`, standalone uses `--configPath ?? './config.yaml'`
- Returns `ParsedArgv` with all fields nullable except `isGlobal` (boolean) and `configPath` (string)

### resolveConfig

- For each field: `argv.xxx ?? getConfigValue('config.key', defaultConfig.xxx, 'type')`
- `enableIPv4`/`enableIPv6` use `stringToBool(argv) ?? stringToBool(getConfigValue(...)) ?? default`
- Protocol validation: invalid values fall back to defaults with a console warning
- URL helpers are closures over the resolved result object (`this.ssl`, `this.port`, etc.)

### getDefaultConfig

- Returns a frozen object with all default values
- `isGlobal=true` → paths use `envPaths('EmberDesk')`
- `isGlobal=false` → `configPath: './config.yaml'`, `dataRoot: './data'`
- URL helpers are throw-stubs in defaults; real implementations are attached by `resolveConfig`

## Related Semantic IDs And Code Binding Points

The config resolution pipeline has no user-facing semantic ID. The related semantic doc is:

- `page.api_configuration` — covers the browser-side API configuration UI, not server config resolution

Stability-sensitive binding points:

- `CommandLineParser.parse(process.argv)` in `server.js:8` — sole caller
- `globalThis.COMMAND_LINE_ARGS = cliArgs` in `server.js:10` — global export
- `globalThis.DATA_ROOT = cliArgs.dataRoot` in `server.js:9` — global export

## Related ADRs

- [ADR-0002](../adr/0002-config-resolution-three-phase-split.md) — why the three-phase split was chosen
