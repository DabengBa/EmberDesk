# Modernization Phase 0 Baseline

## Module Responsibility

This document records the Phase 0 validation baseline for the EmberDesk modernization roadmap. It captures the current local verification state, known global gates, skipped higher-cost checks, and risks to resolve before later modernization slices.

This is an execution record for `.docs/tech/modernization-roadmap.md`. It does not change product semantics and does not update `.docs/db/`.

## Baseline Context

- Date: 2026-06-02
- Workspace: `D:\DEV\EmberDesk`
- Local Node: `v25.4.0`
- Local Bun: `1.3.14`
- Project runtime contract at the time of this baseline: Node.js 24 Active LTS (`>=24 <25`). This was superseded by Node.js 26.3.0 Current on 2026-06-04 and by Node.js 26.7.0 Current (`>=26.7.0 <27`) on 2026-08-07.

The local test run was executed under Node 25.4.0. Treat the results as useful diagnostic evidence, not as a replacement for release validation on the active runtime contract. As of June 2, 2026, the Node.js Release Working Group schedule lists 25.x as end-of-life after June 1, 2026, so local Node 25 proof must not widen the runtime contract.

## Validation Results

| Area | Command | Result | Notes |
|---|---|---|---|
| Semantic docs check | `pnpm run docs:check` | Pass | Validated 22 semantic docs. |
| Semantic docs build | `pnpm run docs:build` | Pass | Built bundle for 22 semantic docs. |
| Third-party compatibility gate | `pnpm run test:compat` | Pass | 1 suite, 6 tests. Covers extension mount points, Tavern Helper assets/imports, key exports, event values, regex placement values, and character-list row identity. |
| Express 5 route/order gate | `pnpm --dir tests run test:unit -- express5-route-compatibility.test.js --runInBand` | Pass | 1 suite, 11 tests. Console errors/warnings are expected test fixtures for async failure and deprecated-route behavior. |
| Shared browser library boundary | `pnpm --dir tests run test:unit -- frontend-shared-library-boundary.test.js --runInBand` | Pass | 1 suite, 3 tests. Historical baseline verified documented exports, legacy globals, and the then-current bundled module output. |
| Startup/config focused tests | `pnpm --dir tests run test:unit -- command-line.test.js server-startup-profiler.test.js startup-critical-path.test.js startup-deferred-tasks.test.js startup-loader.test.js --runInBand` | Pass | 5 suites, 43 tests. Console warnings are expected config/bootstrap test fixtures. |
| User/auth/setup/login focused tests | `pnpm --dir tests run test:unit -- user-auth.test.js user-storage.test.js user-directories.test.js user-migrations.test.js login-page-controller.test.js setup-page-controller.test.js --runInBand` | Pass | 6 suites, 47 tests. |
| Character-list focused tests | `pnpm --dir tests run test:unit -- character-list-state.test.js character-list-render-state.test.js character-list-structure.test.js character-sidebar-structure.test.js --runInBand` | Pass | 4 suites, 39 tests. |
| Performance tooling focused tests | `pnpm --dir tests run test:unit -- performance-report.test.js interaction-performance-report.test.js interaction-performance-index.test.js interaction-performance-delete.test.js --runInBand` | Pass | 4 suites, 39 tests. Console warnings are expected corrupt-cache/missing-file degradation fixtures. |
| Full unit suite | `pnpm run test:unit` | Pass | 48 suites, 575 tests. |
| Full lint | `pnpm run lint` | Pass | Initial Phase 0 run failed with 175731 errors. Follow-up remediation excludes vendored third-party extension artifacts from whole-repo lint and fixes remaining first-party lint debt. |

## Lint Baseline

The initial Phase 0 `pnpm run lint` pass was red. The failure was not attributed to the baseline run because Phase 0 originally only captured validation state.

The follow-up lint remediation completed these actions:

- Added `public/scripts/extensions/third-party/**` to ESLint ignore patterns so vendored Tavern Helper / JS-Slash-Runner build artifacts are not treated as first-party source.
- Removed unused imports, constants, helper functions, and unreachable dead code from first-party files.
- Let scoped ESLint autofix normalize quotes, indentation, blank lines, and related formatting issues in first-party files.

