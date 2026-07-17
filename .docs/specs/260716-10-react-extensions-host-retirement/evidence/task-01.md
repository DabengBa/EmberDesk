# Task 01 Evidence — Extension lifecycle/operations/Extras services

## Commands
- Red: `bun run --cwd tests test:unit -- extension-host-service.test.js --runInBand` (failed: missing domain/service modules and barrel wiring)
- Green: `bun run --cwd tests test:unit -- extension-host-service.test.js extension-operation-safety.test.js extension-repo-update-state.test.js react-workspace-panels-helpers.test.js --runInBand`

## Result
- PASS 53 tests across new host service suite + plan-listed unit surfaces
- New modules:
  - `public/scripts/extension-host-domain.js` pure activation/error/author/sort helpers
  - `public/scripts/extension-host-service.js` DOM-free session (discover/activate/install/update/delete/enable/disable/Extras)
- `public/scripts/extensions.js` imports domain/service, creates `createExtensionHostSession`, reuses `parseExtensionOperationErrorBody` / `evaluateExtensionActivation` / `buildExtensionOperationFailureFeedback`, exports `getExtensionHostSession()`

## PM
- Discovery/activation planning fixtures: dependency order, missing modules, enable/disable settings mutation
- Update failure fixture returns structured `user_action_required` / `dirty-worktree` without mutating worktree
- Install success path calls install hook; Extras connect loads modules and marks connected
- Existing operation-safety + React Extensions Host helper source contracts remain green

## Summary
Task 1 extracts framework-neutral extension host domain helpers and a stateful session. Legacy drawer DOM, jQuery control binding, Manage popup rendering, and React bridge helpers remain in the barrel for now; React can consume the session/snapshot without treating drawer nodes as lifecycle authority.
