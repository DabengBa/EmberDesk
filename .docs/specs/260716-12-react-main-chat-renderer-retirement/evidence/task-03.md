# Task 03 Evidence — Extension mutation zones + runtime compatibility

## Summary

React rich-body ownership now exposes stable imperative mutation-zone hosts on protected body wrappers (`.mes_text`, `.mes_reasoning`, media/file/bias) via `data-main-chat-mutation-zone*`. Extension-mutated / streaming / editing content is preserved:

1. Snapshot `preserveLiveContent` skips HTML overwrite for non-finalized families.
2. Live re-check for `.TH-render`, `.TH-streaming`, `.mes_streaming`, and edit textareas blocks overwrite even if a stale finalized snapshot arrives.
3. Compatibility contract entry `message-row-and-extension-mutation` points at the React mutation-zone host contract.

## TDD notes

- Behavior extension of Task 2 preserve-live path.
- Helpers tests assert mutation-zone host markers and live extension mutation guards.
- Runtime proof via existing third-party extension + streaming E2E suites.

## Commands

```bash
bun run test:compat
bun run --cwd tests test:unit -- chat-message-render-descriptor.test.js react-workspace-panels-helpers.test.js third-party-extension-compatibility.test.js --runInBand
bun run build:react:workspace-panels
bun run --cwd tests test:e2e -- third-party-extension-runtime.e2e.js chat-message-streaming.e2e.js --workers=1
```

## Result

- `test:compat`: 12 passed
- focused unit: 53 passed
- workspace-panels build: success
- E2E: 18 passed, 4 skipped

## Artifacts

- `app/workspace-panels.tsx` (`MainChatRichBodyOwnerPortal` mutation zones + live guard)
- `tests/react-workspace-panels-helpers.test.js`
- `tests/helpers/frontend-compatibility-contract.js`
