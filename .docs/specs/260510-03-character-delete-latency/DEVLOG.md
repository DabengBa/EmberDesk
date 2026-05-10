# Character Delete Latency

## Why

This slice targets one specific interaction bottleneck in EmberDesk's character library:

- deleting a character could block for more than a second before the delete request even started
- the main cause was the delete flow calling the full `closeCurrentChat()` path
- that path synchronously emitted `CHAT_CHANGED`, which pulled the welcome screen and recent-chat hydration work into the delete request hot path

The goal of this slice was narrow: keep the real safety guards for delete, but stop paying unrelated chat-transition work before the delete request.

## Delivered

### Delete-specific close preflight

- Added `public/scripts/delete-character-preflight.js`.
- Introduced `runDeleteCharacterClosePreflight(...)` as a delete-only helper that:
  - blocks when generation is still running
  - waits for in-flight chat save completion
  - clears the current chat state
  - resets group and character selection state
  - reselects the characters view
- The helper intentionally does not emit the normal pre-delete `CHAT_CHANGED` transition.

### Delete flow integration

- `public/script.js` now routes `deleteCharacter()` through `closeCurrentChatForDelete()` instead of the full `closeCurrentChat()`.
- The existing delete request, optional chat-file deletion notifications, and post-delete refresh flow remain in place.
- This keeps the behavior change tightly scoped to character deletion instead of rewriting the shared chat-close flow for every caller.

### Regression proof

- Added `tests/interaction-performance-delete.test.js`.
- Covered:
  - generation-in-progress refusal
  - pending-save wait and cleanup order
  - propagation of save-wait failure
  - absence of any required pre-delete transition work in the helper path

### Runtime measurement

- Reused the existing interaction performance runner to measure the large-profile SQLite-on delete scenario.
- Added delete-flow timing markers in `public/script.js` so the runner can capture:
  - `deleteFlowMs`
  - `deleteRequestMs`
  - `preDeleteChatLookupMs`
  - `groupsRefreshMs`
  - `characterPrintMs`

## Validation

### Automated proof

- `cd tests && npm run test:unit -- interaction-performance-delete.test.js --runInBand`
  - Result: `PASS ./interaction-performance-delete.test.js` on `2026-05-11`

### Static validation

- `npx eslint public/script.js public/scripts/delete-character-preflight.js tests/interaction-performance-delete.test.js`
  - Result: no reported errors on `2026-05-11`

### Browser-driven validation

- `npm run perf:interaction -- --profile large --scenario character_delete_refresh_ui --variant sqlite_on_only --pairs 1 --repeats 1`
  - Artifact: `artifacts/interaction-perf/2026-05-10T21-28-04-028Z/`
  - Best warm-path sample: `deleteFlowMs=219.8`, `browserMs=237.6`
- `npm run perf:interaction -- --profile large --scenario character_delete_refresh_ui --variant sqlite_on_only --pairs 1 --repeats 3`
  - Artifact: `artifacts/interaction-perf/2026-05-10T21-44-12-262Z/`
  - Median rerun sample: `deleteFlowMs=973.1`, `browserMs=987.7`

## Result

This slice removes the old pre-delete synchronous chat-transition work from the delete request path without changing the normal shared `closeCurrentChat()` contract for other flows.

The change is shipped as an internal delete-only preflight rather than a global event-system rewrite.

## Residual Boundaries

- This slice does not remove the post-delete UI refresh work that still happens inside `removeCharacterFromUI()`.
- Large-profile browser reruns still show a noticeable completion tail after the delete request succeeds.
- The next optimization target is the later post-delete work, especially the final `CHAT_CHANGED` path and any remaining heavy welcome-screen refresh it triggers.

## Documentation

- Updated `docs/interaction-performance.md`
- Updated `.docs/tech/interaction-performance-indexing.md`

## Doc ID Contract

- No semantic Doc IDs were introduced, renamed, or removed in this feature.
