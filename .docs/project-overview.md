# EmberDesk Project Overview

## Positioning

EmberDesk is a browser-based LLM frontend derived from SillyTavern and reshaped for a narrower goal: keep the power-user workflow, remove unnecessary complexity, and improve real-world responsiveness for self-hosted deployments.

It is not trying to become a hosted service or a new frontend framework. The current product direction is to modernize a mature jQuery/Express codebase incrementally while preserving daily usability for existing users.

## Audience

EmberDesk targets:

- self-hosting users who run the app on a local machine, NAS, VPS, or Docker-based server
- power users who manage large character libraries, chats, world info, and extensions
- multi-device users who access the same server from desktop and mobile browsers

It is not optimized for users who want a managed cloud product or a minimal one-click chat toy.

## Principles

1. Simplify before extending.
2. Prefer observable performance wins over architectural novelty.
3. Keep canonical user data portable; the confirmed long-term direction is comprehensive per-user SQLite authority, delivered one independently gated domain at a time with explicit migration, managed-file/projection, repair, and rollback rules.
4. Modernize in slices that preserve existing behavior and upgrade safety.
5. Treat documentation and measurement as part of product quality, not afterthoughts.

## Architecture And Boundaries

- Runtime: Node.js 26.3.0 Current (`>=26.3.0 <27`)
- Package manager and task runner: Bun 1.3.14
- Server: Express-based API and startup pipeline
- Frontend: HTML/CSS/jQuery compatibility substrate plus progressive React page/panel islands; the root `/` workspace shell boundary has been reopened as an opt-in same-entry React chrome/layout takeover path rather than a separate SPA route
- Build: Bun-managed scripts plus Vite for shared browser library output, the shared React app, and guarded React panel bundles; Webpack remains a deprecated `/lib.js` fallback
- Entry point: `server.js` -> `src/server-main.js`
- React migration: feature-flagged page islands for `/login`, `/setup`, and `/settings`, guarded workspace islands for Character Library, Main Chat Message List, World Info, Background Library, Extensions Host, Character Authoring, and Group Authoring, and an opt-in `features.react.shell.takeover` path for the current `/` workspace chrome. The successor shell path does not introduce `/workspace-next`; it keeps same-entry rollback and compatibility boundaries explicit (see [ADR-0007](adr/0007-react-page-islands-with-legacy-fallbacks.md) and [Next Workspace Shell](db/features/next-workspace-shell.md)).
- Workspace panel and shell bootstrap: the server payload publishes `reactPages.settings`, independent panel flags (`characterLibrary`, `mainChatMessageList`, `worldInfo`, `backgroundLibrary`, `extensionsHost`, `characterAuthoring`, `groupAuthoring`), and `reactShell.{takeover,strict}`. Character Library keeps its dedicated bundle; the shared workspace-panel bundle mounts the guarded main-chat, World Info, Background Library, Extensions Host, Character Authoring, and Group Authoring slices fail-closed behind the same payload, while the same-entry React shell chrome reads a transient dock snapshot for active-panel/status coordination across AI Config, Formatting, Character Library, World Info, Backgrounds, Extensions, Settings, Group Chats, and Character Authoring. Flag-off or build-failure paths do not insert empty migration hosts, and remaining legacy owners are explicit compatibility boundaries rather than ambiguous competing implementations.
- React state migration: Phase 4 has already landed the Zustand-backed workspace-panel and main-chat observation stores plus an allowlisted global compatibility bridge. The current roadmap now closes with `globalThis.SillyTavern` and `@sillytavern/*` frozen as documented public facades, `eventSource` / `event_types` kept as long-term supported public runtime contracts, jQuery globals limited to their documented compatibility surfaces, and `__emberDeskReactCompatibilityBridge` kept internal-only. `JS-Slash-Runner` remains the primary blocker sample for any future proposal that would narrow those surfaces.
- Legacy cutover policy: EmberDesk no longer treats every remaining legacy path as vague pending deletion. The current durable policy lives in [.docs/tech/legacy-cutover-ledger.md](tech/legacy-cutover-ledger.md): each retained surface is explicitly classified as a compatibility facade, a freeze-supported boundary, or a blocked deletion candidate.
- Main-chat React boundary: the guarded `mainChatMessageList` island now owns the visible composer, slash-status shell, safe row/action shell, and the standard OpenAI direct-chat visible transport path (`submitComposer`, `continueLast`, regenerate/retry, and swipe). The React controller also owns reading-position restore plus the row/windowing decision surface, while excluded non-OpenAI/group/dry-run/nested-visible requests, quiet/background helper requests, unsafe or extension-mutated rows, and the actual legacy `showMoreMessages()` execution path remain explicit compatibility owners or facades inside the same shell.
- World Info facade boundary: `public/scripts/world-info.js` remains the World Info compatibility facade, while `public/scripts/world-info-shell-context.js` provides a narrow internal shell-context seam for startup-safe access to shell-owned state and `eventSource` methods.
- Storage authority boundary: [ADR-0011](adr/0011-canonical-per-user-sqlite-storage.md) provides the delivered per-user canonical SQLite foundation. Character metadata, character chat stats, full World Info, the settings document, secret records, and managed media now have gated canonical authority paths. The remaining storage sequence first maintains independent slice gates, then splits chat into foundation, authority cutover, and query/recovery packages. Persona records and extension preferences remain inside the revisioned settings document; extension discovery/worktrees remain filesystem/Git-owned because the global registry is server-wide; vector chunks and embeddings remain derived. SQLite owns structured identity, relationships, lifecycle, audit status, and file references where independent enforcement is needed, while large content stays in managed files. The executable sequence lives in [canonical-sqlite-storage-roadmap](tech/canonical-sqlite-storage-roadmap.md).
- Canonical storage foundation: EmberDesk now includes a dedicated canonical SQLite manager at `src/canonical-sqlite.js`, a migration runner at `src/canonical-sqlite-migrations.js`, character, World Info, settings, secret, and managed-media shadow import/audit owners, a slice registry at `src/canonical-storage-slice-registry.js`, a rollout/rollback contract helper at `src/canonical-sqlite-rollout-contract.js`, multi-slice operator status/repair helpers at `src/canonical-sqlite-operator.js`, canonical repair CLI entry points at `scripts/canonical-sqlite-audit.mjs` and `scripts/canonical-sqlite-repair.mjs`, canonical query helpers at `src/endpoints/character-store.js`, `src/endpoints/world-info-store.js`, and managed-media read/write services. Per-user `storage` directories live under `DATA_ROOT/<handle>/storage`; global compatibility flags can be overridden by an optional descriptor-owned slice field, and operator status reports each effective source. This foundation is fail-closed: DB-first reads exist only after persisted audit summaries pass, canonical write paths can commit SQLite first while projecting compatibility files, and unresolved projection repairs block rollback claims until operator tooling clears or re-audits them.

