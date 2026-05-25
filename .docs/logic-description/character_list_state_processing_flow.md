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

- Document the current client-side rules for resolving character delete targets and edit-refresh eligibility.
- Make the "deleted card must not be refreshed by a stale edit response" rule reproducible without production code.
- Record the mutation boundary for the in-memory `characters` array.

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

Valid avatar keys are non-empty strings. Missing values, empty strings, and non-string values are ignored by key-resolution and refresh-eligibility rules.

## Outputs

The processing outputs are:

- `resolvedAvatars`: stable avatar keys derived from current numeric indexes.
- `deleteCandidates`: avatar-key delete targets with the current local character object and index when present.
- `removedCharacters`: character objects removed from the local array.
- `shouldRefreshAfterEdit`: boolean decision controlling whether edit completion may call `getOneCharacter(avatar)`.

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

## Key Rules

- Stable avatar keys are preferred over numeric UI indexes once a destructive flow begins.
- Local removal mutates the `characters` array in place.
- Delete-candidate resolution preserves absent avatar keys so delete flows can remain idempotent across partial local state changes.
- Edit completion must not refresh a character that has already been removed locally.
- `deleteCharacter()` cancels the pending debounced save before resolving delete candidates, so a queued edit submit cannot race the delete path.

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
  "shouldRefreshAfterEdit": false
}
```

## Sandbox Verification

Run:

```powershell
uv run python .docs/logic-description/character_list_state_sandbox_proof.py
```

The proof script embeds fake character arrays and verifies stable-id resolution, delete-candidate preservation, in-place removal, and edit-refresh suppression after local deletion.

## Boundaries And Failure Modes

- If an avatar is empty or not a string, helpers ignore it rather than manufacturing a key.
- If a delete candidate is already absent locally, the candidate keeps `character: null` and `index: -1`; downstream delete code still owns server-side behavior.
- If an edit response has no valid avatar key, refresh is skipped.
- If local state is stale in the opposite direction and still contains the avatar, `shouldRefreshAfterEdit()` returns `true`; server/file authority is still handled by `getOneCharacter()` and the character APIs.
