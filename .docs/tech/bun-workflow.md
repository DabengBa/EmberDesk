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

```bash
bun ci --ignore-scripts
bun run build:lib
bun run build:react
bun run build:react:character-library
bun run build:react:workspace-panels
bun run docs:build
bun run test:unit
bun run test:compat
bun run test:e2e
(cd tests && bun ci --ignore-scripts)
```

Use `bun run test:compat` before and after frontend jQuery slices that must preserve regex, Tavern Helper / JS-Slash-Runner, or character-list DOM compatibility. It delegates to the focused Jest proof in the `tests` package and is a compatibility gate, not a replacement for slice-specific tests.

Use Vite build scripts for frontend build proof:

- `bun run build:lib` builds the shared `/lib.js` browser library.
- `bun run build:react` builds the shared React page app used by `/login`, `/setup`, and `/settings`.
- `bun run build:react:character-library` builds the guarded character-library workspace panel bundle.
- `bun run build:react:workspace-panels` builds the shared guarded workspace-panel action-island bundle for World Info, Background Library, and Extensions Host; React owns the visible host controls and action bridges, while prompt/regex/background file/slash/extension protocol behavior remains with the legacy owners until a later migration explicitly retires those boundaries.
- `bun run build:lib:webpack` remains a deprecated `/lib.js` fallback check only.

Docker and release install verification also use Bun:

- Docker copies Bun from `oven/bun:1.3.14-alpine`.
- Image build installs the full Bun dependency tree first (`NODE_ENV=development bun install --frozen-lockfile --no-progress`) so Vite can prebuild React page/panel bundles, then reinstalls production-only dependencies after `build:react`, `build:react:character-library`, and `build:react:workspace-panels` succeed and `app/dist` is verified.
- The runtime image must contain `app/dist/index.html` plus the character-library and workspace-panels assets; without them `/login`, `/setup`, and `/settings` return HTTP 503.
- PR workflows install with `bun ci --ignore-scripts`.
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
- Root `bun ci --ignore-scripts`.
- `tests` `bun ci --ignore-scripts`.
- `bun run docs:build`.
- `bun run test:unit`.
- `bun run test:e2e` when runtime or startup compatibility must be proven end to end.
- `docker run --rm node:26.3.0-alpine3.23 node --version`.
- `docker build .` through full Bun install, legacy `docker/build-lib.js` Webpack precompile, React Vite prebuilds (`build:react`, `build:react:character-library`, `build:react:workspace-panels`), production prune, and `app/dist` verification. Frontend build proof for touched browser surfaces should still use the Vite build script first; removing the Docker Webpack precompile is a separate build-path change.

Known local boundary:

- This workstation currently resolves `node` to Node.js 26.3.0. Non-contract local Node majors remain diagnostic only; release proof should record the exact Node version used by the command or container.