Current architectural boundaries:

- `public/` owns the browser UI and most product behavior
- `src/` owns server routing, startup, data access, and operational utilities
- `.docs/tech/` owns implementation and architecture notes
- `.docs/db/` owns user-facing semantic product docs for pages, features, and terms
- `tests/` owns Jest unit/compatibility coverage and Playwright E2E proof run through root Bun scripts

Key module structure:

- `users.js` — barrel re-export plus middleware, routes, backup, security verification. Delegates to:
  - `user-storage.js` — `node-persist` CRUD, lazy `getEnableAccounts()` config read
  - `user-directories.js` — per-user filesystem layout under `DATA_ROOT/<handle>/`
  - `user-migrations.js` — three self-contained idempotent migration functions
  - `user-auth.js` — credential verification, SSO (Authelia/Authentik/basic), session crypto
- `plugin-loader.js` — orchestrator: discovery, validation, initialization, cleanup collection. Delegates to:
  - `plugin-updater.js` — standalone git auto-update for repo-backed plugins
- `server-main.js` — boot pipeline coordinator with six sequenced phases (see [server-startup-orchestration](tech/server-startup-orchestration.md))
- `server-startup.js` — transport layer: IP detection, HTTP/HTTPS creation, listen failure handling
- `canonical-sqlite.js` — fail-closed per-user canonical SQLite manager for approved storage slices; provides path resolution, lifecycle, PRAGMA, transaction, and status reporting
- `canonical-sqlite-migrations.js` — canonical schema journal and migration runner for approved storage slices; currently bootstraps the Phase 1/2/3 schema, including the persisted audit-state table needed by read/write cutover
- `canonical-sqlite-shadow-import.js` — Phase 1 shadow import and audit seam for character metadata plus character chat stats; now also persists the fail-closed audit summary consumed by Phase 2 read cutover
- `canonical-storage-slice-registry.js` — registered canonical storage slices (`characters`, `world_info`, `settings`, `secrets`, `managed_media`) with descriptor-owned flag keys and isolated audit/repair/rollback/backup capabilities; omitted slice fields retain global compatibility behavior, while managed media keeps its independent no-global-fallback flags
- `canonical-sqlite-rollout-contract.js` — shared flag legality and per-slice rollback-blocker builders, plus character compatibility helpers
- `canonical-sqlite-operator.js` — multi-slice operator status, audit/repair routing, projection replay, blocker explanation, chat-stats rebuild, and backup/restore readiness reporting
- `src/endpoints/character-store.js` — canonical character row helper that reconstructs route-compatible read payloads and now also normalizes DB-backed character metadata writes
- `public/lib.js` — browser shared-library boundary for first-party modules and extensions; it preserves both source imports and bundled `/lib.js` output (see [frontend-shared-library-boundary](tech/frontend-shared-library-boundary.md) and [ADR-0006](adr/0006-preserve-dual-libjs-source-and-bundled-boundary.md))

