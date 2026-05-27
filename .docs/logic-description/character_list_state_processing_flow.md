# Character List State Processing Flow

## Metadata

- Owner: character list state documentation
- Current code binding:
  - `public/scripts/character-list-state.js`
  - `public/scripts/character-list-render-state.js`
  - `public/script.js`
- Related tech doc: [.docs/tech/interaction-performance-indexing.md](../tech/interaction-performance-indexing.md)
- Related semantic docs:
  - [.docs/db/features/character-library-panel.md](../db/features/character-library-panel.md)
  - [.docs/db/features/character-delete.md](../db/features/character-delete.md)

## Goals And Non-Goals

Goals:

- Document the current client-side rules for resolving character delete targets, ordinary current-page reconcile planning, delete-reconcile repaint suppression, incremental delete planning, edit-refresh eligibility, and bulk-selection UI state.
- Make the "deleted card must not be refreshed by a stale edit response" rule reproducible without production code.
- Record the mutation boundary for the in-memory `characters` array and the DOM synchronization boundary for visible bulk-selection plus ordinary-page and post-delete row updates.

Non-goals:

- Describe server-side character deletion or card-file storage.
- Replace the interaction performance index tech doc.
- Model all UI refresh paths in `public/script.js`.

## Input Discovery And Parsing Rules

The character list state helpers operate on the in-memory `characters` array used by the main workspace.

Inputs:

- `characters`: an array of objects that may contain an `avatar` string.
- `characterIds`: numeric UI indexes that need conversion into stable avatar keys.
- `avatars`: stable avatar keys from delete flows.
- `deletedAvatars`: stable avatar keys already accepted by a delete flow.
- `avatar`: the submitted `avatar_url` returned from a character edit form.
- `beforeSnapshot`: a character-list entity snapshot captured before local delete removal.
- `beforePageEntities`: the entity slice that was mounted for the previously visible page.
- `afterSnapshot`: a character-list entity snapshot captured after local delete removal and group refresh.
- `pageEntities`: the entity slice for the next visible page render.
- `currentPage`: the currently visible character-library page.
- `pageSize`: the active character-library page size.
- `totalCharacters`, `totalGroups`: current totals used to derive hidden-count state for the visible page.
- `includeBackBlock`: whether the current page should render the bogus-folder back block instead of a normal incremental page update.
- `hasActiveFilter`, `isBulkEdit`, `isBogusFolderOpen`, `isPrintPending`: booleans describing list states where incremental delete reconcile must degrade to a full refresh.
- `isCharacterDeleteReconcileInProgress`: whether the delete flow is inside its reconcile suppression window.
- `startedAtGeneration`: the delete-reconcile generation observed when a non-full `printCharacters(false)` call began.
- `currentGeneration`: the latest delete-reconcile generation.
- `deleteButton`: the bulk-delete action element, when the character list is in bulk-select mode.
- `selectedCount`: the visible bulk-selection count element, when bulk-select controls are mounted.
- `fallbackFocusElement`: an optional focus target used when a disabled delete button currently owns focus.
- `container`: the character-list DOM container that exposes currently visible character rows.
- `selectedCharacterIds`: numeric character ids held in the bulk-selection model.

Valid avatar keys are non-empty strings. Missing values, empty strings, and non-string values are ignored by key-resolution and refresh-eligibility rules.

## Outputs

The processing outputs are:

- `resolvedAvatars`: stable avatar keys derived from current numeric indexes.
- `deleteCandidates`: avatar-key delete targets with the current local character object and index when present.
- `removedCharacters`: character objects removed from the local array.
- `deleteReprintSuppressionState`: whether a non-full character-list print is suppressed because a delete reconcile is active or because the print started before the latest reconcile generation.
- `pageReconcilePlan`: either an incremental ordinary-page patch plan or a named full-render fallback reason.
- `deleteReconcilePlan`: either an incremental current-page patch plan or a named full-refresh fallback reason.
- `shouldRefreshAfterEdit`: boolean decision controlling whether edit completion may call `getOneCharacter(avatar)`.
- `bulkDeleteButtonState`: class, ARIA, tab order, and focus state for the bulk-delete action.
- `bulkSelectionCountState`: compact visible count text plus full title and ARIA label for the selected-count status.
- `visibleBulkSelectionDomState`: per-visible-row selected class, `aria-selected`, checkbox checked state, and visible selected count.

