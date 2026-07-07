---
created: 2026-07-07
source: user
confirmed: true
last_updated: 2026-07-07
---

# Canonical SQLite Repair Tooling And Rollout Contract Intent

## User Original Request

用户要求围绕 `260707-07-canonical-sqlite-repair-rollout-contract` 完成完整交付，并继续遵守以下边界：

- 当前仍不允许破坏兼容性。
- 这一轮是 canonical SQLite 迁移中的 operator / contract 层，不新增管理 Web UI。
- 需要把 repair tooling、feature flag / rollback contract、validation guidance、项目级文档同步一起落地。
- 需要做多角度 review、结合实际代码更新文档，并在 closeout 前保持工作区清爽。

## Background & Motivation

在 canonical SQLite 已经进入 character metadata 第一阶段后，运行时 authority、projection compatibility、audit drift 和 rollback 前提已经不再只是局部实现细节。如果这些规则继续分散在 read/write 逻辑里，operator 无法稳定判断：

- 哪些 flag 组合是合法的
- 什么情况下可以安全回退
- projection failure 之后该如何修复
- strict / CI 语境下哪些错误必须 fail-closed

这次工作的目标是把这些运维与交付合同单独收口成明确、可执行、可验证的 operator surface，同时不改变现有外部 API shape，也不把 repair tooling 扩展成通用数据库管理平台。

## Intent Domains

### Domain: rollout and rollback contract

- User expectation: canonical SQLite 当前切片的启用顺序、组合限制和 rollback blocker 必须有单独合同，而不是隐藏在 reads/writes 实现里。
- Current status: delivered.
- Change history:
  - 2026-07-07: 用户要求把 feature flag / rollback 策略从原则升级为可执行 rollout contract。
  - 2026-07-07: 实现 `src/canonical-sqlite-rollout-contract.js`，集中定义合法 flag 顺序、illegal combination、persisted audit blocker 和 open projection repair blocker。
- Implementation traceability:
  - Code: `src/canonical-sqlite-rollout-contract.js`, `src/endpoints/characters.js`, `src/endpoints/character-read-service.js`
  - Proof: `tests/canonical-sqlite-rollout-contract.test.js`, `tests/character-read-service.test.js`, `tests/character-write-service.test.js`
  - Delivery status: delivered; write path strict gate now fail-closed instead of silent file-backed fallback.

### Domain: operator audit and repair tooling

- User expectation: operator 可以显式查看 drift / blockers，并按需执行 repair；系统不应在后台 silent repair。
- Current status: delivered for the first canonical slice.
- Change history:
  - 2026-07-07: 用户要求 repair tooling 作为单独 spec 落地，并以 CLI / operator workflow 为主。
  - 2026-07-07: 实现 `scripts/canonical-sqlite-audit.mjs` 与 `scripts/canonical-sqlite-repair.mjs`，支持 `audit`、`list-repairs`、`repair-projection`、`rebuild-chat-stats`、`explain-blockers`。
  - 2026-07-07: 实现 `src/canonical-sqlite-operator.js`，把 audit、repair、chat-stats rebuild、blocker explain 收口为共享 operator helper。
- Implementation traceability:
  - Code: `scripts/canonical-sqlite-audit.mjs`, `scripts/canonical-sqlite-repair.mjs`, `src/canonical-sqlite-operator.js`, `src/endpoints/character-store.js`, `src/canonical-sqlite-shadow-import.js`
  - Proof: `tests/canonical-sqlite-cli.test.js`, `tests/canonical-sqlite-operator.test.js`, `tests/canonical-sqlite-shadow-import.test.js`
  - Delivery status: delivered; read-only audit remains explicit and repair failures preserve DB/files in place.

### Domain: repair visibility and authority safety

- User expectation: projection failure、DB/file drift 和 unresolved repair 必须在 operator surface 上可见，并阻止不安全 rollback。
- Current status: delivered for current slice.
- Change history:
  - 2026-07-07: audit 覆盖面扩展到 DB-only rows、missing projection files、soft-deleted rows 仍残留 projection、open projection repairs。
  - 2026-07-07: projection repair metadata 增强为可 replay；repair 成功后显式使 persisted audit 状态失效，要求重新 audit。
- Implementation traceability:
  - Code: `src/canonical-sqlite-shadow-import.js`, `src/endpoints/character-store.js`, `src/canonical-sqlite-operator.js`
  - Proof: `tests/canonical-sqlite-shadow-import.test.js`, `tests/canonical-sqlite-operator.test.js`
  - Delivery status: delivered; rollback blockers now follow audit + repair truth instead of inferred runtime optimism.

### Domain: validation and durable project docs

- User expectation: rollout/repair proof lane 应进入项目验证指导，并同步到 overview / ADR / project history 等持久文档。
- Current status: delivered.
- Change history:
  - 2026-07-07: `src/validation-gate-selector.js` 新增 canonical storage rollout/repair gate。
  - 2026-07-07: 项目级文档已同步当前 contract、operator entry points、chatStats boundary 和 rollback blocker 语义。
- Implementation traceability:
  - Code: `src/validation-gate-selector.js`
  - Docs: `.docs/tech/canonical-sqlite-storage-roadmap.md`, `.docs/tech/validation-gate-selector.md`, `.docs/project-overview.md`, `.docs/adr/0011-canonical-per-user-sqlite-storage.md`, `.docs/PROJECT_HISTORY.md`
  - Proof: `tests/validation-gate-selector.test.js`, `bun run docs:check`
  - Delivery status: delivered.

## Boundaries

- 不新增 Web 管理台或浏览器操作界面。
- 不改变外部 API payload shape。
- 不把 repair tooling 扩展为通用数据库运维平台。
- 不在这一轮启用 compatibility-breaking 行为。

## Delivery Snapshot

- Delivered code paths:
  - `src/canonical-sqlite-rollout-contract.js`
  - `src/canonical-sqlite-operator.js`
  - `scripts/canonical-sqlite-audit.mjs`
  - `scripts/canonical-sqlite-repair.mjs`
- Delivered proof:
  - `bun run --cwd tests test:unit -- character-write-service.test.js canonical-sqlite-cli.test.js canonical-sqlite-operator.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-shadow-import.test.js character-read-service.test.js validation-gate-selector.test.js --runInBand`
  - `bun run docs:check`
  - `node scripts/canonical-sqlite-audit.mjs --help`
  - `node scripts/canonical-sqlite-repair.mjs --help`
- Commit traceability: wrap-up commit `feat(storage): arm canonical rollout repair contracts for operators`
- Delivery status: delivered and ready for wrap-up archival.
