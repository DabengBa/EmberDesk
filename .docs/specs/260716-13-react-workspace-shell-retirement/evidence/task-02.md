# Task 02 Evidence

## Scope

- Shell renders a slot-local recovery action when a child-slot dispatch fails.
- A missing World Info slot is isolated to that slot; the shell navigation and composer input remain available.
- Chat walkthrough waits for either the React shell entry or a visible legacy opener so asynchronous shell-bundle mounting cannot select a hidden fallback control.

## Red-Green

- Red: `bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js --workers=1 -g 'isolates a missing child-slot failure'`
  - Result: the failure injection reached local recovery, but the test incorrectly required `#send_but` to be visible with no active chat.
- Green: the assertion now checks the always-reachable composer input, and the focused failure-injection test passed.
- Regression reproduction: `bun run --cwd tests test:e2e -- chat-message-list-walkthrough.e2e.js --workers=1`
  - Result before fix: the walkthrough selected a hidden legacy Character Management opener before the React shell bundle mounted.
- Guard: `workspace-react-panel-flags.test.js` now requires the chat walkthrough to enable shell proof flags, and its helper waits for a visible valid entry point.

## Verification

- `bun run --cwd tests test:unit -- workspace-react-panel-flags.test.js --runInBand`
  - Result: 5 tests passed.
- `bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js --workers=1 -g 'isolates a missing child-slot failure'`
  - Result: 1 test passed.
- `bun run --cwd tests test:e2e -- chat-message-list-walkthrough.e2e.js --workers=1`
  - Result: 4 tests passed, including mobile load-more and reading-position restore.

## Boundary

The browser runner still reports missing seeded user-avatar thumbnail files. The walkthrough classifies those as expected environmental console noise; they did not fail the test or affect shell, chat, or composer reachability.
