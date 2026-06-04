---
name: emberdesk-testing-debugging
description: Select, run, and debug EmberDesk validation. Use when adding regression proof, choosing focused Jest or Playwright commands, diagnosing lint/test failures, checking compatibility gates, or validating docs and performance tooling.
---

# EmberDesk Testing Debugging

Use this whenever behavior changes, a validation command fails, or the right proof surface is unclear.

## Read First

- `package.json` and `tests/package.json`
- `tests/jest.config.json`, `tests/playwright.config.js`
- `.docs/tech/bun-workflow.md`
- Relevant `.docs/tech/*.md` and `.docs/db/**` for the feature being changed
- Existing focused tests near the touched code

## Test Boundaries

- Root `bun run test:unit` delegates to the `tests` package.
- `tests/` is a separate Bun package with its own lockfile and dependencies.
- Jest runs through `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json`.
- Playwright config seeds a temporary dev environment, then starts `node server.js --configPath ... --port ...`.
- PR checks run docs build, ESLint, and unit tests. They do not run all Playwright E2E tests by default.

## Focused Commands

```powershell
bun run --cwd tests test:unit -- <test-file> --runInBand
bun run --cwd tests test:e2e -- <test-file>
bun run test:compat
bun run docs:check
bun run docs:build
bun run lint
```

Use `bun run test:compat` before and after frontend work touching regex, Tavern Helper / JS-Slash-Runner, `@sillytavern/*` imports, character-list DOM identity, extension panels, slash commands, or world-info regex editing.

## Pick The Proof

- Server startup/config: `command-line.test.js`, `server-startup-profiler.test.js`, `startup-*.test.js`.
- Express 5 route behavior: `express5-route-compatibility.test.js`.
- User/auth/storage: `user-auth.test.js`, `user-storage.test.js`, `user-directories.test.js`, `user-migrations.test.js`, login/setup controller tests.
- Secrets/security: `secrets-migration.test.js`, `secrets-input-map.test.js`, `private-request-filter.test.js`.
- Frontend shared library: `frontend-shared-library-boundary.test.js`.
- Character list and compatibility: `character-list-structure.test.js`, `character-list-state.test.js`, `third-party-extension-compatibility.test.js`.
- Login/setup browser flow: `login.e2e.js`.
- Macro system: `tests/frontend/Macro*.e2e.js`.
- Performance tooling: `performance-report.test.js`, `interaction-performance-*.test.js`, runner scripts under `scripts/`.

## Debugging Workflow

1. Reproduce with the smallest existing focused command.
2. Read the failing test and the owning implementation before editing.
3. Add or adjust a focused failing proof before behavior changes when there is an executable surface.
4. Fix the owning module without broad refactors.
5. Re-run the focused command, then any gate required by the touched boundary.
6. If `.docs/db` changed, run docs check/build.

## Known Caveats

- `.docs/tech/bun-workflow.md` records runtime and validation boundaries. Do not treat unrelated existing failures as part of a narrow task without evidence.
- Playwright can reuse an existing server unless `PLAYWRIGHT_REUSE_SERVER=0`; its default data/config paths are `.tmp/playwright-e2e-*`.
- Some frontend compatibility tests intentionally assert legacy selectors and exports. Do not delete them as “old style” without a migration plan.

## Validation

Always report exactly which commands passed, failed, or were skipped, and whether failures look pre-existing or caused by the current change.
