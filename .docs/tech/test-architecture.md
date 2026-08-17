# Test Architecture And Inventory

## Decision

EmberDesk keeps Jest for Node-side tests and Playwright for browser E2E. Vitest
is not added as a second runner: the repository already has Jest-specific
compatibility gates, Playwright fixtures, and a separate `tests` package.
Replacing the runner would create a migration project without improving the
current proof boundary.

The test's dependencies determine its lane. Directory names, historical
location, and filename convenience do not override the classification:

| Lane | Proof boundary | Default environment |
|---|---|---|
| Unit | deterministic logic with no real external resource | Node |
| Component | DOM behavior with controlled boundaries | Node until a real DOM-backed Jest component test is added |
| Integration | real filesystem, SQLite, HTTP/route, format, or module boundary | Node |
| E2E | cross-module user flow, browser runtime, or deployment behavior | Playwright browser |

The current Component lane is intentionally empty. Source-contract tests that
read React or browser source files remain Integration tests; they do not become
Component tests merely because the source contains DOM tokens.

## Commands

```bash
pnpm run test:unit
pnpm run test:component
pnpm run test:integration
pnpm run test:e2e
pnpm run test:all
pnpm run test:inventory
```

`test:unit` is the default fast lane. `test:all` is the explicit full suite.
Focused proof remains explicit and may name any target file:

```bash
pnpm --dir tests run test:unit -- express5-route-compatibility.test.js --runInBand
pnpm run test:compat
```

The lane runner creates a unique temporary run root and sets `DATA_ROOT`,
`DATA_DIR`, and `TMPDIR` below it. Playwright additionally receives an isolated
seed config, data root, port, and shard-qualified run root. CI can provide
`EMBERDESK_TEST_ROOT` as the parent directory.

## Inventory

```bash
node scripts/run-test-inventory.mjs \
  --json-out=/tmp/emberdesk-test-inventory.json \
  --markdown-out=/tmp/emberdesk-test-inventory.md
```

The inventory reports:

- discovered Jest and Playwright files, combined test counts, Jest suite/test failures, and wall time
- Playwright `--list` discovery separately from browser assertion execution
- the ten slowest files and ten slowest individual tests from Jest JSON results
- static resource candidates for DB, filesystem, network, browser, real time, and worker use
- process environment, global singleton, and shared temporary-directory candidates
- lifecycle candidates for server, DB, worker, timer, and global-state cleanup
- observable `import`, `setup`, `environment`, `tests`, and `teardown` fields

Jest 29 does not expose transform timing or complete per-file environment and
teardown timing through its JSON reporter. Those fields remain `null` and the
report identifies them as unavailable. The import probe is an approximate
pre-test-module interval, not a claim that every loader cost is isolated.
The Playwright count is discovery evidence only; it is not a pass/fail result.
Static resource and lifecycle flags are audit candidates, not proof of a leak.
Confirm them with focused runtime tests before changing production cleanup.

## Budgets

The lane runners print advisory wall-time budgets:

| Lane | Budget |
|---|---:|
| Unit | 10 s |
| Component | 5 s |
| Integration | 30 s |
| E2E | 300 s |

An exceeded budget is reported separately from a test failure. Repeated
regressions should first inspect fixture setup, module import cost, environment
initialization, and resource cleanup; increasing timeouts is not the first
response.

## Fixture And Lifecycle Rules

- Initialize stable schema and file fixtures once per file or worker when isolation remains explicit.
- Prefer transaction rollback or savepoints over rebuilding the same DB file for every test when the DB semantics allow it.
- Keep real workbook/XLSX parsing in a small Integration subset; do not generate identical workbook bytes per test.
- Disable permanent background loops in tests; start and stop workers explicitly.
- Close DB connections, servers, timers, workers, and file handles in the owning test scope.
- Use fake clocks, completion signals, or bounded polling instead of unbounded sleeps.
- Keep runtime resource cleanup proof separate from static inventory candidates.

## TDD Evidence

Behavior changes use a focused Red/Green loop:

1. Run only the target file or test before implementation and record the failing command.
2. Apply the smallest implementation and rerun the same focused command.
3. Keep the focused proof green through refactors.
4. Run the applicable lane, compatibility gate, build, browser, and docs proof separately.

The full suite is not a substitute for Red-first proof. A test that passes only
after its implementation is written is verification, not TDD evidence.
