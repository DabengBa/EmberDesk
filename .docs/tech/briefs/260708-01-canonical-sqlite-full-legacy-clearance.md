---
created: 2026-07-08
source: user
confirmed: true
last_updated: 2026-07-08
---

# Canonical SQLite Full Legacy Clearance Intent

## User Original Request

用户要求根据 `.docs/tech/canonical-sqlite-storage-roadmap.md`，以“完全完整彻底实现并清除 legacy”为目标，分阶段、分步骤编写多个 `spec.md` 开发设计文档。

用户指定后续工作顺序：

1. legacy-mode accelerator 退休
2. full World Info canonical migration
3. settings / secrets / vectors / assets / personas / backgrounds / extension storage
4. chat message bodies

## Background & Motivation

EmberDesk 已经交付 ADR-0011 首个 canonical SQLite 切片：character metadata + character chat stats。当前剩余问题不再是是否接受 SQLite authority，而是把后续 storage authority 迁移拆成可交付、可回滚、可验证的多个规格，最终清除旧的 legacy authority 与 derived accelerator 依赖。

本轮只产出设计规格，不开始实现。`清除 legacy` 在本轮规格中按 roadmap 解释为清除旧 authority、旧 accelerator 和未受控文件真源路径；兼容性 projection、import/export、扩展可见 API 和必要 rollback facade 只有在对应规格明确验收并验证后才能删除。

## Intent Domains

### Domain: legacy-mode accelerator retirement

- User expectation: 先退休 `_cache/character-index.sqlite` 的 legacy-mode accelerator，使 character metadata + chat stats 不再依赖 derived sidecar。
- Current status: roadmap 已将该项列为首个后续阶段；canonical read mode 已经不会把 sidecar 作为 authority fallback。
- Change history:
  - 2026-07-08: 用户确认后续第一步是 legacy-mode accelerator 退休。
  - 2026-07-08: 交付第一阶段实现，`_cache/character-index.sqlite` 从正常 character read/list/get、character write/import、chat mutation、World Info delete preflight/cascade、server startup/shutdown 路径退休。
- Implementation traceability:
  - Code paths: `src/endpoints/character-read-service.js`, `src/endpoints/characters.js`, `src/endpoints/worldinfo.js`, `src/endpoints/chats.js`, `src/endpoints/character-write-service.js`, `src/endpoints/character-import-service.js`, `src/server-main.js`, `src/validation-gate-selector.js`
  - Durable docs: `.docs/tech/canonical-sqlite-storage-roadmap.md`, `.docs/tech/interaction-performance-indexing.md`, `.docs/tech/derived-cache-sqlite.md`, `.docs/project-overview.md`, `.docs/PROJECT_HISTORY.md`, `.docs/db/features/character-library-panel.md`, `.docs/db/pages/chat-workspace.md`
  - Delivery status: delivered in the legacy accelerator retirement wrap-up; final trace is the repository commit created during this delivery workflow.

### Domain: full World Info canonical migration

- User expectation: 第二步迁移 full World Info authority，而不是只保留 character-to-world binding。
- Current status: 已交付 canonical World Info authority；`public/scripts/world-info.js` 继续作为兼容 facade，运行时 authority 可在 clean `world_info` audit 与 canonical read/write flags 后切到 SQLite。
- Change history:
  - 2026-07-08: 用户确认 full World Info canonical migration 是第二阶段。
  - 2026-07-08: 交付第二阶段实现，新增 `world_books` / `world_book_entries` / `world_info_projection_repairs`，World Info list/get/import/edit/delete 支持 canonical SQLite authority、JSON projection repair、rollback blocker 和 operator CLI。
- Implementation traceability:
  - Code paths: `src/canonical-sqlite-migrations.js`, `src/endpoints/world-info-store.js`, `src/canonical-world-info-shadow-import.js`, `src/endpoints/worldinfo.js`, `src/canonical-sqlite-operator.js`, `scripts/canonical-sqlite-audit.mjs`, `scripts/canonical-sqlite-repair.mjs`
  - Durable docs: `.docs/tech/canonical-sqlite-storage-roadmap.md`, `.docs/adr/0011-canonical-per-user-sqlite-storage.md`, `.docs/project-overview.md`, `.docs/PROJECT_HISTORY.md`, `.docs/db/features/world-info-panel.md`, `.docs/db/features/world-book-delete.md`, `.docs/logic-description/canonical_world_info_authority_processing_flow.md`
  - Validation: `bun run --cwd tests test:unit -- canonical-world-info-store.test.js worldinfo-route-service.test.js canonical-sqlite-operator.test.js canonical-sqlite-cli.test.js canonical-sqlite-migrations.test.js worldinfo-delete-cascade.test.js world-info-converters.test.js world-info-import-results.test.js world-info-shell-context.test.js --runInBand`; `uv run python .docs/logic-description/canonical_world_info_authority_sandbox_proof.py`; `bun run docs:check`
  - Delivery status: delivered in the canonical World Info authority wrap-up; final trace is the repository commit created during this delivery workflow.

### Domain: remaining structured user-data slices

- User expectation: 第三阶段覆盖 settings、secrets、vectors、assets、personas、backgrounds 和 extension storage。
- Current status: roadmap 要求这些 domain 独立验证，不能做成一个无法回滚的单体迁移。
- Change history:
  - 2026-07-08: 用户确认这些 structured slices 是 chat message bodies 之前的第三阶段。
- Implementation traceability:
  - Owner candidates: `src/endpoints/settings.js`, `src/endpoints/secrets.js`, `src/endpoints/vectors.js`, `src/endpoints/assets.js`, `src/endpoints/backgrounds.js`, `src/endpoints/extensions.js`, `public/scripts/personas.js`, `public/scripts/backgrounds.js`, `public/scripts/extensions.js`
  - Delivery status: decomposed into four specs; implementation should start only after explicit approval and delivery-workflow handoff.

### Domain: chat message bodies

- User expectation: 最后迁移 chat message bodies。
- Current status: chat stats authority 已交付，但 message bodies 仍是 JSONL；roadmap 明确 message bodies 是更高容量、更高持久化要求的独立阶段。
- Change history:
  - 2026-07-08: 用户确认 chat message bodies 是后续迁移的第四大阶段。
- Implementation traceability:
  - Owner candidates: `src/endpoints/chats.js`, `src/endpoints/chat-route-service.js`, `src/endpoints/chat-import-service.js`, `src/endpoints/chat-backup-helpers.js`, `public/scripts/chats.js`
  - Delivery status: spec-ready; implementation should start only after explicit approval and delivery-workflow handoff.

## Non-Goals

- 不在 brainstorming 阶段写运行时代码。
- 不把 compatibility projection、import/export、扩展 API 或 rollback facade 当作 incidental cleanup 删除。
- 不引入 Rust、Axum、PostgreSQL 或新的 server host；Express 5 和 Node 26 `node:sqlite` 仍是当前约束。
- 不把所有 structured slices 合并成一个不可分阶段验证的实现。