After remediation, `pnpm run lint` is a green whole-repo gate again.

Primary failure groups:

- Vendored third-party extension files under `public/scripts/extensions/third-party/JS-Slash-Runner`, especially minified or generated assets such as `lib/jsoneditor.js`, plus CommonJS config files and iframe helpers.
- First-party unused imports or variables in:
  - `public/script.js`
  - `public/scripts/custom-request.js`
  - `public/scripts/extensions/expressions/index.js`
  - `public/scripts/extensions/shared.js`
  - `public/scripts/macros.js`
  - `public/scripts/macros/definitions/core-macros.js`
  - `public/scripts/openai.js`
  - `public/scripts/tokenizers.js`
  - `public/scripts/world-info.js`
  - `src/endpoints/backends/chat-completions.js`
  - `src/plugin-loader.js`
  - `src/user-directories.js`
- First-party formatting/style violations in:
  - `public/scripts/backgrounds.js`
  - `public/scripts/import-confirm-dialog.js`
  - `public/scripts/openai.js`
  - `public/scripts/power-user.js`
  - `public/scripts/world-cascade-dialog.js`
  - `src/constants.js`
  - `src/endpoints/backends/chat-completions.js`

Resolved lint follow-up:

1. Vendored third-party extension build artifacts are excluded from whole-repo ESLint.
2. First-party unused imports, unreachable code, quotes, indentation, and blank-line issues from the baseline run were fixed.
3. Compatibility-sensitive frontend surfaces were validated with focused tests after the lint remediation.

## Skipped Checks

| Check | Status | Reason |
|---|---|---|
| Full Playwright E2E | Skipped | Higher-cost browser/server validation. No user-facing behavior changed in Phase 0. Run before release or before/after UI slices. |
| Startup performance runner | Skipped | No startup optimization was implemented in Phase 0. Use only when making or validating performance claims. |
| Interaction performance runner | Skipped | No interaction-performance implementation changed in Phase 0. Use for character-list, delete, get/list, and cache changes. |
| Contract Node runtime proof | Skipped in this historical baseline | The Phase 0 workstation used Node 25.4.0. This was superseded by later Node.js 26.3.0 release validation and the current Node.js 26.7.0 runtime contract recorded in `.docs/PROJECT_HISTORY.md`. |

## Baseline Gates For Later Slices

Use this baseline before future modernization work:

- Run `pnpm run docs:check` after semantic documentation changes.
- Run `pnpm run test:compat` before and after touching regex, extensions, slash commands, message rendering, world-info regex editing, or character-list DOM identity.
- Run `express5-route-compatibility.test.js` before and after changing Express route syntax, route order, middleware order, upload parsing, static routes, or error/404 handling.
- Run `frontend-shared-library-boundary.test.js` before and after changing `public/lib.js`, Vite library output, legacy globals, or shared browser dependency interop.
- Run startup/config focused tests before and after changing `server.js`, `src/server-main.js`, `src/command-line.js`, `src/server-startup.js`, or startup profiling.
- Run user/auth/setup/login focused tests before and after touching account storage, user directories, migrations, auth, login, or setup behavior.
- Run character-list focused tests before and after touching character-list state, rendering, row identity, pagination, bulk selection, or delete reconcile.
- Run performance tooling tests plus the relevant runner before making performance claims.

## Historical Risk Register

These were Phase 0 risks from 2026-06-02, not the current repository risk register. The Node runtime items were superseded by the Node.js 26.7.0 contract update and later release-validation records.

- Phase 0 local validation was not on the active project runtime contract because that workstation used Node 25.4.0.
- Node 25 local proof was diagnostic only and must not be used to widen the supported engine range.
- Vendored third-party extension code is excluded from whole-repo lint and should not be auto-formatted casually.
- Playwright E2E was not run in this Phase 0 pass.
- Performance runners were not run because no performance change was made.
