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
