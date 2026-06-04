# Bun Workflow

> Current package-management and task-runner contract for EmberDesk.

## Contract

- Root package manager is pinned with `packageManager: bun@1.3.14`.
- Node.js 26.3.0 Current (`>=26.3.0 <27`) is the supported application runtime and release proof target; Bun is used for dependency installation and script orchestration.
- Non-contract local Node majors, including Node 25, may be useful for diagnostics but do not satisfy release validation.
- Root and `tests` package boundaries are Bun-owned and have committed `bun.lock` files.
- `bunfig.toml` and `tests/bunfig.toml` preserve the install policy:
  - `ignoreScripts = true`
  - `minimumReleaseAge = 604800`
  - `run.bun = false`
- Existing test frameworks remain Jest and Playwright.

## Commands

Use Bun for local install and task execution:

```powershell
bun ci
bun run docs:build
bun run test:unit
bun run test:compat
bun run test:e2e
Push-Location tests; bun ci; Pop-Location
```

Use `bun run test:compat` before and after frontend jQuery slices that must preserve regex, Tavern Helper / JS-Slash-Runner, or character-list DOM compatibility. It delegates to the focused Jest proof in the `tests` package and is a compatibility gate, not a replacement for slice-specific tests.

Docker and release install verification also use Bun:

- Docker copies Bun from `oven/bun:1.3.14-alpine` and runs `bun install --frozen-lockfile --production --no-progress`.
- PR workflows install with `bun ci`.
- npm release workflow installs production dependencies with Bun, then keeps `npm publish` only for registry publication.

## Boundaries

- Do not run the server with Bun by default. `start`, `debug`, `start:global`, and `start:no-csrf` remain Node.js runtime commands.
- Do not widen `package.json` `engines.node` to another major just because local focused tests pass under that runtime; update the contract only after source-backed release-schedule review and focused startup/test proof.
- Local Node 25.4.0 proof is diagnostic only after the Node 26.3.0 contract.
- `src/electron` is explicitly not Bun-owned yet. Electron failed to launch after a no-script Bun install because its binary install lifecycle did not run, so `src/electron/package-lock.json` and `start:electron` remain npm-owned.
- Root `package-lock.json` and `tests/package-lock.json` were removed after `bun ci` passed for those package boundaries.
- `.dockerignore` excludes nested `node_modules` so Docker install proof is not polluted by local dependency folders.

## Validation Notes

Validated migration surfaces should include:

- `npm view @types/node version` before changing the Node type package.
- Root `bun ci`.
- `tests` `bun ci`.
- `bun run docs:build`.
- `bun run test:unit`.
- `bun run test:e2e` when runtime or startup compatibility must be proven end to end.
- `docker run --rm node:26.3.0-alpine3.23 node --version`.
- `docker build .` through Bun production install and Webpack precompile.

Known local boundary:

- This workstation currently has local Node 25.4.0. It is useful for diagnostic Bun and docs checks, but exact Node.js 26.3.0 runtime proof must come from CI, Docker, or an installed Node 26.3.0 runtime.
