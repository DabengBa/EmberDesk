# Task 04 Evidence — sole-owner cutover, e2e, compat, docs

## Commands
- `bun run --cwd tests test:unit -- character-library-row-helpers.test.js character-library-react-helpers.test.js character-library-react-panel-flag.test.js character-list-structure.test.js character-list-state.test.js character-list-render-state.test.js character-read-service.test.js react-workspace-panels-helpers.test.js --runInBand`
- `bun run build:react:character-library`
- `bun run test:compat`
- `bun run docs:check`
- `PLAYWRIGHT_CHROME_EXECUTABLE=/usr/bin/google-chrome-stable PLAYWRIGHT_REUSE_SERVER=0 bun run --cwd tests test:e2e -- character-group-authoring.e2e.js welcome-screen-character-management.e2e.js --workers=1`
- `bun run perf:interaction` (attempted)

## Result
- PASS focused unit (8 suites / 112 tests)
- PASS character-library React build
- PASS `test:compat`
- PASS `docs:check` (30 semantic docs)
- PASS authoring e2e (3/3) + welcome library open e2e (1/1)
- PERF boundary: `perf:interaction` cannot launch Playwright's bundled chromium (`~/.cache/ms-playwright/chromium_headless_shell-1194` missing). System Chrome is used for e2e via `PLAYWRIGHT_CHROME_EXECUTABLE`; interaction runner does not honor that path in this environment. No measured regression available; virtualized React list path remains the sole list DOM producer.

## E2E root-cause note
- Post-save `page.reload` + `testSetup.awaitST` double document load exhausted Chromium (`net::ERR_INSUFFICIENT_RESOURCES` / `Failed to fetch`) under React panel assets + authoring panels.
- Fix: `tests/frontend/frontent-test-utils.js` waits out an in-flight same-origin boot after reload instead of forcing another `page.goto` bootstrap.

## Summary
Character Library is always-on React sole owner for list/rows with protected selectors, fail-closed missing build, no legacy list dual-owner path. Dual-owner sync module retired; remaining pure query helpers live in `public/scripts/character-library-query-helpers.js`.
