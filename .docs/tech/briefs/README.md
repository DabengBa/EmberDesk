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
| `260713-01-comprehensive-database-authority-roadmap.md` | Records the comprehensive authority goal and the 2026-07-14 code-fact correction; its vector-derived conclusion is historical after the 2026-07-15 retirement decision. |
| `260713-01-canonical-storage-control-plane.md` | Preserves the shared per-slice rollout, audit, repair, rollback, and operator-control intent. |
| `260713-02-canonical-settings-document-authority.md` | Preserves settings document, revision, snapshot, and compatibility-payload boundaries. |
| `260713-03-canonical-secrets-authority.md` | Preserves the independent `SecretManager`, masking, exposure, and no-false-encryption constraints. |
| `260713-04-canonical-managed-media-authority.md` | Preserves the DB-authoritative catalog plus managed-content-file boundary for media. |
| `260713-05-canonical-persona-authority.md` | Superseded record explaining why persona remains in canonical settings, avatars in managed media, and local locks in chat metadata. |
| `260713-06-canonical-extension-state-authority.md` | Superseded record explaining the per-user/global authority conflict and the narrower operation-safety successor. |
| `260713-07-canonical-chat-message-authority.md` | Superseded parent record for the three staged chat packages. |
| `260713-08-canonical-vector-catalog-and-index.md` | Superseded record explaining why vector chunks/builds remain derived rather than canonical. |
| `260714-01-canonical-storage-slice-gate-maintenance.md` | Preserves the generic per-slice flag fallback and domain-scoped migration-test maintenance intent. |
| `260714-02-canonical-chat-foundation.md` | Preserves the shadow-only chat schema, stable identity, lossless import, and audit boundary. |
| `260714-03-canonical-chat-authority-cutover.md` | Preserves full-payload DB-first chat authority and JSONL projection/rollback constraints without server pagination. |
| `260714-04-canonical-chat-query-recovery.md` | Preserves search/recent, attachment, backup/restore, repair, and Node 26 proof requirements. |
| `260714-05-extension-operation-safety.md` | Preserves filesystem/Git authority and safe extension mutation preflight/result contracts. |
| `260714-06-derived-vector-index-hardening.md` | Superseded record of the abandoned derived-generation hardening direction. |
| `260715-01-built-in-vector-retirement.md` | Preserves the approved removal boundary: delete first-party vector runtime while retaining old derived data, World Info field round-trip, Data Bank attachments, and protected extension surfaces. |
| `260716-02-react-legacy-retirement.md` | Preserves the approved successor direction: React becomes the sole runtime owner for already migrated surfaces while user workflows and supported extension/automation behavior remain intact. |
| `260716-03-react-login-setup-retirement.md` | Preserves the standalone-page cutover boundary for removing legacy Login and Setup implementations only after React owns their complete behavior. |
| `260716-04-react-compatibility-contract-baseline.md` | Preserves the provider-neutral compatibility proof required before extension-sensitive React retirement slices may delete legacy owners. |
| `260716-05-react-character-library-retirement.md` | Preserves Character Library behavior, identity selectors, extension hooks, and bulk workflow requirements across the React-only cutover. |
| `260716-06-react-character-group-authoring-retirement.md` | Preserves full character and group authoring behavior while replacing legacy forms and save orchestration with React ownership. |
| `260716-07-react-settings-retirement.md` | Preserves complete settings and provider-configuration behavior while retiring legacy drawers and same-version fallback. |
| `260716-08-react-world-info-retirement.md` | Preserves World Info editing, regex, import/export, automation, and protected browser-import contracts during React ownership cutover. |
| `260716-09-react-background-library-retirement.md` | Preserves Background Library browsing, mutation, selection, extension, and automation behavior while deleting its legacy UI owner. |
| `260716-10-react-extensions-host-retirement.md` | Preserves supported extension mounts, scripts, events, slash/regex behavior, and browser imports while React replaces the legacy host. |
| `260716-11-react-main-chat-transport-retirement.md` | Preserves the complete generation lifecycle and provider matrix while moving Main Chat transport ownership out of the legacy shell. |
| `260716-12-react-main-chat-renderer-retirement.md` | Preserves message rendering, editing, streaming, long-chat, actions, and extension mutation behavior while deleting the legacy renderer. |
| `260716-13-react-workspace-shell-retirement.md` | Preserves final workspace navigation, layout, drawer coordination, startup, and extension-hosting behavior during the last shell cutover. |
| `260605-01-character-list-page-slice-helper.md` | Preserves the delivered boundary for the character-list page-slice helper: pure snapshot slicing moved to render-state while DOM and pagination plugin ownership stayed in `public/script.js`. |
| `260605-02-character-route-service-extraction.md` | Preserves the user-approved route-service boundary and UX-facing constraints behind the character read-service extraction. |
| `260605-03-character-route-performance-proof.md` | Records why the third closure slice became Node 26 route/perf/UX evidence instead of another route extraction. |
| `260605-04-chat-route-service-extraction.md` | Preserves the narrow chat search/recent service boundary and the decision to leave mutation/import/export behavior route-owned. |
| `260605-05-derived-cache-release-hardening.md` | Records the no-code release-risk matrix proving derived SQLite fallback, reset, and circuit-breaker behavior. |
| `260605-06-low-risk-frontend-controller-slice.md` | Preserves the low-risk frontend controller extraction constraints: background loading-state ownership changed while visible behavior and compatibility stayed stable. |
| `260605-07-compatibility-hardening-pass.md` | Records protected extension, slash-command, route-envelope, regex, and shared-library compatibility surfaces for later slices. |
| `260605-08-build-dependency-closure.md` | Historical Node/Bun/build-tool closure; the Webpack state recorded there is superseded by ADR-0013. |
| `260605-09-node26-release-validation-sweep.md` | Historical Node 26.3.0 release validation matrix and scoped Playwright skip decision. |
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
