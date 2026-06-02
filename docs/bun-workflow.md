# Bun Workflow

> Current package-management and task-runner contract for EmberDesk.

## Contract

- Root package manager is pinned with `packageManager: bun@1.3.14`.
- Node.js 24 Active LTS (`>=24 <25`) remains the supported application runtime and release proof target; Bun is used for dependency installation and script orchestration.
- Non-contract local Node majors, including Node 25, may be useful for diagnostics but do not satisfy release validation. As of June 2, 2026, the Node.js Release Working Group schedule lists 25.x as end-of-life after June 1, 2026.
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
- Do not widen `package.json` `engines.node` to non-LTS majors just because local focused tests pass under that runtime; update the contract only after source-backed release-schedule review and focused startup/test proof.
- `src/electron` is explicitly not Bun-owned yet. Electron failed to launch after a no-script Bun install because its binary install lifecycle did not run, so `src/electron/package-lock.json` and `start:electron` remain npm-owned.
- Root `package-lock.json` and `tests/package-lock.json` were removed after `bun ci` passed for those package boundaries.
- `.dockerignore` excludes nested `node_modules` so Docker install proof is not polluted by local dependency folders.

## Validation Notes

Validated migration surfaces:

- Root `bun ci`
- `tests` `bun ci`
- `bun run docs:build`
- Bun delegation to Jest and Playwright help/version commands
- `docker build .` through Bun production install and Webpack precompile

Known non-migration blockers in the current worktree:

- Full Jest validation is red on existing tests/source drift unrelated to package-manager migration.
- `bun run lint` is red on existing frontend/plugin lint debt and unrelated user changes.