## Staged Processing Flow

### Resolve selected IDs

1. Read each requested numeric id from the current `characters` array.
2. Keep only non-empty string avatar values.
3. Return those avatars as stable keys.

### Resolve delete candidates

1. Read each requested avatar key.
2. Keep only non-empty string avatar values.
3. For each key, find its current index in the local `characters` array.
4. Return a candidate with:
   - the avatar key
   - the character object when still present, otherwise `null`
   - the index when still present, otherwise `-1`

Delete candidates intentionally preserve explicit avatar keys even when the local row is already absent. This lets a delete request stay keyed by stable avatar file names instead of unstable UI indexes.

### Remove characters from local state

1. Build a set of avatar keys to remove.
2. Walk the `characters` array from the end to the beginning.
3. Splice out any character whose `avatar` is in the removal set.
4. Preserve removed-character output order by unshifting removed rows.

### Suppress stale non-full character-list prints during delete reconcile

1. `deleteCharacter()` cancels `saveCharacterDebounced` before resolving delete candidates.
2. After any temporary-chat confirmation, `deleteCharacter()` sets `isCharacterDeleteReconcileInProgress = true` before calling `closeCurrentChatForDelete()`.
3. `closeCurrentChatForDelete()` keeps the generation guard: if message generation is active, it shows the stop-generation notice and returns `false` without clearing chat state.
4. Non-full `printCharacters(false)` captures the current `characterDeleteReconcileGeneration` at start.
5. A non-full print returns without rendering when either:
   - `isCharacterDeleteReconcileInProgress` is true, or
   - the print's captured generation is lower than the current generation.
6. The pagination callback repeats the same suppression check before rendering a page.
7. In `finally`, `deleteCharacter()` sets `isCharacterDeleteReconcileInProgress = false` and increments `characterDeleteReconcileGeneration`.

Full refreshes remain allowed because they are the explicit correctness fallback.

### Plan ordinary current-page reconcile

1. Reject back-block renders up front; return fallback reason `back-block`.
2. Require `beforePageEntities`, `pageEntities`, and `afterSnapshot`; otherwise return fallback reason `missing-entity-data`.
3. Derive stable render keys for the mounted visible page, the full after snapshot, and the next visible page using the internal entity-key helper.
4. If any of those key lists contain duplicates, return fallback reason `duplicate-entity-key`.
5. Build an incremental plan containing:
   - `orderedKeys`
   - `reusedKeys`
   - `insertedKeys`
   - `removedKeys`
   - `renderPlan`
   - `requiresIdentitySync: true`
   - `paginationLabel`
   - `currentPage`
   - `pageSize`
6. `public/script.js` accepts that plan only when `fullRefresh` was not explicitly requested and the plan mode is still incremental.
7. Accepted ordinary-page reconcile reuses existing character/group/tag row DOM nodes where possible, creates only missing visible rows from the render plan, removes stale children, appends desired children in the new order, rewrites visible character row identity attributes, localizes pagination, and emits `CHARACTER_PAGE_LOADED`.

### Plan ordinary single-delete reconcile

1. Accept only exactly one `deletedAvatars` entry; otherwise return fallback reason `multi-delete`.
2. Return fallback for active search/tag filters, bulk edit mode, bogus-folder drilldown, or a pending list print.
3. Convert the deleted avatar into the internal render key `character:<avatar>`.
4. Return fallback if the deleted key is missing from `beforeSnapshot`.
5. Return fallback if the deleted key is still present in `afterSnapshot`.
6. Clamp the requested page into the valid page range after deletion.
7. Slice `afterSnapshot.entities` for the current page and build an incremental plan containing:
   - `deletedKeys`
   - `pageEntities`
   - `requiresIdentitySync: true`
   - `paginationLabel`
   - `currentPage`
   - `pageSize`
