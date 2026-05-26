# Character List State Processing Flow

## Metadata

- Owner: character list state documentation
- Current code binding: `public/scripts/character-list-state.js`
- Related tech doc: [.docs/tech/interaction-performance-indexing.md](../tech/interaction-performance-indexing.md)
- Related semantic docs:
  - [.docs/db/features/character-library-panel.md](../db/features/character-library-panel.md)
  - [.docs/db/features/character-delete.md](../db/features/character-delete.md)

## Goals And Non-Goals

Goals:

- Document the current client-side rules for resolving character delete targets, edit-refresh eligibility, and bulk-selection UI state.
- Make the "deleted card must not be refreshed by a stale edit response" rule reproducible without production code.
- Record the mutation boundary for the in-memory `characters` array and the DOM synchronization boundary for visible bulk-selection rows.

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
- `avatar`: the submitted `avatar_url` returned from a character edit form.
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
- `shouldRefreshAfterEdit`: boolean decision controlling whether edit completion may call `getOneCharacter(avatar)`.
- `bulkDeleteButtonState`: class, ARIA, tab order, and focus state for the bulk-delete action.
- `bulkSelectionCountState`: visible count text plus title and ARIA label for the selected-count status.
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
3. Set the visible text to `"N selected"`.
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
- Edit completion must not refresh a character that has already been removed locally.
- `deleteCharacter()` cancels the pending debounced save before resolving delete candidates, so a queued edit submit cannot race the delete path.
- Bulk delete must be disabled and removed from tab order until at least one visible or model-selected character is selected.
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
  "shouldRefreshAfterEdit": false,
  "bulkDeleteButtonState": {
    "classDisabled": true,
    "ariaDisabled": "true",
    "tabindex": "-1",
    "blurred": true,
    "fallbackFocused": true
  },
  "bulkSelectionCountState": {
    "text": "2 selected",
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

The proof script embeds fake character arrays and fake DOM elements. It verifies stable-id resolution, delete-candidate preservation, in-place removal, edit-refresh suppression after local deletion, bulk delete button disabled/enabled state, selected-count text and ARIA labels, and visible-row synchronization from the bulk-selection model.

## Boundaries And Failure Modes

- If an avatar is empty or not a string, helpers ignore it rather than manufacturing a key.
- If a delete candidate is already absent locally, the candidate keeps `character: null` and `index: -1`; downstream delete code still owns server-side behavior.
- If an edit response has no valid avatar key, refresh is skipped.
- If local state is stale in the opposite direction and still contains the avatar, `shouldRefreshAfterEdit()` returns `true`; server/file authority is still handled by `getOneCharacter()` and the character APIs.
- If the bulk delete button or selected-count element is absent, the state helpers return without throwing so partially mounted controls can degrade safely.
- If the character-list container is absent, visible bulk-selection synchronization returns `0` and leaves the selection model untouched.
- If a visible row has no checkbox, the row class and `aria-selected` state are still synchronized; checkbox state is skipped for that row.
