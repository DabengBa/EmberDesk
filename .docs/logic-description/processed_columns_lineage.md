# Processed Columns Lineage

## Scope And Ownership

This lineage index covers documentation-owned reference calculations under `.docs/logic-description/`. It is not a production schema and does not describe database columns.

Current owning flow:

- [Frontend Shared Library Boundary Processing Flow](frontend_shared_library_boundary_processing_flow.md)

## Per-Output Field Lineage

| Output field | Source input | Transformation | Failure / degradation behavior |
|---|---|---|---|
| `slideToggle` | `slidetoggle` namespace object | First available value from `toggle`, `default.toggle`, `slidetoggle.toggle`, `module.exports.toggle` | Missing or non-callable value fails the documented shared-library boundary |

## Maintenance Constraints

- Keep this lineage file aligned with `frontend_shared_library_boundary_processing_flow.md`.
- Add a new row when a documentation proof script starts producing a new named output.
- Do not use this file as a second implementation guide; detailed processing rules belong in the owning flow doc.
