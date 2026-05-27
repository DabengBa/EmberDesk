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
| `deleteReprintSuppressionState` | delete reconcile in-progress flag plus print-start/current generation counters | Suppress non-full list prints while delete reconcile is active or when the print started before the latest reconcile generation | Explicit full refresh remains the correctness fallback and is not suppressed |
| `pageReconcilePlan` | mounted visible page entities, after-snapshot entity keys, next page entities, pagination inputs, and current totals | Build ordered/reused/inserted/removed keys plus a pure render plan for safe current-page replacement | Bogus-folder back blocks, missing entity arrays, or duplicate visible keys return a named full-render fallback |
| `deleteReconcilePlan` | before/after entity snapshots, deleted avatar keys, current page, page size, and list-state flags | Build an incremental single-delete page patch plan with deleted key, page entities, pagination label, and identity-sync marker | Multi-delete, active filters, bulk edit, bogus-folder drilldown, pending prints, missing before key, or still-present after key return a named full-refresh fallback |
| `shouldRefreshAfterEdit` | current `characters` array plus submitted edit avatar | Return true only for a non-empty string avatar still present locally | Invalid or already-deleted avatars suppress the edit refresh |
| `bulkDeleteButtonState` | bulk delete button, selection boolean, optional fallback focus element | Toggle `disabled`, set `aria-disabled`, set `tabindex`, and move focus away when disabling the focused action | Missing button returns without throwing; disabled focused button blurs and focuses fallback when available |
| `bulkSelectionCountState` | selected-count element, delete button, fallback focus element, numeric count, and current locale | Update delete affordance from `count > 0`; write compact visible text (`"N sel"` by default, `"N个"` for Chinese locales) plus full title and ARIA label | Missing count element skips text/label updates after delete affordance is updated |
| `visibleBulkSelectionDomState` | visible character row container plus persisted selected character ids | Convert selected ids to numbers; toggle selected class, `aria-selected`, and checkbox checked state on visible rows; return visible selected count | Missing container returns `0`; hidden selected rows remain only in the model until rendered |

## Maintenance Constraints

- Keep this lineage file aligned with `frontend_shared_library_boundary_processing_flow.md`.
- Keep character-list state rows aligned with `character_list_state_processing_flow.md` and `character_list_state_sandbox_proof.py`.
- Add a new row when a documentation proof script starts producing a new named output.
- Do not use this file as a second implementation guide; detailed processing rules belong in the owning flow doc.
