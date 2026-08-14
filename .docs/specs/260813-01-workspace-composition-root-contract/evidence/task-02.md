## Task 2 proof

- Command: `pnpm run test:compat`; `node --check public/script.js`; `find public/scripts -type f -name '*.js' -print0 | xargs -0 -n1 node --check`
- Result: PASS (2 suites, 22 tests; all first-party browser modules parse)
- Summary: first-party consumers import `eventSource`/`event_types` from `events.js`; no forbidden event reverse-import hits remain
- Artifacts: `public/scripts/events.js`, touched `public/scripts/**/*.js`, `tests/script-js-composition-root.test.js`
- Environment: Node `v24.16.0`; diagnostic proof only, not release proof
