# Brief: 260527-03 Character List Incremental Render Expansion

## User Intent

- Source: 2026-05-27 user request to continue `$delivery-workflow docs/specs/260527-03-character-list-incremental-render-expansion` after the earlier character-list reconcile groundwork and documentation update requests in this workspace.
- Objective: expand the character library from delete-only incremental reconcile to a reusable current-page reconcile path for ordinary list changes while preserving compatibility selectors, pagination, bulk-selection state, and conservative full-refresh fallback.
- Constraints:
  - keep the existing jQuery character-list slice
  - preserve `data-chid`, legacy `chid`, and `id="CharID${chid}"`
  - do not change delete dialog semantics, world-info cascade rules, or extension APIs
  - update durable semantic, tech, logic, overview, and history docs to match the final implementation

## Implementation Traceability

| Intent domain | Code / doc path | Delivery status | Traceability |
|---|---|---|---|
| Pure page reconcile planning | `public/scripts/character-list-render-state.js`; `tests/character-list-render-state.test.js` | delivered | Shared helper now returns ordinary current-page reconcile plans plus named fallbacks; validated by focused Jest suite |
| Runtime wiring for ordinary page renders | `public/script.js`; `tests/character-list-structure.test.js` | delivered | `renderCharacterListPage()` now attempts shared incremental current-page reconcile before falling back to full render |
| Shared delete page updater | `public/script.js`; `tests/character-list-structure.test.js` | delivered | `reconcileCharacterListAfterDelete()` now reuses the shared DOM apply helper while keeping suppression timing and delete fallbacks intact |
| Bulk-selection and row-identity stability | `public/scripts/character-list-state.js`; `tests/character-list-state.test.js`; `tests/character-list-render-state.test.js` | delivered | Visible selection restoration and `data-chid`/`chid`/`CharID` rewrites remain aligned after row moves, inserts, and delete补位 |
| Durable docs and proof | `.docs/db/features/character-library-panel.md`; `.docs/db/features/character-delete.md`; `.docs/tech/interaction-performance-indexing.md`; `.docs/logic-description/character_list_state_processing_flow.md`; `.docs/logic-description/character_list_state_sandbox_proof.py`; `.docs/project-overview.md`; `.docs/PROJECT_HISTORY.md` | delivered | Semantic, tech, logic, overview, and history docs now describe the shipped current-page reconcile behavior; validated by sandbox proof plus `docs:check` / `docs:build` |

## Validation Snapshot

- `uv run python .docs/logic-description/character_list_state_sandbox_proof.py`
- `bun run --cwd tests test:unit -- character-list-render-state.test.js character-list-state.test.js character-list-structure.test.js --runInBand`
- `bun run test:compat`
- `bun run docs:check`
- `bun run docs:build`

## Wrap-Up Note

- Commit traceability to be finalized by the wrap-up commit for this feature.
