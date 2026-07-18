# Task 03 Evidence - Shared UI and automation command boundary

## Summary

React composer and message actions dispatch `triggerVisibleGeneration` commands directly. Public automation adapters retain their existing APIs and converge through `Generate()` and the same command/lifecycle path; React no longer executes prepared request closures.

## Commands

```bash
bun run test:compat
bun run build:react:workspace-panels
EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST=true bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js --workers=1 --grep "visible composer owner serializes|visible composer dispatches|visible continue dispatches|visible regenerate dispatches"
```

## Result

- Compatibility validation passed.
- Workspace-panel React build passed.
- The React-flag command matrix passed: 4 tests.
- The browser proof confirms composer/continue/regenerate dispatch and stable streaming-row behavior without a React transport executor.

## Artifacts

- `app/workspace-panels.tsx`
- `public/script.js`
- `tests/chat-message-streaming.e2e.js`
