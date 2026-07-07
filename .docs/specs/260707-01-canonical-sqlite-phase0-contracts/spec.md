# Canonical SQLite Phase 0 Contracts

## 意图与核心流程

一句话意图：把 ADR-0011、roadmap、项目级文档和后续 spec 的契约补齐到“可以直接进入分阶段实现”的状态。

主要参与者或触发条件：

- 维护者接受 `ADR-0011`
- 后续实现 agent 需要明确的阶段边界、依赖顺序、feature flag、rollback 规则和文档责任

主路径顺序：

1. 核对 `ADR-0011`、`.docs/tech/canonical-sqlite-storage-roadmap.md`、`.docs/project-overview.md`、`.docs/PROJECT_HISTORY.md` 是否表达同一架构结论。
2. 明确第一切片只覆盖 `character metadata + character chat stats`。
3. 明确 `_cache/character-index.sqlite` 和 `DiskCache` 仍是 derived，不得原地升级为 canonical。
4. 明确后续实现必须按 `store manager -> migration runner -> shadow import/audit -> reads -> writes/projection -> repair -> chat stats -> retirement` 推进。
5. 产出后续 Phase 1-5 的独立 `spec.md`，作为唯一实现输入。

## 范围 / 不做范围

本次要改变什么：

- 把 canonical SQLite 路线从“被接受的方向”收紧为“可执行的分阶段合同”。
- 固化阶段验收、依赖顺序、feature flag 命名、rollback 前提和文档同步责任。
- 明确每个阶段由哪份独立 spec 负责。

不做范围：

- 不写任何运行时代码。
- 不新增 schema、DB helper、route 改造或 repair script 实现。
- 不重新讨论是否接受 canonical SQLite；该决策已由 `ADR-0011` 接受。
- 不把 full World Info、chat message bodies、settings、secrets、vectors、assets、backgrounds、extensions 纳入第一切片。

第一个可交付切片：

- 先把完整 Phase 0-5 拆成独立 spec，并要求后续实现严格按 spec 执行。

## 边界规则 / 验收

验收项：

1. `ADR-0011`、roadmap、project overview、project history 之间没有相互矛盾的 authority 描述。
2. 至少存在以下独立 spec：
   - `Phase 0 contracts`
   - `canonical store manager`
   - `migration runner`
   - `shadow import and audit`
   - `DB-first reads`
   - `DB-first writes and compatibility projection`
   - `repair tooling and rollout contract`
   - `chat stats authority`
   - `derived index retirement or reclassification`
3. 每份 spec 都使用 `zh-Hans`，并包含可执行的验收、约束、验证和参考资料。
4. 所有 spec 都明确兼容性仍是硬边界：
   - `/api/characters/*` payload 不变
   - PNG import/export 保留
   - chat JSONL export 保留
   - World Info facade 保留
   - extension-visible globals / `@sillytavern/*` 保留
5. 所有 spec 都明确 canonical DB 不得放进 `_cache`，也不得复用 `src/derived-cache-sqlite.js` 的 reset/delete 语义。
6. `bun run docs:check` 通过。

失败边界：

- 如果任何项目级文档与 `ADR-0011` 冲突，Phase 0 不通过，后续实现不得开始。
- 如果 spec 之间对 feature flag、authority 边界或 rollback 条件定义不一致，Phase 0 不通过。

## 架构 / 约束

- 本阶段只负责文档合同，不引入实现细节的自由发挥空间。
- 后续实现不得绕过 Phase 1 shadow import/audit 直接做 DB-first writes。
- 后续实现不得把 `_cache/character-index.sqlite` 当成 canonical fallback。
- 后续实现不得新增与现有 repo 模式无关的服务宿主；Express 5 仍是 runtime owner。
- feature flag 名称固定为 roadmap 中已接受的命名：
  - `features.storage.canonicalSqlite.enabled`
  - `features.storage.canonicalSqlite.shadowImport`
  - `features.storage.canonicalSqlite.reads`
  - `features.storage.canonicalSqlite.writes`
  - `features.storage.canonicalSqlite.chatStats`
  - `features.storage.canonicalSqlite.strict`

## 数据 / 集成

本阶段不引入新数据结构，但要固定以下集成边界：

- canonical DB 目标位置：`DATA_ROOT/<handle>/storage/emberdesk.sqlite`
- per-user 根路径仍由 `getUserDirectories(handle)` 派生
- character 读路径绑定点：`src/endpoints/character-read-service.js`
- character 写路径绑定点：`src/endpoints/character-write-service.js` 与 `src/endpoints/characters.js`
- chat stats 绑定点：`src/endpoints/chats.js`
- derived index 现有边界：`src/endpoints/character-index.js`

文档同步责任：

- `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/project-overview.md`
- `.docs/PROJECT_HISTORY.md`
- 本批 `.docs/specs/260707-0x-*/spec.md`

## 验证

执行：

```bash
bun run docs:check
```

人工检查证据：

- `ADR-0011`、roadmap、project overview、project history 对 canonical SQLite 的描述一致。
- 所有 spec 路径存在且内容完整。
- 任何一个实现 agent 仅读取 spec 即可推导依赖顺序和阶段边界，无需再反向解读 roadmap。

## Doc ID 契约

无新增 semantic Doc ID。

现有用户可见 surface 仍由以下 Doc ID 继续拥有：

- `feature.character_library_panel`
- `page.chat_workspace`
- `feature.world_info_panel`
- `feature.character_delete`
- `feature.world_book_delete`

本阶段只补充架构与交付合同，不新增新的用户可见能力命名。

## 参考资料

- `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/project-overview.md`
- `.docs/PROJECT_HISTORY.md`
- `.docs/tech/briefs/260707-01-canonical-sqlite-character-metadata-chat-stats.md`
- `src/endpoints/character-read-service.js`
- `src/endpoints/character-write-service.js`
- `src/endpoints/chats.js`
- `src/endpoints/character-index.js`
- `src/user-directories.js`

