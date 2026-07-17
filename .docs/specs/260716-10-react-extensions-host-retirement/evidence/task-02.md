# Task 02 Evidence — React Host owns lifecycle and stable compatibility slots

## Commands
- Red: `bun run --cwd tests test:unit -- extension-host-service.test.js --runInBand` (failed: missing slot markers / React ownership wiring)
- Green: `bun run --cwd tests test:unit -- extension-host-service.test.js react-workspace-panels-helpers.test.js global-compatibility-bridge.test.js --runInBand`
- Build: `bun run build:react:workspace-panels`

## Result
- PASS 47 focused unit tests
- PASS Vite workspace-panels build (`app/dist/assets/workspace-panels.js`)
- New module: `public/scripts/extension-compatibility-slots.js` — stable slot IDs, same-owner re-ensure does not remount/wipe children
- `ensureExtensionCompatibilitySlots` exported from `public/scripts/extensions.js`
- React Extensions Host:
  - `legacyBoundary="react-owned-slots-lifecycle"`
  - claims slots via `ensureExtensionCompatibilitySlots` on mount
  - local retry for deferred failure (`retryDeferredExtensions`)
  - compatibility slot markers without duplicating protected IDs inside React JSX (avoids unmount destroying extension content)
- Bridge state prefers session deferred state when present; mount-point status comes from slot manager

## PM
- First open / re-open: slot manager generation stable for same owner; `#tavern_helper`-style children survive re-ensure
- Loading/error/retry: deferred failure surfaces recovery action that routes to `openExtensionsHostManager` (ensure deferred + manage)
- Existing Extensions Host helper source contracts remain green

## Summary
Task 2 makes the React Extensions Host the lifecycle owner for deferred load/retry and compatibility slot claiming. Protected mount IDs remain durable outside React JSX so close/reopen does not remount extension content; Task 4 still retires the legacy drawer host shell when ready.
