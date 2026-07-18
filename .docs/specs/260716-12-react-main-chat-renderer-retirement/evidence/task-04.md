# Task 04 Evidence — React owns long-chat windowing & restore

## Summary

React is now the sole long-chat windowing owner:

- `buildMainChatWindowingContract` reports `loadMoreOwner: 'react'` (no legacy facade).
- Load-earlier implementation is `loadEarlierChatMessages()`; `showMoreMessages()` is a thin compatibility alias.
- Bridge actions: `loadMoreMessages` (user load-more) and `loadMoreUntilMessage` (restore expansion).
- `MainChatShowMoreOwnerPortal` owns `#show_more_messages` clicks via capture-phase listener + React bridge.
- Restore controller remains React-owned (`MainChatMessageListRestoreController` + TanStack Virtual).

## TDD notes

- RED: descriptor tests expected legacy load-more facade.
- GREEN: React sole owner contract + ShowMore portal + bridge action + E2E long-chat suites.

## Commands

```bash
bun run --cwd tests test:unit -- chat-message-render-descriptor.test.js react-workspace-panels-helpers.test.js --runInBand
bun run build:react:workspace-panels
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-list-walkthrough.e2e.js --workers=1
node scripts/interaction-performance-runner.mjs --profile small --scenario main_chat_long_load_more --repeats 1 --pairs 1 --variant a
```

## Result

- unit: 41 passed
- workspace-panels build: success
- walkthrough E2E: 3 passed, 1 skipped
- rendering E2E: 3 passed, 2 skipped (mobile load-more fixed to use element-owned click when drawers intercept hit-target)
- focused perf `main_chat_long_load_more` (small): report written under `artifacts/interaction-perf/`

## Artifacts

- `public/scripts/chat-message-render-descriptor.js`
- `public/script.js` (`loadEarlierChatMessages`, bridge actions)
- `app/workspace-panels.tsx` (`MainChatShowMoreOwnerPortal`)
- `tests/chat-message-render-descriptor.test.js`
- `tests/react-workspace-panels-helpers.test.js`
- `tests/chat-message-rendering.e2e.js` (mobile action click robustness)
