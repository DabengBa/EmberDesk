# Task 01 Evidence

## Scope

- React workspace shell navigation now resolves declared child slots before calling feature-local capabilities.
- Slot contracts declare stable keys, content owners, mount targets, accessible names, and allowed capabilities.
- React store owns the visible pin state. The slot host only projects that state to its protected legacy DOM.

## Red-Green

- Red: `bun run --cwd tests test:unit -- react-state-stores.test.js react-workspace-panels-helpers.test.js --runInBand`
  - Result: failed because child-slot contract exports and React-owned pin lifecycle were absent.
- Green: `bun run --cwd tests test:unit -- react-state-stores.test.js react-workspace-panels-helpers.test.js --runInBand`
  - Result: 45 tests passed.

## Verification

- `bun run build:react:workspace-panels`
  - Result: Vite workspace panel bundle built successfully.
- `bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js --workers=1`
  - Result: 9 Playwright tests passed, including the React-owned pin/refocus/unpin/close flow.
- `git diff --check`
  - Result: passed.

## Boundary

The retained legacy DOM remains a child-slot content and compatibility host. React shell state no longer reads legacy pin results; the shell dispatches explicit activate, deactivate, and pin projection capabilities.