8. `public/script.js` accepts the incremental plan only when the plan page still equals the currently mounted page. If the page would clamp to another page, the UI uses the full-refresh fallback instead.
9. Accepted incremental reconcile now feeds the shared page-update helper: it builds the current page render plan, reuses existing visible DOM nodes where possible, creates missing visible rows, removes stale children, appends desired children in order, then rewrites visible character row identity attributes.

### Decide whether edit completion may refresh

1. Reject the submitted avatar when it is not a non-empty string.
2. Check whether the avatar still exists in the current `characters` array.
3. Return `true` only when the avatar is still present.

This prevents a stale edit response from calling `getOneCharacter()` after a delete has already removed that row locally.

### Update bulk delete affordance

1. If the delete button is absent, return without side effects.
2. Treat `hasSelection === false` as disabled.
3. Toggle the `disabled` CSS class to match the disabled state.
4. Set `aria-disabled` to `"true"` or `"false"`.
5. When disabled, set `tabindex="-1"`.
6. If the disabled delete button currently owns focus, blur it and focus `fallbackFocusElement` when provided.
7. When enabled, set `tabindex="0"` so keyboard users can reach the action.

### Update bulk selection count

1. Update the bulk delete affordance using `count > 0`.
2. If the selected-count element is absent, return after updating the delete affordance.
3. Set the visible text to a compact locale-aware label:
   - `"N sel"` for default/non-Chinese locales
   - `"N个"` for Chinese locales
4. Set both `title` and `aria-label` to `"N characters selected"`.

### Sync visible bulk-selection rows

1. If the character-list container is absent, return `0`.
2. Convert `selectedCharacterIds` into a numeric set.
3. Iterate the currently visible rows returned by `container.getElementsByClassName(characterClass)`.
4. Read each row's numeric `data-chid` value.
5. Toggle the selected class and set `aria-selected` according to membership in the selected-id set.
6. If the row has a bulk-select checkbox, set `checked` to the same selected state.
7. Return the number of visible rows restored as selected.

Hidden rows that are not currently returned by the container remain selected in the model only; they do not contribute to the visible selected count until they are rendered again.

## Key Rules

- Stable avatar keys are preferred over numeric UI indexes once a destructive flow begins.
- Local removal mutates the `characters` array in place.
- Delete-candidate resolution preserves absent avatar keys so delete flows can remain idempotent across partial local state changes.
- During `deleteCharacter()`, the delete-reconcile suppression window begins before chat-closing and menu-switch side effects can request a stale non-full character-list repaint.
- Non-full character-list prints and pagination callbacks that started before the latest completed delete reconcile are suppressed; explicit full-refresh fallback is not suppressed.
- Ordinary current-page reconcile is available for safe sort/search/filter/pagination/page-size updates, but back-block renders, missing entity arrays, duplicate visible keys, or explicit `fullRefresh` requests keep the existing full-render path.
- Ordinary incremental delete reconcile is limited to a single deleted avatar in an unfiltered, non-bulk, non-bogus-folder state with a stable current page.
- Incremental reconcile rewrites visible row identity after indexes shift, preserving the DOM contract for `data-chid`, legacy `chid`, and `CharID${chid}`.
- Edit completion must not refresh a character that has already been removed locally.
- `deleteCharacter()` cancels the pending debounced save before resolving delete candidates, so a queued edit submit cannot race the delete path.
- Bulk delete must be disabled and removed from tab order until at least one visible or model-selected character is selected.
- Visible bulk-selection count stays intentionally compact in the toolbar while title and ARIA label preserve the full `"N characters selected"` wording.
- Disabling a focused bulk-delete button must move focus to the provided fallback so keyboard focus is not left on an unavailable action.
- Visible character rows are synchronized from the selection model after sorting, filtering, pagination, or redraws; hidden selected rows remain in the model but are not marked in absent DOM.

## Output Schema

