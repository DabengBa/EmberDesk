# EmberDesk Project History

Creation date: 2026-05-01

Scope: EmberDesk is a self-hosted browser-based LLM workspace derived from SillyTavern. This file records cross-spec architectural evolution and lessons that matter beyond individual specs.

## Architecture / Evolution

| Date | Change | Summary | Why | References |
|---|---|---|---|---|
| 2026-05-08 | perf | Deferred startup panels and single-flight loaders | Shorten browser startup for the already-running-service scenario | [startup-app-ready-optimization](tech/startup-app-ready-optimization.md) |
| 2026-05-09 | perf | SQLite character index for list/get paths | Accelerate character-library browsing for large collections | [interaction-performance-indexing](tech/interaction-performance-indexing.md) |
| 2026-05-18 | refactor | Server startup phase extraction | Make boot phases independently callable and cleanup testable | [server-startup-orchestration](tech/server-startup-orchestration.md), [ADR-0001](adr/0001-startup-phase-extraction.md) |
| 2026-05-18 | refactor | Config resolution three-phase split | Make argv parsing and config resolution independently testable | [ADR-0002](adr/0002-config-resolution-three-phase-split.md) |
| 2026-05-19 | refactor | User account module split | Split 1244-line users.js into storage, directories, migrations, and auth modules | [user-module-split](tech/user-module-split.md) |
| 2026-05-19 | refactor | Plugin loader lifecycle split | Extract git auto-update to plugin-updater.js, extract discovery as pure filesystem function | [plugin-loader-lifecycle](tech/plugin-loader-lifecycle.md), [ADR-0004](adr/0004-plugin-loader-lifecycle-split.md) |
| 2026-05-20 | ux | Unified delete dialog for character cards | Merge 3-layer serial popups (delete confirm → temp chat → world info cascade) into 1 dialog; add generation auto-stop to both bulk and single-character delete | [character-delete](db/features/character-delete.md) |
| 2026-05-20 | ux | Delete dialog UX simplification | Remove danger banner and generation/chat info lines; default chat-file checkbox to checked; remove cross-character world-ref cleanup option | [character-delete](db/features/character-delete.md), [ADR-0005](adr/0005-delete-no-cross-character-world-ref-cleanup.md) |
| 2026-05-20 | ux | AI/API settings UI simplification | Reorganize chat-completion drawer into labeled sections (Options, Features, Advanced Sampling, Image Generation, Settings); add segmented controls for reasoning effort and verbosity; move sampling parameters to collapsible Advanced Sampling drawer; add text labels to preset action buttons | [api-configuration](db/pages/api-configuration.md), [chat-completion-select](db/features/chat-completion-select.md) |
| 2026-05-21 | fix | Cascade delete UI cleanup for world info | Character-card cascade-delete of a world book left the WI editor panel showing stale ghost data; extract `flushDeletedWorldsFromUI()` to unify cleanup across both delete paths | [character-delete](db/features/character-delete.md) |
| 2026-05-21 | ux | Unified import confirmation dialog | Consolidate 4 separate import popups (tags, world book, regex scripts, CSS) into 1 unified dialog with pre-set storage to suppress individual popups | [unified-import-confirm](db/features/unified-import-confirm.md) |
| 2026-05-21 | fix | World book entry count in delete-preflight | `entries` is an object keyed by UID, not an array; `.length` always returned 0. Changed to `Object.keys().length` | [world-book-delete](db/features/world-book-delete.md) |
| 2026-05-21 | ux | Cascade warning when deleting a world book | Deleting a world book from the editor now warns when other characters still reference it, with an option to clear those references before deletion | [world-book-delete](db/features/world-book-delete.md) |
| 2026-05-21 | ux | World Info panel card-collapsed redesign | Transform WI panel from all-expanded inline-drawer to card-collapsed click-to-expand layout with accordion groups, status light toggle, more menu, and DESIGN.md token compliance | [world-info-panel-redesign](specs/world-info-panel-redesign/design.md) |
| 2026-05-21 | fix | WI panel defect fixes (6 items) | Fix card-expand nested cards (registry + factory pattern), restore pagination container, move injection controls to correct template scope, add originalData sync for status changes, hide unimplemented multi-select UI | [world-info-panel-redesign](specs/world-info-panel-redesign/design.md) |
| 2026-05-23 | docs | Tech-upgrade baseline freeze | Establish accepted-degraded baseline before Node, Express, and frontend modernization: startup and `/lib.js` verified; unit, E2E MacroEngine, and semantic-doc failures recorded as baseline debt | `ead308ace docs: plan staged technology upgrades` |