The project still carries substantial upstream SillyTavern structure. EmberDesk is in a transition stage, not a clean-room rewrite.

## Current Capability Set

EmberDesk currently provides:

- a main browser workspace for chat-centric LLM use
- character-card management and large-library browsing
- a guarded React character-library panel island inside the main workspace, keeping the same entry point while making the React toolbar/list path the normal visible owner for large-library browsing and keeping only a documented emergency compatibility facade for flag-off or build-missing cases
- guarded React character and group authoring surfaces inside the existing right drawer, with field-local validation, one visible dirty/save state, keyboard-reachable group member reorder controls, create/edit destructive-action separation, single visible owner behavior over the retained legacy compatibility host, and legacy popup/file-write seams preserved underneath as compatibility boundaries
- an opt-in same-entry React workspace chrome for current context, shell status, AI Config, Formatting, Character Library, World Info, Backgrounds, Extensions, Settings, Group Chats, and Character Authoring navigation, with Settings falling back to the legacy drawer when the React settings page is unavailable, visible status copy kept in short human-readable phrases, mobile status chrome hidden when width is tight, and panel entries exposing only transient active/status coordination instead of persistent shell-owned drawer state
- chat history storage and recovery
- real-browser proof for stored chat message rendering into stable message rows, plus message-row and send-form role/name affordance coverage for future main-chat changes
- world info / lorebook workflows
- background and extension surfaces inside the main shell
- a documented shared browser library for common frontend utilities and extension compatibility
- feature-flagged React page islands for login, setup, and the migrated Settings slice, plus guarded workspace islands and the same-entry shell takeover path; TanStack Form, Zod, TanStack Query, and TanStack Virtual are used where React owns the migrated slice, while same-entry rollback facades and explicit compatibility owners stay documented in place
- Zustand-backed React state stores and an allowlisted compatibility bridge that let React-owned slices observe workspace/main-chat state without exposing broad panel internals or breaking legacy extension globals
- Docker-friendly deployment and browser access across devices
- focused startup and interaction performance work for daily-use paths
- client-side character-list incremental reconcile and consistency guards so ordinary browsing and delete flows keep visible rows, pagination, selected-character navigation, temporary-chat status, and bulk-selection hooks aligned without always redrawing the whole list, while delayed edit/save responses still cannot undo confirmed deletion actions

Current delivered storage scope is narrow; the accepted successor roadmap is comprehensive and incremental:

