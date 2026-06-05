# Briefs

This directory keeps only high-signal user-intent records that are still useful after delivery.

Briefs are not a changelog and should not duplicate shipped feature details. When a slice is delivered and its durable facts are already owned by `.docs/PROJECT_HISTORY.md`, `.docs/db/`, or a focused `.docs/tech/` page, remove the brief from this directory.

## Retention Criteria

Keep a brief here only when it preserves one of these:

- A current runtime, tooling, or architecture contract that future work can misread.
- A corrected research conclusion that shaped a later design and has no better owning doc yet.
- A strategic constraint for future implementation slices.

Delete or avoid adding briefs that are:

- Completed feature-process records already represented in `.docs/PROJECT_HISTORY.md` and semantic docs.
- Speculative research not accepted into the roadmap.
- Draft notes whose useful facts have been merged into an owning tech doc or ADR.

## Current Briefs

| Brief | Why it remains |
|---|---|
| `260604-03-node-26-upgrade.md` | Captures the user decision to move the runtime contract to exact Node.js 26.3.0 Current before LTS. |
| `260604-06-data-storage-optimal-solution.md` | Preserves the corrected storage strategy: filesystem remains canonical; SQLite stays derived; ORM/runtime migrations are not near-term defaults. |
| `260604-07-eslint-upgrade-oxlint-migration.md` | Records the corrected lint-tooling migration intent, package-cooling constraints, and authoritative ESLint vs non-authoritative oxlint boundary. |
| `260604-09-sqlite-sidecar-helper-foundation.md` | Captures the first delivered storage-sidecar slice and the constraints behind the shared derived SQLite helper. |
| `260605-01-character-list-page-slice-helper.md` | Preserves the delivered boundary for the character-list page-slice helper: pure snapshot slicing moved to render-state while DOM and pagination plugin ownership stayed in `public/script.js`. |
