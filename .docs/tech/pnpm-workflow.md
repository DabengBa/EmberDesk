---
description: "- Root and tests package managers are pinned with packageManager: pnpm@12.21.0. - Node.js 26.13.1 LTS (>=26.13.1 <27) is the supported application runtime and release proof target; pnpm owns dependency installation and script..."
kind: technical
topic: pnpm-workflow
---

# pnpm Workflow

> Current package-management and task-runner contract for EmberDesk.

## Contract

- Root and `tests` package managers are pinned with `packageManager: pnpm@12.21.0`.
- Node.js 26.13.1 LTS (`>=26.13.1 <27`) is the supported application runtime and release proof target; pnpm owns dependency installation and script orchestration.
- Node.js versions outside `>=26.13.1 <27` may be useful for diagnostics but do not satisfy release validation. Node 24 release proof is no longer required.
- Root and `tests` package boundaries are pnpm-owned and have committed `pnpm-lock.yaml` files.
- `.npmrc` disables lifecycle scripts for the root package; `tests/pnpm-workspace.yaml` disables them for the standalone test package.
- Both workspace configurations set `minimumReleaseAge: 0` to disable pnpm's release-age filter. The `no-downgrade` trust policy remains in effect.
- Existing test frameworks remain Jest and Playwright.

### Native image processing

- Server-side image conversion and avatar thumbnail generation use `sharp` and its platform-specific native dependencies; BMP decoding also uses `bmp-ts`. Keep optional dependencies enabled when installing from the lockfile, including production installs. The repository's `--ignore-scripts` policy remains in effect; it is not a reason to omit the platform packages.
- Install dependencies for the actual runtime OS, CPU architecture and C library instead of copying a `node_modules` tree from a different platform. The supplied Dockerfile uses Alpine (musl) and performs both full and production installs inside the image.
- After installation, a native-load smoke check is `node --input-type=module -e "import sharp from 'sharp'; console.log(sharp.versions)"`. A successful check on one platform does not validate another platform or a fresh Docker build. If the import fails, check that the matching optional packages were installed and that the runtime matches the install environment; do not simply enable all lifecycle scripts as a workaround.

## Commands

Use pnpm for local install and task execution:


```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build:lib
pnpm run build:react
pnpm run docs:build
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run test:component
pnpm run test:integration
pnpm run test:compat
pnpm run test:e2e
pnpm run test:all
pnpm run test:inventory
(cd tests && pnpm install --frozen-lockfile --ignore-scripts)
```

Use `pnpm run test:compat` before and after frontend jQuery slices that must preserve regex, Tavern Helper / JS-Slash-Runner, or character-list DOM compatibility. It delegates to the focused Jest proof in the `tests` package and is a compatibility gate, not a replacement for slice-specific tests.

Test lanes are selected from the test's observed dependencies rather than its
directory or filename:

- `test:unit` is the default fast lane for deterministic logic with no real external resource.
- `test:component` is reserved for DOM behavior with controlled boundaries; the current repository has no DOM-backed Jest component files, so the lane passes with no tests.
- `test:integration` covers real filesystem, SQLite, HTTP/route, format, and module-boundary tests.
- `test:e2e` covers Playwright browser journeys and starts with an isolated data root, temporary directory, and port per run/shard.
- `test:all` runs all Jest files followed by the isolated Playwright lane.
- `test:inventory` reports static layer/resource candidates, combined Jest/Playwright discovery counts, slow Jest files/tests, and observable phase timings.

Every lane runner sets `DATA_ROOT`, `DATA_DIR`, and `TMPDIR` below a unique
temporary run root. `EMBERDESK_TEST_ROOT` can provide a CI-owned parent; shard
identity is included in the Playwright run root. The inventory report keeps
`transform`, `environment`, and full `teardown` as unavailable when Jest does
not expose those phases, rather than treating suite wall time as a fake phase.

Use Vite build scripts for frontend build proof:

Server TypeScript uses native Node execution and separate type checking; see
[server-typescript.md](server-typescript.md) for module conventions and the
Node/Jest proof boundary. `pnpm run typecheck` checks both frontend and server
projects, and `pnpm run lint` includes migrated server TypeScript.

- `pnpm run build:lib` builds the shared `/lib.js` browser library.
- `pnpm run build:react` builds one application for `/`, `/login`, `/setup`, and `/settings`. Workspace panels are chunks of that application, not separate builds.

For local development, `pnpm run dev:all` starts Express and Vite; `pnpm run dev:express` and `pnpm run dev` start them separately. Vite defaults to port `3001` and proxies backend routes and legacy assets to `http://127.0.0.1:8000`. Set `VITE_DEV_PORT` or `VITE_BACKEND_ORIGIN` to match a custom local setup. Vite uses multi-page mode, so unknown HTML paths do not fall back to the root page. The proxy configuration is owned by `vite-dev-server-config.mjs` and exercised by `tests/vite-dev-proxy.integration.test.js`.

Docker and release install verification also use pnpm:

- Image build installs the full pnpm dependency tree first (`NODE_ENV=development pnpm install --frozen-lockfile --ignore-scripts`) so Vite can prebuild the browser library and React app, then reinstalls production-only dependencies after the builds succeed and `app/dist` is verified.
- Deploy the complete `app/dist` directory, including its entry document and generated assets. If `app/dist/index.html` is missing, the React routes return HTTP 503 after any applicable setup and authentication redirects.
- PR workflows install with `pnpm install --frozen-lockfile --ignore-scripts`.
- Use `pnpm publish` for registry publication when a release workflow requires it.

## Boundaries

- Do not run the server with Bun by default. `start`, `debug`, `start:global`, and `start:no-csrf` remain Node.js runtime commands.
- Keep `package.json`, the Docker image, and runtime documentation aligned on the supported Node 26 major; validate runtime changes with focused startup tests and builds.
- Local proof outside the Node.js `>=26.13.1 <27` contract is diagnostic only.
- The server install owns Node.js runtime only; Electron desktop-shell packaging is no longer part of the repository.
- `.dockerignore` excludes nested `node_modules` so Docker install proof is not polluted by local dependency folders.

## Validation Notes

Validated migration surfaces should include:

- `pnpm view @types/node version` before changing the Node type package.
- Root `pnpm install --frozen-lockfile --ignore-scripts`.
- The `sharp` native-load smoke check above on each release runtime, including inside the built image when Docker is part of the release proof.
- `tests` `pnpm install --frozen-lockfile --ignore-scripts`.
- `pnpm run docs:build`.
- `pnpm run test:unit`.
- `pnpm run test:e2e` when runtime or startup compatibility must be proven end to end.
- `docker run --rm node:26.13.1-alpine3.24 node --version`.
- `docker build .` through full pnpm install, Vite builds (`build:lib`, `build:react`), production prune, and `app/dist` verification.

Known local boundary:

- This workstation may resolve `node` to a non-contract version. Non-contract local Node majors remain diagnostic only; release proof should record the exact Node version used by the command or container.
