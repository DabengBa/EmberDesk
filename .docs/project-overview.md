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
3. Keep canonical user data portable and file-backed unless there is a strong reason to change it.
4. Modernize in slices that preserve existing behavior and upgrade safety.
5. Treat documentation and measurement as part of product quality, not afterthoughts.

## Architecture And Boundaries

- Runtime: Node.js 26.3.0 Current (`>=26.3.0 <27`)
- Package manager and task runner: Bun 1.3.14
- Server: Express-based API and startup pipeline
- Frontend: HTML/CSS/jQuery compatibility substrate plus progressive React page/panel islands; the root `/` workspace shell boundary has been reopened as an opt-in same-entry React chrome/layout takeover path rather than a separate SPA route
- Build: Bun-managed scripts plus Vite for shared browser library output, the shared React app, and guarded React panel bundles; Webpack remains a deprecated `/lib.js` fallback
- Entry point: `server.js` -> `src/server-main.js`
- React migration: feature-flagged page islands for `/login`, `/setup`, and `/settings`, guarded workspace islands for Character Library, Main Chat Message List, World Info, Background Library, and Extensions Host, and an opt-in `features.react.shell.takeover` path for the current `/` workspace chrome. The successor shell path does not introduce `/workspace-next`; it keeps same-entry rollback and compatibility boundaries explicit (see [ADR-0007](adr/0007-react-page-islands-with-legacy-fallbacks.md) and [Next Workspace Shell](db/features/next-workspace-shell.md)).
- Workspace panel and shell bootstrap: the server payload publishes `reactPages.settings`, independent panel flags (`characterLibrary`, `mainChatMessageList`, `worldInfo`, `backgroundLibrary`, `extensionsHost`), and `reactShell.{takeover,strict}`. Character Library keeps its dedicated bundle; the shared workspace-panel bundle mounts the guarded main-chat, World Info, Background Library, and Extensions Host slices fail-closed behind the same payload, while the same-entry React shell chrome reads a transient dock snapshot for active-panel/status coordination. Flag-off or build-failure paths do not insert empty migration hosts, and remaining legacy owners are explicit compatibility boundaries rather than ambiguous competing implementations.
- React state migration: Phase 4 has already landed the Zustand-backed workspace-panel and main-chat observation stores plus an allowlisted global compatibility bridge. The current roadmap now closes with `globalThis.SillyTavern` and `@sillytavern/*` frozen as documented public facades, `eventSource` / `event_types` kept as long-term supported public runtime contracts, jQuery globals limited to their documented compatibility surfaces, and `__emberDeskReactCompatibilityBridge` kept internal-only. `JS-Slash-Runner` remains the primary blocker sample for any future proposal that would narrow those surfaces.
- Main-chat React boundary: the guarded `mainChatMessageList` island now owns the visible composer, slash-status shell, safe row/action shell, and the standard OpenAI direct-chat visible transport path (`submitComposer`, `continueLast`, regenerate/retry, and swipe). The React controller also owns reading-position restore plus the row/windowing decision surface, while excluded non-OpenAI/group/dry-run/nested-visible requests, quiet/background helper requests, unsafe or extension-mutated rows, and the actual legacy `showMoreMessages()` execution path remain explicit compatibility owners or facades inside the same shell.
- World Info facade boundary: `public/scripts/world-info.js` remains the World Info compatibility facade, while `public/scripts/world-info-shell-context.js` provides a narrow internal shell-context seam for startup-safe access to shell-owned state and `eventSource` methods.

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
- `public/lib.js` — browser shared-library boundary for first-party modules and extensions; it preserves both source imports and bundled `/lib.js` output (see [frontend-shared-library-boundary](tech/frontend-shared-library-boundary.md) and [ADR-0006](adr/0006-preserve-dual-libjs-source-and-bundled-boundary.md))

The project still carries substantial upstream SillyTavern structure. EmberDesk is in a transition stage, not a clean-room rewrite.

## Current Capability Set

EmberDesk currently provides:

- a main browser workspace for chat-centric LLM use
- character-card management and large-library browsing
- a guarded React character-library panel island inside the main workspace, keeping the same entry point while making the React toolbar/list path the normal visible owner for large-library browsing and keeping only a documented emergency compatibility facade for flag-off or build-missing cases
- an opt-in same-entry React workspace chrome for current context, shell status, AI Config, Formatting, Character Library, World Info, Backgrounds, Extensions, and Settings navigation, with Settings falling back to the legacy drawer when the React settings page is unavailable and panel entries exposing only transient active/status coordination instead of persistent shell-owned drawer state
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

Current derived-cache scope is intentionally narrow:

- canonical character cards and chats remain file-backed
- `DiskCache` accelerates repeated PNG-to-JSON extraction
- `src/derived-cache-sqlite.js` owns shared SQLite derived-cache lifecycle for sidecars that remain rebuildable from canonical files (see [derived-cache-sqlite](tech/derived-cache-sqlite.md))
- the SQLite character index accelerates the character-library list API and safe steady-state single-character full reads
  - single-character indexed reuse still revalidates source PNG metadata, linked legacy world-info dependencies, and chat-derived aggregates before treating cached payloads as reusable
- this slice does not introduce a database-first source of truth for chats, world info, or general workspace state

## Explicit Exclusions

EmberDesk does not currently aim to:

- replace the current workspace with a separate full SPA route; modernization continues through same-entry React ownership inside `/` while compatibility substrate remains available until focused proof retires it
- replace canonical character/chat files with a database-first product model
- provide a hosted SaaS control plane
- treat every upstream SillyTavern feature as mandatory to preserve forever

## Guardrails For Future Work

- Prefer deletion, narrowing, or derived-state acceleration before adding new core systems.
- Keep migrations incremental and reversible where practical.
- Separate user-facing product semantics from implementation notes.
- Keep `/lib.js` compatibility decisions centralized in `public/lib.js` and its boundary tests.
- Validate performance claims with repeatable tooling and browser evidence.
- Do not let internal caches or indexes become the canonical user-data source by accident.
- Keep derived caches scoped to proven hot paths; do not broaden them into general persistence without clear user-visible ROI.
- Treat client-side derived lists as disposable views over canonical files; after destructive actions, stale delayed responses must not restore removed rows.
- Keep compatibility-facing character row selectors and accessibility state synchronized when list rows are reused instead of re-rendered.
- Treat main-chat message rows, send-form controls, `eventSource` / `event_types`, and slash-command surfaces as protected compatibility points; add focused browser and compatibility proof before changing rendering or streaming behavior.
- Keep startup-time compatibility facades lazy around shell-owned constants and preserve emitter binding when proxying `eventSource`; eager registration reads must not block the workspace readiness overlay from clearing.
- Treat React modernization as successor-gated, not an open-ended rewrite: React routes, islands, and the same-entry shell takeover can expand only through focused specs/proof, and any future narrowing of compatibility exports or same-entry rollback facades requires new proof and a new ADR/spec boundary.

## One-Line Summary

EmberDesk is a self-hosted, browser-based LLM workspace that is being simplified, optimized, and incrementally modernized without abandoning the existing file-backed product model.
