---
created: 2026-07-07
source: user
confirmed: true
last_updated: 2026-07-07
---

# Canonical SQLite Character Metadata And Chat Stats Intent

## User Original Request

用户要求预研把 SQLite、索引、缓存变成权威数据源，并给出以下裁决：

- 接受“文件不再是唯一权威源”。
- 不再保留人工编辑/拷贝文件后自动成为权威数据的语义。
- 第一阶段先从 character metadata + chat stats 开始；视情况可加入 World Info。
- 允许引入正式 migration system。
- 技术栈选择可参考 `react.md`，合适时可引入 ORM。
- 当前仍不允许破坏兼容性；破坏兼容性放到最后再做。

## Background & Motivation

EmberDesk 目前通过 file-backed canonical storage 保持可移植性和 SillyTavern 兼容性，但 character library 热路径已经依赖 SQLite derived sidecar、`DiskCache`、chat stats dirty 标记和前端增量 reconcile 来避免反复扫描。用户现在接受文件不再是唯一权威源，并希望把这个方向从性能派生层推进到真正的 canonical storage 预研。

这次预研的目标不是立即替换所有用户数据文件，也不是破坏现有扩展兼容性，而是定义一个可以先落地、可迁移、可回滚、可验证的 character metadata + chat stats 切片。

## Intent Domains

### Domain: canonical SQLite boundary

- User expectation: SQLite 可以成为 approved slice 的权威数据源，但现有兼容性不能先被破坏。
- Current status: accepted direction via ADR-0011; recommended as a new canonical per-user SQLite store outside `_cache`.
- Change history:
  - 2026-07-07: 用户确认接受“文件不再是唯一权威源”，且不再保留 out-of-band 文件编辑自动成为权威数据的语义。
  - 2026-07-07: 预研结论是不把 `_cache/character-index.sqlite` 或 `DiskCache` 原地升级为 canonical storage，而是新增 canonical SQLite store。
  - 2026-07-07: ADR-0011 已接受 canonical per-user SQLite storage direction，并新增 canonical SQLite storage roadmap 作为阶段和 rollout 合同。
  - 2026-07-07: Phase 0/Phase 1 foundation 已开始落地：新增 `src/canonical-sqlite.js`、`src/storage-feature-flags.js`、per-user `storage` 目录和 focused fail-closed tests，但运行时 authority 仍未切换。
