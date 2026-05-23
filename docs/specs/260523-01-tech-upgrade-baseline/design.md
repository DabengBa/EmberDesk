# Tech Upgrade Baseline Freeze

## Goal

Create a production-ready baseline before runtime, framework, or frontend organization upgrades begin. This step does not change product behavior. It proves the current `csp-dev` branch is reproducible, documents the verification commands, and gives later upgrade steps a stable comparison point.

## Production-Ready Result

This task is shippable when the current application starts, the existing automated test surface passes, and the baseline evidence is recorded in the PR summary or release notes. No later upgrade step may proceed if this baseline cannot be reproduced.

## Source Evidence

- `server.js` is the process entry point and imports `src/server-main.js`.
- `package.json` declares `node >= 20`, ESM, root test forwarding, startup scripts, and Webpack/doc/performance commands.
- `tests/package.json` owns Jest and Playwright commands.
- `tests/playwright.config.js` fixes the browser target at `http://127.0.0.1:8000`, 4 workers, and full parallel mode.
- `webpack.config.js` builds only `public/lib.js` into the generated browser library.
- Node.js Release Working Group schedule shows Node 24 as Active LTS in 2026; this baseline records the pre-upgrade state before targeting it.

## Scope

In scope:

- Record exact local versions for Node, package manager, Playwright browser availability, and OS.
- Run the root unit test command and the E2E command against a known local server configuration.
- Run documentation validation if semantic docs changed in the same release train.
- Record any known flaky tests or environment requirements before upgrades begin.

Out of scope:

- Changing Node version requirements.
- Updating Express, middleware, or route behavior.
- Refactoring frontend scripts.
- Replacing Webpack or test frameworks.

## Implementation Plan

1. Confirm the branch is clean and based on the intended `csp-dev` commit.
2. Capture baseline versions with `node --version`, package manager version, and operating system details.
3. Install dependencies with the repo-standard JavaScript package manager. If the repository still contains npm scripts from upstream, do not rewrite them in this step.
4. Run `npm run test:unit --` from the root package.
5. Start the server with a local config that uses `127.0.0.1:8000`, no browser launch, no external network assumptions, and isolated data.
6. Run `npm run test:e2e --` against the running server.
7. Run `npm run docs:check` when docs are touched.
8. Record command results, start command, config path, and commit SHA in the delivery notes.

## Acceptance Criteria

- The server starts from `server.js` and reaches the listening state.
- Unit tests pass on the baseline runtime.
- Playwright E2E tests pass or any pre-existing flake is documented with a reproducible rerun result.
- Documentation checks pass when semantic docs are part of the branch.
- No production dependency, route, UI, or runtime behavior is changed by this step.

## Rollback

Rollback is a no-op because this step should not change application behavior. If any documentation or scripts are added only for baseline recording, revert that single docs-only commit.

## Risks And Boundaries

- The E2E suite depends on fixed port `8000`; parallel local work can cause false failures.
- Jest still runs through `--experimental-vm-modules`, which may become a runtime-upgrade issue later.
- Existing local generated artifacts must not be confused with baseline evidence unless they are explicitly referenced in the delivery notes.