- character metadata now has two gated authority modes under ADR-0011: the default file-backed mode and the feature-flagged canonical SQLite mode for approved read/write slices
- the canonical SQLite foundation now exists behind default-off flags and per-user `storage/emberdesk.sqlite`, and it now supports shadow import, persisted drift-audit gating, DB-first character reads for `/api/characters/all`, `/list`, and `/get`, DB-first World Info reads for `/api/worldinfo/list` and `/get`, DB-first character and World Info writes when the corresponding read/write flags are enabled and the latest audit summary is clean, direct canonical character chat-stat maintenance when the chat stats flag is enabled, explicit operator audit/repair workflows, and centralized rollback blocker reporting
- file-backed character and chat mutations invalidate the persisted audit summary so stale canonical rows cannot remain the steady-state read authority after runtime writes that still bypass DB-first write cutover
- DB-first character writes preserve PNG/avatar/chat-directory compatibility projection, record durable repair intents when projection fails after the canonical commit, and invalidate rollback readiness until unresolved projection repairs are cleared
- canonical reads only treat `chat_size` / `date_last_chat` as DB authority when `features.storage.canonicalSqlite.chatStats=true`; in that mode, character chat save/rename/delete/import routes update `character_chat_stats` directly while chat bodies remain JSONL files and group chats stay outside character stat authority
- canonical World Info writes preserve JSON compatibility projection, record durable `world_info_projection_repairs` when projection fails after the canonical commit, and keep prompt activation, regex placement, converter/import outcomes, and delete-cascade semantics on the existing World Info compatibility facade
- canonical settings reads and writes preserve the complete settings payload, monotonic revisions, snapshots, and `settings.json` projection while keeping secret values outside the settings document
- canonical secret reads and writes stay behind `SecretManager`, preserve labels and active rotation, project `secrets.json`, keep DB reads authoritative after projection failure, and expose only sanitized audit/repair/operator metadata; SQLite storage is not encryption at rest
- `DiskCache` accelerates repeated PNG-to-JSON extraction.
- `src/derived-cache-sqlite.js` owns shared SQLite derived-cache lifecycle for sidecars that remain rebuildable from canonical files (see [derived-cache-sqlite](tech/derived-cache-sqlite.md)).
- `src/canonical-sqlite.js` owns the separate durable-manager contract for future canonical slices and intentionally does not share reset/delete semantics with the derived helper
- `_cache/character-index.sqlite` is retired from normal runtime: character list/get routes, character write/import routes, chat mutation routes, World Info delete-preflight/cascade, and server startup/shutdown no longer open, refresh, dirty-mark, delete, or report it.
- deleting `_cache/character-index.sqlite` cannot lose user data; current character-library behavior is recovered from canonical SQLite when enabled and audit-clean, or from direct compatibility files when fallback is required.
- `src/endpoints/character-index.js` remains only as a historical/helper-level proof surface until a later cleanup deletes or archives it.
- this retired derived slice remains separate from the canonical SQLite store and must not be promoted in place to authority
- character metadata, chat stats, full World Info, settings, secrets, and managed media are delivered authority slices; active storage work maintains per-slice gates, then builds, cuts over, and operationally closes canonical chat in three stages
- persona records/defaults/connections remain canonical inside the settings document, with avatars in managed media and chat-local locks moving with chat metadata; no separate persona table package is active
- extension operation safety is active without changing filesystem/Git registry authority, and vector work hardens disposable generations over stable canonical source IDs rather than creating canonical chunk-text catalogs

## Explicit Exclusions

EmberDesk does not currently aim to:

- replace the current workspace with a separate full SPA route; modernization continues through same-entry React ownership inside `/` while compatibility substrate remains available until focused proof retires it
- replace all user-data files in one move or force large binary/Git content into SQLite BLOBs; comprehensive database authority remains staged and keeps compatibility projection, managed files, import/export, and rollback proof explicit
- provide a hosted SaaS control plane
- treat every upstream SillyTavern feature as mandatory to preserve forever

## Guardrails For Future Work

- Prefer deletion, narrowing, or derived-state acceleration before adding new core systems.
- Keep migrations incremental and reversible where practical.
- Separate user-facing product semantics from implementation notes.
- Keep `/lib.js` compatibility decisions centralized in `public/lib.js` and its boundary tests.
- Validate performance claims with repeatable tooling and browser evidence.
- Do not let internal caches or indexes become canonical user-data sources by accident; canonical SQLite stores must live outside `_cache` and have explicit migration, audit, projection, and repair contracts.
- Keep derived caches scoped to proven hot paths; do not broaden them into general persistence without an accepted ADR.
- Treat client-side derived lists as disposable views over canonical files; after destructive actions, stale delayed responses must not restore removed rows.
- Keep compatibility-facing character row selectors and accessibility state synchronized when list rows are reused instead of re-rendered.
- Treat main-chat message rows, send-form controls, `eventSource` / `event_types`, and slash-command surfaces as protected compatibility points; add focused browser and compatibility proof before changing rendering or streaming behavior.
- Keep startup-time compatibility facades lazy around shell-owned constants and preserve emitter binding when proxying `eventSource`; eager registration reads must not block the workspace readiness overlay from clearing.
- Treat React modernization as successor-gated, not an open-ended rewrite: React routes, islands, and the same-entry shell takeover can expand only through focused specs/proof, and any future narrowing of compatibility exports or same-entry rollback facades requires new proof and a new ADR/spec boundary.
- Keep maintainer governance state in tech docs and ADRs, not in end-user UI. Users should see task-relevant shell/panel/chat status, not internal cutover verdict labels.

## One-Line Summary

EmberDesk is a self-hosted, browser-based LLM workspace that is being simplified, optimized, and incrementally modernized while preserving portable local data and compatibility-first migration paths.