- Implementation traceability:
  - Accepted ADR: `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
  - Roadmap: `.docs/tech/canonical-sqlite-storage-roadmap.md`
  - Current code seams: `src/endpoints/character-read-service.js`, `src/endpoints/character-write-service.js`, `src/endpoints/chats.js`, `src/endpoints/character-index.js`
  - Foundation code: `src/canonical-sqlite.js`, `src/storage-feature-flags.js`, `src/user-directories.js`, `default/config.yaml`
  - Focused proof: `tests/canonical-sqlite.test.js`, `tests/user-directories.test.js`, `tests/derived-cache-sqlite.test.js`
  - Delivery status: research complete; canonical store-manager foundation delivered, authority cutover not started.

Current repo facts:

- Project direction currently says canonical user data stays portable and file-backed unless there is a strong reason to change it.
- Current SQLite is explicitly derived-only:
  - `src/derived-cache-sqlite.js` owns rebuildable sidecar lifecycle under `_cache`.
  - `src/endpoints/character-index.js` stores `full_json`, `shallow_json`, source file stats, linked world-info stats, and `chat_stats_dirty`.
  - `_cache/character-index.sqlite` can be deleted or rebuilt without data loss.
- The first viable code seams already exist:
  - `src/endpoints/character-read-service.js` coordinates `/api/characters/all`, `/api/characters/list`, and `/api/characters/get`.
  - `src/endpoints/character-write-service.js` coordinates create, edit, and rename side effects.
  - `src/endpoints/chats.js` already marks character chat stats dirty after character chat save, rename, delete, and import.
- World Info is compatibility-sensitive:
  - `public/scripts/world-info.js` is a frozen compatibility facade for prompt activation, regex placement, import/export semantics, and delete cascade behavior.
  - `character-index.js` currently tracks only a character's linked world name and world-file freshness metadata.

Research conclusion:

Do not promote the existing `_cache/character-index.sqlite` or `DiskCache` into canonical storage.

Instead, introduce a new canonical per-user SQLite store and keep existing caches/indexes as either derived acceleration or migration scaffolding. Reusing a cache path as canonical storage would invert the current recovery contract: in the current repo state, corrupt derived SQLite can be deleted; after canonical cutover, deletion would be data loss.

Recommended product model:

- SQLite becomes the authoritative source for selected structured state.
- Compatibility files become import/export/projection artifacts, not automatic truth.
- Existing HTTP payload shapes and extension-visible behavior remain stable during the first slices.
- Out-of-band file edits are not guaranteed to update DB state after cutover unless a deliberate re-import/rescan command is run.

### Domain: first migration slice

- User expectation: 第一阶段先做 character metadata + chat stats，World Info 视情况加入。
- Current status: recommended first slice defined.
- Change history:
  - 2026-07-07: 预研将 full World Info entries、chat message bodies、group chat bodies、secrets/settings/vectors/assets/personas/backgrounds 排除出第一阶段。
- Implementation traceability:
  - Read path candidate: `character-read-service.js`
  - Write path candidate: `character-write-service.js`
  - Chat stats candidate: `chats.js`
  - Delivery status: research only.

Recommended first-slice scope:

Make a new per-user canonical SQLite store authoritative for:

- character identity and current avatar filename
- character card JSON / Tavern Card V2 payload
- list-facing character metadata
- character-to-world binding metadata
- chat stats used by character list and recent-chat surfaces:
  - total character chat bytes
  - last chat timestamp
  - chat count, if cheap to maintain
  - optional preview/count metadata only after focused proof

Keep out of the first slice:

- chat message bodies
- group chat bodies
- full World Info entries
- secrets, settings, vectors, assets, personas, backgrounds
- third-party extension storage

Why this slice:

This is the narrowest slice with real payoff because it removes hot-path scans from character browsing while avoiding immediate migration of message bodies. It also maps onto existing services:

- character reads can switch from filesystem/index-first to canonical-DB-first inside `character-read-service.js`.
- character writes can update the DB inside `character-write-service.js` before projecting compatibility files.
- chat saves can update stats in `chats.js` without changing JSONL body storage yet.

### Domain: proposed storage and migration shape

- User expectation: 允许正式 migration system；合适时可以引入 ORM。
- Current status: recommended storage layout and phased migration strategy defined.
- Change history:
  - 2026-07-07: 预研建议先用 canonical SQLite + explicit migration table，不把 derived-cache helper 复用于 canonical storage。
  - 2026-07-07: 预研建议 Phase 1 不默认引入 ORM；在 Phase 2 前单独做 ORM gate。
  - 2026-07-07: 已实现 dedicated canonical manager 与 default-off storage flags，为 migration runner、shadow import 和 read/write cutover 提供前置 runtime contract。
- Implementation traceability:
  - New module candidates: `src/canonical-sqlite.js`, `src/endpoints/character-store.js`, `src/endpoints/character-store-migrations.js`
  - Delivered module: `src/canonical-sqlite.js`
  - Delivery status: manager foundation delivered; migration runner and store schema still pending.

Proposed storage layout:

Use a new canonical location outside `_cache`, for example:

```text
data/<handle>/storage/emberdesk.sqlite
```

Do not put canonical DB files under `_cache`.

Initial tables:

```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at_ms INTEGER NOT NULL
);

CREATE TABLE characters (
    id TEXT PRIMARY KEY,
    avatar_filename TEXT NOT NULL UNIQUE,
    internal_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    card_json TEXT NOT NULL,
    shallow_json TEXT NOT NULL,
    world_name TEXT NOT NULL DEFAULT '',
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    deleted_at_ms INTEGER
);

CREATE TABLE character_chat_stats (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    chat_count INTEGER NOT NULL DEFAULT 0,
    chat_size_bytes INTEGER NOT NULL DEFAULT 0,
    date_last_chat_ms INTEGER NOT NULL DEFAULT 0,
    stats_updated_at_ms INTEGER NOT NULL
);

