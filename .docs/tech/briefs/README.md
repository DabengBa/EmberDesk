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
| `260606-01-chat-message-affordance-proof.md` | Preserves the first successor-slice intent for the main chat workspace: establish message-row affordance and rendering contract proof before any message rendering or streaming refactor. |
| `260606-02-chat-message-rendering-proof.md` | Preserves the second successor-slice intent for the main chat workspace: establish real app proof for stored non-streaming message rendering before changing rendering or streaming internals. |
| `260607-01-main-chat-successor-spec-set.md` | Preserves the user-requested 10-spec successor sequence for main-chat workspace modernization after the roadmap freeze. |
| `260608-01-main-chat-next-successor-spec-set.md` | Preserves the later main-chat successor batch and the decision to keep canvas/artifacts/RAG/tools/storage/framework moves outside ordinary UI cleanup. |
| `260608-09-main-chat-auto-retry-fallback-provider.md` | Preserves the user-approved change from local manual provider-failure recovery to a bounded automatic retry chain with a fallback OpenAI-compatible provider for main-chat visible generation only. |
| `260609-01-architecture-deepening-spec-set.md` | Preserves the architecture-deepening batch boundaries for generation lifecycle, external imports, provider secret state, and frontend structure contracts. |
| `260609-02-character-card-write-command.md` | Preserves the delivered single-card write command boundary and the decision not to recreate process specs after durable docs captured the shipped facts. |
| `next-workspace-shell.md` | Preserves the successor intent to continue React ownership through the current `/` workspace shell for visual and interaction modernization while keeping the compatibility substrate intact. |
| `react-phase7-full-owner-cutover-sequenced-specs.md` | Preserves the roadmap-closing Phase 7 spec-set intent, the JS-Slash-Runner compatibility gate inheritance, and the delivered archive entrypoints for the final owner-cutover closure. |
| `react-modernization-intent.md` | Preserves the user-approved React modernization direction and later implementation traceability across Phase 0, Phase 1, and the first Phase 2 panel island. |
| `react-phase1-sprint2-setup-page.md` | Preserves the React Setup rollout intent, feature-flag/fallback boundary, and TanStack Form / Query / Zod adoption requirement. |
| `react-phase1-sprint3-settings-panel.md` | Preserves the React Settings entry intent, the explicit exclusion of World Info / Backgrounds / Extensions, and the TanStack adoption gate. |
| `react-phase2-character-library-panel-sprints-1-3.md` | Preserves the delivered Phase 2 Character Library panel-island intent, including search/sort/tag/bulk expectations and legacy tag-control ownership. |
| `react-phase3b-visible-message-row-renderer.md` | Preserves the approved Phase 3B first slice: React takes over safe visible MessageRow rendering while actions, composer, slash UI, and provider transport remain separate later sprints. |
