# Task 02 Evidence — React rows cover lifecycle, actions, compatible DOM

## Summary

React is now the sole row lifecycle owner for finalized, editing, streaming, and extension-mutated rows when protected structure is present.

- `classifyChatMessageRendererContract` and `buildMainChatRowLifecycleContract` no longer fail closed to legacy for editing/streaming/extension-mutated rows.
- Bridge snapshots publish `state` + `preserveLiveContent` so React can own the shell without overwriting live edit/stream/extension content.
- `MainChatRichBodyOwnerPortal` only writes rich-body HTML when `preserveLiveContent` is false; otherwise it only sets ownership markers.
- Row owner portal publishes `mainChatMessageRowState` / `mainChatMessageRowPreserveLive` markers for diagnostics and identity stability.

## TDD notes

- RED: existing descriptor tests expected legacy owners for editing/streaming/extension-mutated rows.
- GREEN: ownership contracts, bridge eligibility, React schema/portal preserve-live path, helpers tests, workspace-panels build.

## Commands

```bash
bun run --cwd tests test:unit -- chat-message-render-descriptor.test.js chat-message-actions-controller.test.js react-workspace-panels-helpers.test.js chat-message-render-service.test.js --runInBand
bun run build:react:workspace-panels
```

## Result

- 4 suites / 59 tests passed
- workspace-panels Vite build succeeded (`app/dist/assets/workspace-panels.js`)
- PM: editing/streaming/extension-mutated rows classify as React-owned with `preserveLiveContent: true`; finalized rows still overwrite HTML; actions controller unchanged and green

## Artifacts

- `public/scripts/chat-message-render-descriptor.js`
- `public/script.js` (eligibility + snapshot state)
- `app/workspace-panels.tsx` (schemas, portals, lifecycle defaults)
- `tests/chat-message-render-descriptor.test.js`
- `tests/react-workspace-panels-helpers.test.js`
