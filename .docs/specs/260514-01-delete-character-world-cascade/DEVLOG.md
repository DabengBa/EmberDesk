# Delete Character — World Info Cascade

## Why

Deleting a character card left its associated world info files orphaned on disk. Users had no indication that a character referenced a world info file, and no in-flow option to clean it up. This was especially problematic for shared world infos — deleting one character could silently break the world info binding for other characters still using it.

The goal was to surface world info dependencies at delete time and let the user decide whether to cascade the deletion.

## Delivered

### Backend: Pre-flight query

- Added `findCharactersBoundToWorld()` to `src/endpoints/character-index.js` — queries the SQLite character index for all characters whose `source_world_name` matches a given world name, returning `{ avatar, name }` pairs.
- Added `POST /api/characters/delete-preflight` to `src/endpoints/characters.js` — accepts `{ avatars: string[] }`, reads each character's `extensions.world`, and returns structured metadata: world name, entry count, bound character list, and which avatars are being deleted.

### Backend: Cascade delete endpoint

- Added `POST /api/worldinfo/delete-cascade` to `src/endpoints/worldinfo.js` — accepts `{ worlds: string[], clear_references: boolean }`. For each world: optionally clears `extensions.world` in all bound characters (via character card read/write), then deletes the world JSON file from disk. Calls `invalidateDirectory` once after all deletions.

### Frontend: Cascade dialog module

- Added `public/scripts/world-cascade-dialog.js` — exports `buildCascadeSectionHtml(worldInfos)` and `captureCascadeChoices()` as reusable primitives, plus `showWorldInfoCascadeDialog(worldInfos)` as a standalone fallback for callers that cannot embed the section (e.g. BulkEditOverlay).
- All strings localized via `t` tagged template.

### Frontend: Delete flow integration

- The "Delete the character?" confirmation dialog now includes the world info section inline. Preflight runs before the dialog; if world infos exist, checkboxes and warnings appear below the chat-deletion checkbox in the same popup.
- `deleteCharacter()` accepts optional `deleteWorlds`/`clearWorldReferences` options from the caller, skipping its own internal preflight when provided.
- Batch (multi-select) delete sends all avatars in a single preflight call and shows a unified dialog — cascade is independent of character ordering.

### Frontend: Delete discoverability

- Added "Delete Character" option to the `#char-management-dropdown` ("More..." menu) in the character editor toolbar, triggering the same delete flow as the skull icon button.

### Cleanup

- Removed stale `delete_worlds`/`clear_world_references` handling from `/api/characters/delete` — cascade is now handled by the dedicated worldinfo endpoint.
- Removed dead `clearWorldReferencesInCharacters()` function and unused `invalidateDirectory` import from `characters.js`.

## Validation

### Static validation

- `node --check src/endpoints/worldinfo.js` — pass
- `node --check src/endpoints/characters.js` — pass

### Manual E2E

- Single delete: character with `extensions.world` set → cascade dialog appears → selecting delete removes world file.
- Batch delete: two characters with different world bindings → single unified dialog with both worlds listed.
- Shared world: character bound to a world used by 3 others → warning shows "3 other character(s) are still using this world info."
- Cancel: dialog cancel aborts entire deletion, no files changed.
- Preflight failure: if preflight API fails, deletion proceeds without cascade dialog (graceful degradation).

## Review Fixes

- **P0:** Imported `t` from `./i18n.js` instead of `../script.js` — `script.js` imports `t` but does not re-export it, causing ES module instantiation failure on page load.
- **P1:** Captured cascade checkbox values in `Popup.onClosing` handler — `callGenericPopup` resolves after the popup DOM is removed, so post-close `document.querySelectorAll` always found zero checkboxes.
- **P1:** Parsed `readCharacterData()` return value before accessing `data.extensions.world` — the function returns a raw JSON string, not a parsed object.
- **P1:** Used `parse(cardPath)` (async, returns JSON string) and `write(imageBuffer, jsonString)` correctly in the cascade endpoint — previous code passed a buffer to `parse` and a card object to `write`, neither of which matches the API contract.

## Result

Deleting a character now shows a single confirmation dialog that includes world info disclosure inline: linked world info files with entry counts, bound character counts, and warnings for shared worlds. The user controls whether to delete world files and whether to clear references in remaining characters, all in one step. Embedded `character_book` content is never touched. The delete action is also accessible from the "More..." dropdown menu.

## Residual Boundaries

- World info files not referenced via `extensions.world` (i.e., only embedded as `character_book`) are not surfaced by the preflight — they have no external file to cascade.
- The character index `source_world_name` column is not immediately refreshed after clearing references; it self-corrects on the next full index rebuild.
- Group chat world bindings are not in scope.

## Documentation

- Updated `.docs/db/features/character-delete.md` with cascade dialog flow and batch behavior.

## Doc ID Contract

- Interaction ID `feature.character_delete.world_cascade` added to the character-delete feature doc.
