# React Character Library Sync Processing Flow

## Metadata

- Owner: React character-library sync documentation
- Current code binding:
  - `public/scripts/character-library-react-sync.js`
  - `public/script.js`
  - `app/components/character-library/CharacterLibraryPanel.tsx`
- Related tech doc: [.docs/tech/react-modernization-roadmap.md](../tech/react-modernization-roadmap.md)
- Related semantic docs:
  - [.docs/db/features/character-library-panel.md](../db/features/character-library-panel.md)
  - [.docs/db/pages/chat-workspace.md](../db/pages/chat-workspace.md)

## Goals And Non-Goals

Goals:

- Document the current bridge rules between the React character-library island and the legacy workspace `characters` array.
- Make the `/api/characters/all` success/error parsing rule reproducible without importing production code.
- Record why full character payload comparison is used before replacing the legacy array.

Non-goals:

- Re-document character-card storage, character-index caching, or server-side route assembly.
- Replace `tests/character-library-react-helpers.test.js`.
- Describe row virtualization, toolbar layout, or bulk-delete DOM reconciliation; those remain in the panel implementation and character-list state docs.

## Input Discovery And Parsing Rules

Inputs:

- `response`: the fetch response returned by `POST /api/characters/all`.
- `response.ok`, `response.status`, `response.statusText`, and `response.json()`: the observable response fields used by the parser.
- `currentCharacters`: the current legacy workspace `characters` array.
- `nextCharacters`: the normalized character array returned through the React Query bridge.
- `previousAvatar`: the active character avatar before sync starts, when one is selected.

`nextCharacters` is normalized by the existing workspace helper before comparison. This flow starts after that normalization boundary.

## Outputs

The processing outputs are:

- `characterLibraryFetchPayload`: the JSON body returned for a successful `/api/characters/all` response.
- `characterLibraryFetchError`: the failed fetch error shape with status, status text, and parsed response data.
- `characterLibraryFetchErrorData`: the parsed response `data` exposed from a character-library fetch error for legacy popup handling.
- `characterLibraryPayloadChanged`: boolean decision from comparing the current and next full character payloads.
- `characterLibrarySyncDecision`: whether the legacy `characters` array is replaced and whether active-avatar reselection is attempted.

## Staged Processing Flow

### Parse character-library fetch responses

1. If `response.ok` is true, return `response.json()`.
2. If `response.ok` is false, attempt to parse `response.json()`.
3. If the failed response body cannot be parsed as JSON, keep `data` as `null`.
4. Throw a character-library fetch error that carries `status`, `statusText`, and parsed `data`.
5. When callers need legacy popup behavior, expose only the parsed `error.data` from that error type.

### Compare React Query data with legacy state

1. Normalize the next character array through the existing workspace payload normalizer.
2. Serialize the current legacy `characters` array.
3. Serialize the next normalized array.
4. Treat the payload as unchanged only when the full serialized arrays are identical.
5. Treat any full-payload difference as changed, including changes outside the visible row summary fields.

### Sync changed payloads into the workspace

1. If the payload is unchanged, return without replacing the array.
2. Capture the active character avatar before replacing the array.
3. Replace the legacy `characters` array in place with the normalized next array.
4. If the previous active avatar still exists in the new array, update the active character id and reselect it without switching menus.
5. Refresh groups and reprint the character list through the existing workspace path.

## Key Rules

- Failed `/api/characters/all` responses must keep structured response data when the body is JSON, because the legacy overflow popup depends on `data.overflow`.
- Non-JSON failed responses degrade to `data: null` instead of hiding the original status and status text.
- Structured error data is exposed only for the character-library fetch error shape; unrelated errors do not pretend to be API payloads.
- Full payload comparison is intentional: changes to tags or other card metadata must not be ignored just because name, avatar, favorite state, and last-chat fields stayed the same.
- The legacy `characters` array is mutated in place so existing workspace references keep seeing the updated array object.
- Query-driven sync does not own the active-character-missing reload warning; the full `getCharacters()` path still owns that user-facing recovery.

## Output Schema

```json
{
  "characterLibraryFetchPayload": [
    { "avatar": "alpha.png", "name": "Alpha", "tags": ["old"] }
  ],
  "characterLibraryFetchError": {
    "status": 413,
    "statusText": "Payload Too Large",
    "data": { "overflow": true }
  },
  "characterLibraryFetchErrorData": { "overflow": true },
  "characterLibraryPayloadChanged": true,
  "characterLibrarySyncDecision": {
    "changed": true,
    "reselectedAvatar": "alpha.png",
    "refreshedGroups": true,
    "reprintedCharacters": true
  }
}
```

## Sandbox Verification

Run:

```bash
uv run python .docs/logic-description/react_character_library_sync_sandbox_proof.py
```

The proof script embeds fake fetch responses and fake character arrays. It verifies successful JSON payload return, structured overflow error shape and data preservation, non-JSON failure degradation, full-payload change detection for tag/metadata changes, identical-payload no-op detection, and the sync decision for a still-present active avatar.

## Boundaries And Failure Modes

- If `response.ok` is true but `response.json()` fails, the parser lets that failure surface; this is not treated as an API overflow response.
- If a failed response has no JSON body, the error still carries status and status text but exposes `data: null`.
- If a non-character-library exception is caught by the legacy caller, structured API data is unavailable and the overflow popup path does not run.
- If the next payload is identical after normalization, sync is skipped and no group refresh or list reprint is requested.
- If the active avatar is missing after query-driven sync, the sync still updates the array and list; the hard reload warning remains owned by the full `getCharacters()` recovery path.
