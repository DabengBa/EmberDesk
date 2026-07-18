# Task 05 Evidence — delete legacy renderer/windowing/flags + docs validation

## Summary

React Main Chat message list is now product sole-owner:

- `isReactMainChatMessageListPanelEnabled()` always returns `true` (product flag retired).
- Default config / bridge / shell fallbacks ship `mainChatMessageList: true`.
- Playwright always enables the main-chat panel env for e2e bootstrap compatibility.
- Descriptor unsupported rows report `rendererOwner: 'unsupported'` instead of a dual-path legacy owner.
- Semantic docs, ledger, project history, roadmap, and brief updated to sole-owner language.
- Compatibility aliases `printMessages` / `showMoreMessages` / `updateMessageElement` remain as thin adapters feeding React-owned rows and React load-earlier policy.
- E2E assertions updated: editing/streaming rows stay React-owned; mobile load-more uses element-owned click.

## Commands

```bash
bun run --cwd tests test:unit -- workspace-react-panel-flags.test.js react-workspace-panels-helpers.test.js chat-message-render-descriptor.test.js chat-message-render-service.test.js --runInBand
bun run test:compat
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-list-walkthrough.e2e.js chat-message-streaming.e2e.js --workers=1
bun run perf:interaction
bun run docs:check
```

## Result

- focused unit: 52 passed
- compat: 12 passed
- main-chat E2E suite: 34 passed
- interaction perf: report written at `artifacts/interaction-perf/2026-07-18T03-35-08-405Z/report.md`
- docs:check: 30 semantic docs validated

## Artifacts

- `src/workspace-react-features.js`
- `default/config.yaml`, `config.yaml`
- `public/script.js`, `public/scripts/workspace-panels-react-bridge.js`
- `public/scripts/chat-message-render-descriptor.js`
- `tests/helpers/workspace-react-playwright-flags.js`
- `tests/workspace-react-panel-flags.test.js`
- `tests/react-workspace-panels-helpers.test.js`
- `tests/chat-message-render-descriptor.test.js`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-streaming.e2e.js`
- `tests/chat-message-list-walkthrough.e2e.js`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
- `.docs/db/features/chat-generation-auto-recovery.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/tech/legacy-cutover-ledger.md`
- `.docs/project-overview.md`
- `.docs/PROJECT_HISTORY.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/briefs/260716-12-react-main-chat-renderer-retirement.md`
