# Task 05 Evidence

## Verification

- `PLAYWRIGHT_REUSE_SERVER=0 bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js chat-message-list-walkthrough.e2e.js --workers=1`
  - Result: the initial combined run exposed a retired Main Chat test flag; the corrected focused walkthrough passed 4 tests and the navigation matrix passed 10 tests.
- `bun run perf:interaction`
  - Result: completed and wrote `artifacts/interaction-perf/2026-07-18T07-33-58-423Z/report.md`.
- `bun run docs:check`
  - Result: validated 30 semantic docs.

## Performance Boundary

The performance runner now reaches `app:ready` and completes. Its report still records pre-existing character-index path mismatches and intermittent main-chat sample page errors, so the report is retained as execution evidence rather than a clean no-regression comparison.
