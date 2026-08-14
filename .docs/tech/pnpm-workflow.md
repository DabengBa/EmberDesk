# pnpm Workflow

> Current package-management and task-runner contract for EmberDesk.

## Contract

- Root, `tests`, and `src/electron` package managers are pinned with `packageManager: pnpm@12.0.0-rc.5`.
- Node.js 26.7.0 Current (`>=26.7.0 <27`) is the supported application runtime and release proof target; pnpm owns dependency installation and script orchestration.
- Non-contract local Node majors, including Node 25, may be useful for diagnostics but do not satisfy release validation.
- Root and `tests` package boundaries are pnpm-owned and have committed `pnpm-lock.yaml` files.
- `.npmrc` keeps lifecycle scripts disabled and rejects packages newer than seven days by default.
- Existing test frameworks remain Jest and Playwright.

## Commands

Use pnpm for local install and task execution:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build:lib
pnpm run build:react
pnpm run build:react:character-library
pnpm run build:react:workspace-panels
pnpm run docs:build
pnpm run test:unit
pnpm run test:compat
pnpm run test:e2e
(cd tests && pnpm install --frozen-lockfile --ignore-scripts)
```

Use `pnpm run test:compat` before and after frontend jQuery slices that must preserve regex, Tavern Helper / JS-Slash-Runner, or character-list DOM compatibility. It delegates to the focused Jest proof in the `tests` package and is a compatibility gate, not a replacement for slice-specific tests.

Use Vite build scripts for frontend build proof:

- `pnpm run build:lib` builds the shared `/lib.js` browser library.
- `pnpm run build:react` builds the shared React page app used by `/login`, `/setup`, and `/settings`.
- `pnpm run build:react:character-library` builds the guarded character-library workspace panel bundle.
- `pnpm run build:react:workspace-panels` builds the shared guarded workspace-panel action-island bundle for World Info, Background Library, and Extensions Host; React owns the visible host controls and action bridges, while prompt/regex/background file/slash/extension protocol behavior remains with the legacy owners until a later migration explicitly retires those boundaries.

Docker and release install verification also use pnpm:

- Image build installs the full pnpm dependency tree first (`NODE_ENV=development pnpm install --frozen-lockfile --ignore-scripts`) so Vite can prebuild React page/panel bundles, then reinstalls production-only dependencies after `build:react`, `build:react:character-library`, and `build:react:workspace-panels` succeed and `app/dist` is verified.
- The runtime image must contain `app/dist/index.html` plus the character-library and workspace-panels assets; without them `/login`, `/setup`, and `/settings` return HTTP 503.
- PR workflows install with `pnpm install --frozen-lockfile --ignore-scripts`.
- Use `pnpm publish` for registry publication when a release workflow requires it.

## Boundaries

- Do not run the server with Bun by default. `start`, `debug`, `start:global`, and `start:no-csrf` remain Node.js runtime commands.
- Do not widen `package.json` `engines.node` to another major just because local focused tests pass under that runtime; update the contract only after source-backed release-schedule review and focused startup/test proof.
- Local non-26.7.0 proof is diagnostic only after the Node 26.7.0 contract.
- `src/electron` is an independent pnpm package boundary; its Electron lifecycle remains explicit and is not part of the server install.
- `.dockerignore` excludes nested `node_modules` so Docker install proof is not polluted by local dependency folders.

## Validation Notes

Validated migration surfaces should include:

- `pnpm view @types/node version` before changing the Node type package.
- Root `pnpm install --frozen-lockfile --ignore-scripts`.
- `tests` `pnpm install --frozen-lockfile --ignore-scripts`.
- `pnpm run docs:build`.
- `pnpm run test:unit`.
- `pnpm run test:e2e` when runtime or startup compatibility must be proven end to end.
- `docker run --rm node:26.7.0-alpine3.23 node --version`.
- `docker build .` through full pnpm install, Vite builds (`build:lib`, `build:react`, `build:react:character-library`, `build:react:workspace-panels`), production prune, and `app/dist` verification.

Known local boundary:

- This workstation may resolve `node` to a non-contract version. Non-contract local Node majors remain diagnostic only; release proof should record the exact Node version used by the command or container.
