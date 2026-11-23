---
description: "This document covers the three-phase config resolution pipeline in src/command-line.ts that produces the CommandLineArguments object consumed by the rest of the server boot sequence. It describes the phase structure, the global-mode..."
kind: technical
topic: config-resolution
---

# Config Resolution

## Module Responsibility

This document covers the three-phase config resolution pipeline in `src/command-line.ts` that produces the `CommandLineArguments` object consumed by the rest of the server boot sequence. It describes the phase structure, the global-mode data-root isolation rule, and the key module interactions.

For the server boot pipeline that consumes the resolved config, see [server-startup-orchestration.md](server-startup-orchestration.md).

Primary files:

- `src/command-line.ts` — three-phase pipeline: `parseArgv`, `prepareConfigFilesystem` / `prepareDataRoot`, `resolveConfig`
- `src/config-init.ts` — one-time YAML migration, deprecated keys, and in-memory defaults
- `src/util.ts` — `getConfigValue`, `stringToBool`, `setConfigFilePath`, `keyToEnv`
- `src/config-file.ts` and `src/config-schema.ts` — JSONC parsing and Zod validation
- `default/config.jsonc` — commented canonical default values

`src/util.ts` no longer carries EmberDesk's archive/zip helper implementations. Those live in `src/archive-utils.ts`, which `src/util.ts` imports directly. This document treats `src/util.ts` only as the remaining config-related helper surface.

## Architecture And Constraints

`CommandLineParser.parse()` is the sole entry point, called once from `server.js`. It orchestrates three phases with an explicit dependency order:

```
parseArgv(args)                       → ParsedArgv     (pure, no side effects)
    ↓
prepareConfigFilesystem(configPath)   → string         (side-effect: mkdir, initConfig; returns canonical path)
prepareDataRoot(dataRoot)             → void           (side-effect: mkdir)
    ↓
resolveConfig(argv, defaults)         → CommandLineArguments  (pure merge)
```

Phase boundaries:

1. **`parseArgv`** — reads argv via yargs, detects global mode (`--global`), derives `configPath`. Returns nullable raw values. Does NOT call `getConfigValue`, `initConfig`, or touch the filesystem. Deprecated CLI aliases (`--autorun` → `browserLaunchEnabled`, etc.) are mapped here.

2. **`prepareConfigFilesystem` + `prepareDataRoot`** — the only side-effect seam. Creates config parent directory in global mode, calls `initConfig` to resolve and register the validated JSONC config, and creates the data root directory. `getConfigValue()` reads the prepared config after this phase.

3. **`resolveConfig`** — merges CLI overrides with config-file values via `getConfigValue`. Applies `stringToBool` to protocol fields, validates against `[true, false, 'auto']`, attaches URL helper methods (`getIPv4ListenUrl`, `getIPv6ListenUrl`, `getBrowserLaunchHostname`, `getBrowserLaunchUrl`).

Constraints:

- `server.js` is the sole caller of `CommandLineParser.parse()`. The return type shape is the external API contract.
## File format and upgrade

- Edit `config.jsonc`, not `default/config.jsonc`. JSONC uses double-quoted keys and strings and accepts comments and trailing commas. Missing values are merged at load time; existing JSONC files are not rewritten. Known keys are validated by Zod and unknown legacy or custom keys are kept.
- If JSONC is absent, startup imports an adjacent `.yaml` or `.yml` with the same basename and leaves the original intact. An explicit `--configPath ./custom.yaml` resolves to `./custom.jsonc`. Once JSONC exists, it takes precedence; syntax and type errors are reported instead of falling back to YAML. Fresh installations copy the commented defaults.
- Standalone config precedence is CLI value > `EMBERDESK_*` field environment override > file > defaults. Deprecated environment aliases and their coercion are preserved. `EMBERDESK_CONFIG_PATH` sets the standalone default path; Docker sets it to `./config/config.jsonc` so old `./config/config.yaml` volumes migrate in place without changing the Compose mount.
- `node recover.js` and `pnpm run init` share the same configuration preparation. Both honor `EMBERDESK_CONFIG_PATH`.
- For a card CDN, add the exact hostname or a `*.domain` rule to `whitelistImportDomains`; a wildcard only matches subdomains, not `domain` itself. A signed CDN URL must still be valid. Its query is forwarded unchanged.

### Global-mode data root isolation

In global mode (`node server.js --global` or `pnpm run start:global`), `dataRoot` is forced to `defaultConfig.dataRoot` (the OS app-data path from `envPaths('EmberDesk')`). CLI `--dataRoot` and config-file `dataRoot` are both ignored. Global launches write user data to the OS directory, not the process cwd.

```js
const resolvedDataRoot = argv.isGlobal
    ? defaultConfig.dataRoot
    : (argv.dataRoot ?? getConfigValue('dataRoot', defaultConfig.dataRoot));
```

### dataRoot resolution in standalone mode

In standalone mode, `dataRoot` follows the standard precedence: CLI arg > `EMBERDESK_DATAROOT` > config file > default (`./data`). The orchestrator resolves it after `initConfig` runs, because `getConfigValue` needs the config file to be initialized first.

## Core Implementation

### parseArgv

- yargs definition with all CLI options (including deprecated aliases)
- `isGlobal` = `cliArguments.global ?? false`
- `configPath` = global mode uses `envPaths('EmberDesk').data/config.jsonc`, standalone uses `--configPath`, `EMBERDESK_CONFIG_PATH`, or `./config.jsonc` in that order
- Returns `ParsedArgv` with all fields nullable except `isGlobal` (boolean) and `configPath` (string)

### resolveConfig

- For each field: `argv.xxx ?? getConfigValue('config.key', defaultConfig.xxx, 'type')`
- `enableIPv4`/`enableIPv6` use `stringToBool(argv) ?? stringToBool(getConfigValue(...)) ?? default`
- Protocol validation: invalid values fall back to defaults with a console warning
- URL helpers are closures over the resolved result object (`this.ssl`, `this.port`, etc.)

### getDefaultConfig

- Returns a frozen object with all default values
- `isGlobal=true` → paths use `envPaths('EmberDesk')`
- `isGlobal=false` → `configPath: './config.jsonc'` unless `EMBERDESK_CONFIG_PATH` is set, `dataRoot: './data'`
- URL helpers are throw-stubs in defaults; real implementations are attached by `resolveConfig`

## Related Semantic IDs And Code Binding Points

The config resolution pipeline has no user-facing semantic ID. The related semantic doc is:

- `page.api_configuration` — covers the browser-side API configuration UI, not server config resolution

Stability-sensitive binding points:

- `CommandLineParser.parse(process.argv)` in `server.js:8` — sole caller
- `globalThis.COMMAND_LINE_ARGS = cliArgs` in `server.js:10` — global export
- `globalThis.DATA_ROOT = cliArgs.dataRoot` in `server.js:9` — global export

## Related ADRs

