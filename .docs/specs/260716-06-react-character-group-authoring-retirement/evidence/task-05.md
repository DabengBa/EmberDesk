# Task 05 Evidence — compat, docs, browser

## Commands
- `bun run test:compat`
- `bun run docs:check`
- `bun run build:react:workspace-panels`
- `bun run --cwd tests test:unit -- character-authoring-facade.test.js group-authoring-facade.test.js character-write-service.test.js character-card-helpers.test.js react-workspace-panels-helpers.test.js workspace-react-panel-flags.test.js --runInBand`
- `PLAYWRIGHT_REUSE_SERVER=0 bun run --cwd tests test:e2e -- character-group-authoring.e2e.js --workers=1` (attempted)

## Result
- PASS compat (12 tests)
- PASS docs:check (30 semantic docs)
- PASS workspace-panels build
- PASS focused unit suites for authoring retirement
- E2E blocked in this environment: Playwright missing `chromium_headless_shell-1194` (`npx playwright install chromium` still downloading / incomplete). Treat browser proof as environment-blocked, not code-failure. Node is 24.16.0 (contract 26.3.0) so any local E2E success would still be diagnostic-only for release.

## Doc updates
- `.docs/db/features/group-authoring.md` sole-owner + full field coverage + fail-closed missing build
- `.docs/db/features/character-library-panel.md` authoring sole-owner wording
- `.docs/db/pages/chat-workspace.md` authoring sole-owner wording
- `.docs/tech/legacy-cutover-ledger.md` Character/Group Authoring rows -> deleted-or-retired
- `.docs/PROJECT_HISTORY.md` 2026-07-16 retirement row

## Summary
R7/R8 docs and compatibility gates green. Browser E2E not executable here due to Playwright browser binary gap.
