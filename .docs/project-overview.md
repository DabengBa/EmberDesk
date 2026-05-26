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

- Runtime: Node.js 24 LTS (`>=24 <25`)
- Package manager and task runner: Bun 1.3.14
- Server: Express-based API and startup pipeline
- Frontend: HTML/CSS/jQuery main shell with progressive performance refactors
- Build: Bun-managed scripts plus Webpack for client-side libraries
- Entry point: `server.js` -> `src/server-main.js`

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
- chat history storage and recovery
- world info / lorebook workflows
- background and extension surfaces inside the main shell
- a documented shared browser library for common frontend utilities and extension compatibility
- Docker-friendly deployment and browser access across devices
- focused startup and interaction performance work for daily-use paths
- client-side character-list consistency guards so delayed edit/save responses do not undo confirmed deletion actions

Current derived-cache scope is intentionally narrow:

- canonical character cards and chats remain file-backed
- `DiskCache` accelerates repeated PNG-to-JSON extraction
- the SQLite character index accelerates the character-library list API and safe steady-state single-character full reads
  - single-character indexed reuse still revalidates source PNG metadata, linked legacy world-info dependencies, and chat-derived aggregates before treating cached payloads as reusable
- this slice does not introduce a database-first source of truth for chats, world info, or general workspace state

## Explicit Exclusions

EmberDesk does not currently aim to:

- introduce a SPA framework just to replace jQuery
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

## One-Line Summary

EmberDesk is a self-hosted, browser-based LLM workspace that is being simplified, optimized, and incrementally modernized without abandoning the existing file-backed product model.