```json
{
  "resolvedAvatars": ["alpha.png"],
  "deleteCandidates": [
    { "avatar": "beta.png", "character": null, "index": -1 }
  ],
  "removedCharacters": [
    { "avatar": "beta.png", "name": "Beta" }
  ],
  "deleteReprintSuppressionState": {
    "inProgressSuppressed": true,
    "staleGenerationSuppressed": true,
    "currentGenerationSuppressed": false
  },
  "pageReconcilePlan": {
    "mode": "incremental",
    "orderedKeys": ["character:gamma.png", "character:alpha.png", "character:delta.png"],
    "reusedKeys": ["character:gamma.png", "character:alpha.png"],
    "insertedKeys": ["character:delta.png"],
    "removedKeys": ["character:beta.png"],
    "renderPlan": {
      "includeBackBlock": false,
      "displayCount": 3,
      "hiddenCount": 0,
      "showEmptyBlock": false,
      "showHiddenBlock": false
    },
    "requiresIdentitySync": true,
    "paginationLabel": "1-3 / 3",
    "currentPage": 1,
    "pageSize": 3
  },
  "deleteReconcilePlan": {
    "mode": "incremental",
    "deletedKeys": ["character:beta.png"],
    "pageEntities": [
      { "type": "character", "id": 0, "renderKey": "character:alpha.png" },
      { "type": "character", "id": 1, "renderKey": "character:gamma.png" }
    ],
    "requiresIdentitySync": true,
    "paginationLabel": "1-2 / 2",
    "currentPage": 1,
    "pageSize": 2
  },
  "shouldRefreshAfterEdit": false,
  "bulkDeleteButtonState": {
    "classDisabled": true,
    "ariaDisabled": "true",
    "tabindex": "-1",
    "blurred": true,
    "fallbackFocused": true
  },
  "bulkSelectionCountState": {
    "text": "2 sel",
    "title": "2 characters selected",
    "ariaLabel": "2 characters selected"
  },
  "visibleBulkSelectionDomState": {
    "visibleSelectedCount": 2,
    "rows": [
      { "dataChid": 0, "selected": true, "ariaSelected": "true", "checkboxChecked": true },
      { "dataChid": 1, "selected": false, "ariaSelected": "false", "checkboxChecked": false }
    ]
  }
}
```

## Sandbox Verification

Run:

```powershell
uv run python .docs/logic-description/character_list_state_sandbox_proof.py
```

The proof script embeds fake character arrays, fake entity snapshots, and fake DOM elements. It verifies stable-id resolution, delete-candidate preservation, in-place removal, ordinary page-reconcile planning and fallback reasons, delete-reconcile suppression gates, incremental delete planning and fallback reasons, edit-refresh suppression after local deletion, compact selected-count text plus full ARIA labels, and visible-row synchronization from the bulk-selection model.

## Boundaries And Failure Modes

- If an avatar is empty or not a string, helpers ignore it rather than manufacturing a key.
- If a delete candidate is already absent locally, the candidate keeps `character: null` and `index: -1`; downstream delete code still owns server-side behavior.
- If generation is in progress, delete preflight returns without running destructive cleanup.
- If a non-full character-list print starts during delete reconcile or before the latest reconcile generation completes, it returns without rendering; callers that require correctness must request full refresh.
- If an ordinary current-page reconcile sees a back block, missing entity data, or duplicate visible keys, it returns a fallback reason and the UI uses the existing full render path instead.
- If an incremental delete plan sees multiple deleted avatars, active filters, bulk edit mode, bogus-folder drilldown, pending prints, a missing before-delete key, or a still-present after-delete key, it returns a fallback reason.
- If an accepted plan would clamp the page away from the mounted page, the UI falls back to full refresh.
- If an edit response has no valid avatar key, refresh is skipped.
- If local state is stale in the opposite direction and still contains the avatar, `shouldRefreshAfterEdit()` returns `true`; server/file authority is still handled by `getOneCharacter()` and the character APIs.
- If the bulk delete button or selected-count element is absent, the state helpers return without throwing so partially mounted controls can degrade safely.
- If the character-list container is absent, visible bulk-selection synchronization returns `0` and leaves the selection model untouched.
- If a visible row has no checkbox, the row class and `aria-selected` state are still synchronized; checkbox state is skipped for that row.
