# Processed Columns Lineage

## Scope And Ownership

This lineage index covers documentation-owned reference calculations under `.docs/logic-description/`. It is not a production schema and does not describe database columns.

Current owning flow:

- [Frontend Shared Library Boundary Processing Flow](frontend_shared_library_boundary_processing_flow.md)
- [Character List State Processing Flow](character_list_state_processing_flow.md)

## Per-Output Field Lineage

| Output field | Source input | Transformation | Failure / degradation behavior |
|---|---|---|---|
| `slideToggle` | `slidetoggle` namespace object | First available value from `toggle`, `default.toggle`, `slidetoggle.toggle`, `module.exports.toggle` | Missing or non-callable value fails the boundary proof and focused Jest test |
| `default.slideToggle` | selected `slideToggle` value | Same object reference is inserted into the default export map | Reference mismatch fails the focused Jest test |
| legacy global value | existing `window` object plus selected library values | Install only when the named global is absent | Existing global remains unchanged; missing globals are populated |
| `resolvedAvatars` | current `characters` array plus numeric UI ids | Keep non-empty string `avatar` values at requested indexes | Missing, empty, non-string, or out-of-range ids are ignored |
| `deleteCandidates` | current `characters` array plus requested avatar keys | Keep valid avatar keys and attach current local row/index when present | Absent local rows are preserved as `{ character: null, index: -1 }` so delete remains keyed by avatar |
| `removedCharacters` | current `characters` array plus removal avatar keys | Mutate the array in place from right to left and return removed rows in original order | Avatars not present locally remove nothing |
| `shouldRefreshAfterEdit` | current `characters` array plus submitted edit avatar | Return true only for a non-empty string avatar still present locally | Invalid or already-deleted avatars suppress the edit refresh |

## Maintenance Constraints

- Keep this lineage file aligned with `frontend_shared_library_boundary_processing_flow.md`.
- Add a new row when a documentation proof script starts producing a new named output.
- Do not use this file as a second implementation guide; detailed processing rules belong in the owning flow doc.