CREATE INDEX characters_avatar_filename_idx ON characters(avatar_filename);
CREATE INDEX characters_display_name_idx ON characters(display_name);
CREATE INDEX characters_world_name_idx ON characters(world_name);
CREATE INDEX character_chat_stats_last_chat_idx ON character_chat_stats(date_last_chat_ms);
```

Notes:

- Keep `avatar_filename` unique because current browser and extension contracts identify characters through PNG filenames.
- Add an internal `id` now so later chat-message and asset migrations do not depend forever on renamed filenames.
- Keep `card_json` as the canonical card payload for phase one; normalize only columns needed for hot-path queries and integrity checks.
- Keep `shallow_json` either as stored projection or generated-at-write projection. If stored, it is canonical projection state, not a rebuildable cache.

Migration strategy:

Phase 0: ADR And Decision Gate

Create a new ADR superseding the relevant project-overview guardrail for this specific storage direction. It should state:

- file-backed storage is no longer the exclusive canonical model for approved slices.
- `_cache` sidecars remain derived and disposable.
- compatibility file projection remains required until an explicit compatibility retirement decision.
- out-of-band file edits are no longer an automatic supported write path after cutover.

Phase 1: Shadow Import And Audit

Add the canonical SQLite manager and migration runner, but keep reads and writes file-backed.

Tasks:

- create/open `storage/emberdesk.sqlite` per user
- run idempotent SQL migrations
- import current character cards and chat stats into DB
- emit drift/audit reports comparing DB rows with current files
- add tests proving corrupt/missing DB does not silently rewrite or delete files

This phase proves migration safety without changing runtime behavior.

Phase 2: DB-First Reads Behind Feature Flag

Switch character list/get routes to read from the canonical DB when enabled:

- `/api/characters/all`
- `/api/characters/list`
- `/api/characters/get`

The route response shapes must remain unchanged. Filesystem fallback should be migration/recovery behavior, not the steady-state authority.

Phase 3: DB-First Writes With Compatibility Projection

Update create/edit/rename/edit-avatar/edit-attribute/merge/import/duplicate/delete paths:

1. validate request using existing guards
2. update canonical DB inside a transaction
3. project the compatibility PNG file and chat directory rename/copy/delete side effects
4. update or retire the derived character index path for the touched row

If DB commit succeeds but projection fails, return an explicit projection error and record repair state. Do not silently treat the projected file as authoritative.

Phase 4: Chat Stats Authority

Update `trySaveChat`, chat rename, chat delete, and chat import side effects to maintain `character_chat_stats` directly.

Message bodies may remain JSONL in this phase. The important cutover is that character-list stats come from DB-maintained stats, not directory scans or derived dirty-row rebuilds.

Phase 5: Retire Or Reclassify The Derived Index

After DB-first reads and writes are proven:

- remove `_cache/character-index.sqlite` from the character-list steady state, or
- keep it only for non-canonical query acceleration with a renamed role and clear invalidation rules.

The canonical DB must not share code paths or failure semantics with `derived-cache-sqlite.js`.

### Domain: World Info boundary

- User expectation: World Info 可以看情况加入，但不能提前破坏兼容性。
- Current status: only character-to-world binding belongs in the first slice; full World Info canonical migration is deferred.
- Change history:
  - 2026-07-07: 预研确认 full World Info migration 涉及 prompt activation、regex placement、converter/import result semantics 和 delete cascade，风险高于第一阶段目标。
- Implementation traceability:
  - Compatibility owner: `public/scripts/world-info.js`
  - Current derived lookup: `findCharactersBoundToWorld()` in `src/endpoints/character-index.js`
  - Delivery status: research only.

World Info recommendation:

Do not migrate full World Info entries in the first slice.

Allowed first-slice World Info work:

- store `characters.world_name`
- keep character-bound world lookup DB-backed for delete preflight
- maintain compatibility with existing world JSON files and `public/scripts/world-info.js`

Defer full World Info canonical migration until a separate design covers:

- global vs editor-selected worlds
- prompt activation and token budgeting
- regex placement values
- import/export converter behavior
- delete cascade and character-bound world cleanup
- third-party extension expectations

### Domain: technology choice

- User expectation: 技术栈可参考上传的 `react.md`，合适就引入 ORM。
- Current status: local/portable SQLite is recommended; Rust/Axum/Postgres is not recommended for this slice; ORM remains a later gate.
- Change history:
  - 2026-07-07: `react.md` was considered. Its local/portable SQLite guidance applies; its Rust/Axum/Postgres default does not fit this incremental Express-hosted migration.
- Implementation traceability:
  - Existing runtime owner: Express 5 under `server.js` and `src/server-main.js`
  - Existing SQLite driver surface: Node 26 `node:sqlite`
  - Delivery status: research only.

Technology choice:

From `react.md`, the applicable backend guidance is local/portable SQLite. The Rust/Axum/Postgres default is not a good fit for this slice because EmberDesk's current server runtime owner is Express 5 and the project has explicit route/middleware compatibility constraints.

Recommended stack for this migration:

- SQLite: yes, per-user canonical store outside `_cache`
- Runtime driver: start with Node 26 `node:sqlite` unless an ORM gate proves a better fit
- Validation: use existing `zod` where payload schemas need runtime validation
- Frontend stack: no change required
- Rust/Axum/SQLx: do not introduce for this slice
- PostgreSQL: do not introduce for self-hosted portable data

ORM recommendation:

- Do not adopt an ORM in Phase 1 by default.
- Add a narrow ORM decision gate before Phase 2.
- Drizzle is only suitable if it can preserve Node 26 runtime ownership, per-user SQLite files, transaction control, migration auditability, and Bun-managed dependency workflow without forcing a native runtime dependency or Bun-as-server execution.
- If Drizzle is adopted, use it for canonical schema and migrations only; do not retrofit the existing derived-cache sidecar.
- If Drizzle is rejected, use SQL migration files plus a small local query helper around `node:sqlite`.

### Domain: compatibility and validation

- User expectation: 目前仍不允许破坏兼容性；破坏兼容性放到最后再做。
- Current status: compatibility rules and validation plan defined.
- Change history:
  - 2026-07-07: 预研要求 first-slice implementation preserve `/api/characters/*` response shapes, import/export formats, chat JSONL export, World Info facade, and extension-visible globals.
  - 2026-07-07: 用户要求根据已接受 ADR 和 roadmap，把完整 Phase 0-5 进一步拆成多份可实施 `spec.md`，其中 migration runner、canonical store、read cutover、write projection、repair tooling 需要独立规格。
- Implementation traceability:
  - Compatibility proof candidates: `tests/character-read-service.test.js`, `tests/character-write-service.test.js`, `tests/chat-route-service.test.js`, `tests/third-party-extension-compatibility.test.js`
  - Delivery status: research complete; multi-spec drafting in progress, no runtime code changed.

Compatibility rules:

First-slice implementation must preserve:

- `/api/characters/*` response shapes
- character-list identity selectors and avatar filename contracts
- import/export formats for PNG, JSON, YAML, CHARX, and BYAF
- existing chat JSONL export behavior
- world-info facade behavior
- third-party extension-visible globals and browser module imports

Compatibility files can be projections, but they must remain available until a later explicit compatibility retirement.

Risks:

- Projection failure creates DB/file drift. This needs repair tooling and visible operator logs.
- Existing code often treats avatar filename as identity. Introducing internal IDs must be incremental.
- Out-of-band user edits will stop being automatic truth after cutover. This needs import/rescan tooling and documentation.
- Chat stats are easy to maintain on normal routes but can drift after external file changes or failed imports.
- World Info looks tempting because character rows already store `world_name`, but full migration touches high-risk prompt and extension behavior.
- A canonical DB needs stronger durability settings than the derived cache. `PRAGMA synchronous = NORMAL` is acceptable for rebuildable caches but should be revisited for canonical storage.

Validation plan:

Focused proof for Phase 1:

```bash
bun run --cwd tests test:unit -- character-read-service.test.js character-write-service.test.js chat-route-service.test.js --runInBand
bun run --cwd tests test:unit -- interaction-performance-index.test.js derived-cache-sqlite.test.js --runInBand
```

New tests should cover:

- migration creates schema and imports current character cards
- repeated migration is idempotent
- DB rows preserve existing character payload response shape
- chat save/rename/delete/import updates stats
- compatibility projection writes expected files after DB commit
- projection failure is reported and repairable
- feature flag off keeps current file-backed behavior during rollout

If World Info binding is included:

```bash
bun run --cwd tests test:unit -- worldinfo-delete-cascade.test.js world-info-shell-context.test.js --runInBand
bun run test:compat
```

Recommended next deliverable:

ADR-0011 and the canonical SQLite storage roadmap are now in place. The next implementation deliverable is Phase 1: shadow import and audit. Do not start with DB-first writes.

ADR-0011 explicitly changes only the old "file-backed is the canonical model" rule for approved slices, not the whole portability and compatibility strategy.

Spec decomposition requested for delivery:

- `Phase 0 contracts` docs and acceptance gate
- `canonical store manager`
- `migration runner`
- `shadow import and audit`
- `DB-first reads`
- `DB-first writes and compatibility projection`
- `repair tooling and rollout contract`
- `chat stats authority`
- `derived index retirement or reclassification`

## Non-Goals

- Do not promote `_cache/character-index.sqlite` to canonical storage.
- Do not promote `DiskCache` to canonical storage.
- Do not migrate chat message bodies in the first slice.
- Do not migrate full World Info entries in the first slice.
- Do not introduce Rust/Axum/Postgres for this slice.
- Do not break existing `/api/characters/*`, chat export, import/export, World Info, or extension-visible compatibility surfaces.
