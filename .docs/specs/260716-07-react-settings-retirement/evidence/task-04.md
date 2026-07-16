# Task 04 Evidence — flags / fallback / legacy entry retirement

## Summary
Settings is sole React owner for product navigation. Feature flag and `/settings -> /` fallback are removed. Workspace shell Settings / AI Config / Formatting entries always navigate to `/settings` (with tab query for providers/advanced). Missing build returns HTTP 503 with rebuild instructions instead of opening legacy drawers.

## Changes
- `src/react-settings-feature.js`: always enabled
- `src/users.js`: settings middleware serves React build or 503; no redirect-to-workspace fallback
- `public/script.js` + workspace feature bootstrap: settings page always true; shell actions assign `/settings` (+ tab)
- `default/config.yaml` / local `config.yaml`: pages.settings flag removed
- Tests/E2E updated for sole-owner navigation and 503 missing-build path
- `settings.tsx` honors `?tab=` for deep links from shell

## Intentionally retained
Legacy drawer DOM hosts in `public/index.html` remain for workspace boot/extension mount compatibility; they are no longer product entry points from shell chrome.

## Proof
```
settings-react-route / react-workspace-panels-helpers / chat-workspace-structure / workspace-react-panel-flags
# PASS 60 tests
```
