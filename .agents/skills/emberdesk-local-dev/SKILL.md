---
name: emberdesk-local-dev
description: Run and troubleshoot EmberDesk locally. Use for dependency installation, Node/Bun runtime boundaries, config/data roots, startup commands, Docker builds, Electron exception handling, and environment setup.
---

# EmberDesk Local Dev

Use this when setting up the repo, starting the server, changing runtime configuration, or debugging local startup.

## Read First

- `package.json`, `bunfig.toml`, `bun.lock`
- `tests/package.json`, `tests/bunfig.toml`, `tests/bun.lock` when tests are involved
- `.docs/tech/bun-workflow.md`
- `docs/environments.md` if using the shared remote test server
- `default/config.yaml`
- `src/command-line.js`, `src/config-init.js`, `src/server-main.js`
- `Dockerfile`, `docker/docker-compose.yml`, `docker/build-lib.js` for container work

## Runtime Contract

- Application runtime is Node.js 26.3.0 Current (`>=26.3.0 <27`).
- Local proof under non-contract Node majors, including Node 25, is diagnostic only and does not replace Node.js 26.3.0 release validation.
- Root package manager and script runner are Bun (`packageManager: bun@1.3.14`).
- Bun is for install and orchestration; default server commands still run Node.
- `src/electron` is not Bun-owned yet. Keep Electron npm-owned unless the project explicitly migrates it.
- Root and `tests/` are separate package boundaries. Install each boundary with Bun when needed.
- `bunfig.toml` and `tests/bunfig.toml` set `ignoreScripts = true`, `minimumReleaseAge = 604800`, and `run.bun = false`.

## Common Commands

```powershell
bun ci
Push-Location tests; bun ci; Pop-Location
bun run start
bun run start:no-csrf
bun run start:global
bun run docs:check
bun run docs:build
bun run test:unit
bun run test:e2e
```

Use `node server.js --configPath <path> --dataRoot <path> --port <port>` for isolated startup, because `server.js` is the real entry point.

## Config And Data

- `server.js` calls `CommandLineParser.parse(process.argv)`, sets `globalThis.DATA_ROOT`, then imports `src/server-main.js`.
- Standalone mode uses `./config.yaml` and `./data` unless CLI/config overrides them.
- Global mode forces OS app-data paths via `envPaths('EmberDesk')`; CLI `--dataRoot` and config `dataRoot` are ignored in global mode.
- `default/config.yaml` is the canonical default template. Do not rename config keys without updating `src/command-line.js`, tests, and docs.
- `disableCsrfProtection`, `allowKeysExposure`, `enableCorsProxy`, `privateAddressWhitelist.*`, and `hostWhitelist.*` are security-sensitive defaults.

## Docker Notes

- Docker copies Bun from `oven/bun:1.3.14-alpine`.
- Production install is `bun install --frozen-lockfile --production --no-progress`.
- Docker then precompiles browser libraries through `node ./docker/build-lib.js`.
- Do not switch Docker production install back to npm or pnpm without a documented migration.

## Remote Test Server

`docs/environments.md` defines `https://sttest.tanyaleoallen.cloud/` as a shared test server for remote-only browser checks. Never store credentials, cookies, tokens, or exported browser storage in the repo.

## Validation

- After setup or install changes: run root `bun ci`; run `Push-Location tests; bun ci; Pop-Location` if tests are affected.
- After startup/config changes: run focused command-line/startup tests and start with an isolated `--configPath`/`--dataRoot` when practical.
- After Docker changes: inspect `Dockerfile` and run a Docker build when environment supports it.
