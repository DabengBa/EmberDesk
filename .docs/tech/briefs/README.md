# Briefs

This directory keeps high-signal user-intent records that are still useful after delivery.

Briefs are not a changelog and should not duplicate shipped feature details. Delivery-workflow briefs are persistent intent records while their roadmap, successor decision, or traceability value remains active; remove only duplicate draft notes whose useful facts have already moved to `.docs/PROJECT_HISTORY.md`, `.docs/db/`, a focused `.docs/tech/` page, or an ADR.

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
| `260605-02-character-route-service-extraction.md` | Preserves the user-approved route-service boundary and UX-facing constraints behind the character read-service extraction. |
| `260605-03-character-route-performance-proof.md` | Records why the third closure slice became Node 26 route/perf/UX evidence instead of another route extraction. |
| `260605-04-chat-route-service-extraction.md` | Preserves the narrow chat search/recent service boundary and the decision to leave mutation/import/export behavior route-owned. |
| `260605-05-derived-cache-release-hardening.md` | Records the no-code release-risk matrix proving derived SQLite fallback, reset, and circuit-breaker behavior. |
| `260605-06-low-risk-frontend-controller-slice.md` | Preserves the low-risk frontend controller extraction constraints: background loading-state ownership changed while visible behavior and compatibility stayed stable. |
| `260605-07-compatibility-hardening-pass.md` | Records protected extension, slash-command, route-envelope, regex, and shared-library compatibility surfaces for later slices. |
| `260605-08-build-dependency-closure.md` | Preserves the build/toolchain closure facts for Node, Bun, Webpack, ESLint, oxlint, and dependency drift. |
| `260605-09-node26-release-validation-sweep.md` | Records the Node 26.3.0 release validation matrix and the scoped Playwright skip decision. |
| `260605-10-documentation-topology-closure.md` | Records the delivered documentation topology closure: retained briefs are indexed, spec-local process files are not durable archives, and semantic docs stayed unchanged. |
| `260605-11-roadmap-freeze-successor-decision.md` | Records the delivered roadmap freeze and successor-decision boundary for future SPA, TypeScript, database-first storage, broad endpoint, Electron, dependency/runtime, and `/lib.js` migration proposals. |
