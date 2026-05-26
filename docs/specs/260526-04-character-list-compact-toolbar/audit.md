# Character List Compact Toolbar — Audit

Spec: `docs/specs/260526-04-character-list-compact-toolbar/`

Stage: `final-review` (entered after implementation; `audit.md` was missing)

## Summary

This slice compacts the character list toolbar into a predictable two-row layout at common drawer widths and visually quiets the per-card Character type badge while keeping the Group badge visible. DOM identity and extension mount points remain unchanged.

## Evidence (Script / Command Verified)

- Stage detection:
  - `uv run python .../detect_stage.py --spec-dir docs/specs/260526-04-character-list-compact-toolbar --expect-stage final-review` -> stage `final-review` (plan tasks complete; audit missing).
- Focused tests:
  - `bun run --cwd tests test:unit -- character-list-structure.test.js --runInBand` (PASS, 9 tests)
  - `bun run --cwd tests test:unit -- third-party-extension-compatibility.test.js --runInBand` (PASS, 6 tests)
  - `bun run test:compat` (PASS)
- Semantic docs:
  - `bun run docs:build` (built 22 semantic docs)
  - `bun run docs:check` (validated 22 semantic docs)

## Browser Evidence (DevTools MCP)

Server run (seeded dev data):
- Seed: `node scripts/seed-dev-environment.mjs --profile small --data-root .tmp/compact-toolbar-browser-data --config .tmp/compact-toolbar-browser-config.yaml --user-handle compact-toolbar --user-password playwright`
- Start: `node server.js --configPath .tmp/compact-toolbar-browser-config.yaml --port 8010`

Observed via page-context probes:
- Desktop widths:
  - `#rm_button_bar` computed `display: grid` with `gridTemplateAreas` `"create sort" "view bulk"` at `1024` and `1440` viewport widths.
- Narrow breakpoint:
  - Under the `max-width: 600px` breakpoint (probe ran at a narrow viewport), `gridTemplateAreas` becomes `"create" "sort" "view" "bulk"` and controls remain reachable without overflow.
- Bulk mode:
  - After enabling bulk edit, bulk status controls become visible on the same row as Search/Grid/Bulk Edit.
  - `#bulkDeleteButton` is disabled when count is 0: has `.disabled`, `aria-disabled="true"`, and `tabindex="-1"`.
- Badge hierarchy:
  - Character row type badge exists in DOM but is `display: none`.
  - Group badge remains visible (`display: flex`) and still reads as Group in the list.

Screenshots captured:
- `.tmp/compact-toolbar-browser.png`
- `.tmp/compact-toolbar-browser-1440.png`

Known console noise not introduced by this slice:
- A pre-existing MIME issue for `css/user.css` (`text/plain`) appears on startup. This run did not address that baseline warning.

## Diff Review

Changed files (scoped and expected):
- `public/style.css`: toolbar layout now uses CSS grid with explicit areas; character badge hidden; group badge forced visible; button labels truncate safely.
- `tests/character-list-structure.test.js`: new assertions for the grid layout contract and badge visibility contract.
- `.docs/db/features/character-library-panel.md`: updated user-visible rules for the compact toolbar and badge hierarchy.

## Findings

No correctness or compatibility regressions were found in the planned proof surfaces.

Notes:
- `#rm_button_bar .character-list-create-group` now allows horizontal scrolling when extensions inject many buttons into `#rm_buttons_container`. This is an intentional degradation path to preserve the two-row default for built-in controls.

## Frontend Review Decision

`classify_changes.py` reports `touches_frontend: true`, `touches_user_surface: true`, and recommends running frontend review. This audit includes browser evidence across representative widths and bulk mode, so the frontend-review requirement is satisfied for this slice.
