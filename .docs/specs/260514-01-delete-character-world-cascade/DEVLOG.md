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

### Frontend: Cascade dialog

- Added `public/scripts/world-cascade-dialog.js` — exports `showWorldInfoCascadeDialog(worldInfos)` using the existing `callGenericPopup` API. Renders per-world checkboxes with entry counts, warns when other characters are still bound, and offers a global "clear references" checkbox. Returns `{ deleteWorlds, clearWorldReferences }` or `null` on cancel.

### Frontend: Delete flow integration

- Modified `deleteCharacter()` in `public/script.js` to call the preflight endpoint after `closeCurrentChatForDelete()`. If world infos are found, shows the cascade dialog. After all character deletions complete, makes a separate `POST /api/worldinfo/delete-cascade` call with the user's choices.
- Batch (multi-select) delete sends all avatars in a single preflight call and shows a unified dialog — cascade is independent of character ordering.

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

## Result

Deleting a character now shows a cascade dialog listing linked world info files with metadata (entry count, bound character count). Shared worlds display a warning. The user controls whether to delete world files and whether to clear references in remaining characters. Embedded `character_book` content is never touched.

## Residual Boundaries

- World info files not referenced via `extensions.world` (i.e., only embedded as `character_book`) are not surfaced by the preflight — they have no external file to cascade.
- The character index `source_world_name` column is not immediately refreshed after clearing references; it self-corrects on the next full index rebuild.
- Group chat world bindings are not in scope.

## Documentation

- Updated `.docs/db/features/character-delete.md` with cascade dialog flow and batch behavior.

## Doc ID Contract

- Interaction ID `feature.character_delete.world_cascade` added to the character-delete feature doc.
