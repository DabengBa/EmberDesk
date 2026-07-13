# Canonical Storage Control Plane

## 意图与核心流程

一句话意图：把 character 与 World Info 已交付的 canonical SQLite rollout 机制收敛为按 slice 注册、隔离和查询的通用控制面，为后续数据库权威迁移提供共同但不混责的基础。

维护者先注册 slice 的 migration、audit、repair、flag 和 rollback 合同；运行时再按用户与 slice 查询 readiness，执行 shadow audit、切换或修复；任一 slice 失败只阻断该 slice 的 authority cutover。

## 范围 / 不做范围

本阶段包括：

- 通用 slice registry、状态模型和合法 flag 组合。
- 按 slice 聚合 migration readiness、audit summary、open repairs、rollback blockers、backup/restore readiness。
- 扩展现有 operator API/CLI，使 character 与 World Info 先迁入通用合同。
- 保留现有 per-user `storage/emberdesk.sqlite`、migration runner 和事务边界。

本阶段不包括：

- 不迁移 settings、secrets、media、personas、extensions、chats 或 vectors 的业务数据。
- 不新增管理 UI、ORM、外部数据库、后台任务系统或跨用户数据库。
- 不把所有 slice 的 repair schema 强制合成一个业务表。

## 边界规则 / 验收

R1: 每个 canonical slice 必须以稳定 key 注册 migration readiness、audit scope、read/write gates、repair source 和 rollback blocker resolver；重复 key 或缺失必需能力时启动或测试必须失败。

R2: 一个 slice 的 `blocked` audit、migration failure 或 open repair 不得把无关 slice 的只读状态、audit 或 repair 操作判为不可用。

R3: operator status 必须按用户输出每个 slice 的 enabled/readiness/audit/repair/rollback/backup-restore 状态，并保持 machine-readable、无用户内容和 secret 明文。

R4: character 与 World Info 的现有 flag legality、persisted audit gate、projection repair 和 rollback 语义迁入通用控制面后保持行为等价。

R5: backup/restore readiness 只声明数据库与受管文件清单是否一致；控制面不得在未审计时自动覆盖数据库或 compatibility files。

R6: 后续 slice 能通过注册合同接入，而不修改 character/World Info 专用分支或复制一套 rollout 判定。

## 架构 / 约束

- `src/canonical-sqlite.js` 继续拥有数据库打开、关闭、PRAGMA 和事务。
- `src/canonical-sqlite-migrations.js` 继续拥有 forward-only schema journal。
- 通用控制面应从 `src/canonical-sqlite-rollout-contract.js` 与 `src/canonical-sqlite-operator.js` 的现有模式演进，不重用 `src/derived-cache-sqlite.js`。
- registry 只描述能力和调用边界，不承载业务 schema 或领域转换逻辑。
- 默认关闭与 fail-closed 语义保持；非法 flag 组合不得降级为模糊 fallback。

## 数据 / 集成

预期数据合同：

- 稳定 slice key，例如 `characters`、`world_info`、后续 `settings`。
- 通用 audit summary 继续使用 `canonical_audit_state` 的 scope 隔离。
- repair 可保留领域表，但通过统一 descriptor 公开 count、status、replay 和 blocker。
- backup manifest 至少记录 schema version、slice versions、managed-file manifest version 和创建时间，不记录 secret value。

主要集成点：

- `src/canonical-sqlite-rollout-contract.js`
- `src/canonical-sqlite-operator.js`
- `src/canonical-sqlite-migrations.js`
- `scripts/canonical-sqlite-audit.mjs`
- `scripts/canonical-sqlite-repair.mjs`
- `src/storage-feature-flags.js`

## 验证

```bash
bun run --cwd tests test:unit -- canonical-storage-slice-registry.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-operator.test.js canonical-sqlite-cli.test.js canonical-world-info-store.test.js character-read-service.test.js character-write-service.test.js --runInBand
bun run docs:check
```

证据必须覆盖重复注册、跨 slice 隔离、operator 输出净化、character/World Info 回归、backup readiness 与非法 flag 组合。

## Doc ID 契约

本阶段不改变用户可见页面、工作流或术语，不新增 Doc ID。实施文档更新归 `.docs/tech/canonical-sqlite-storage-roadmap.md` 和相关逻辑说明所有。

## 参考资料

- `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `src/canonical-sqlite.js`
- `src/canonical-sqlite-migrations.js`
- `src/canonical-sqlite-rollout-contract.js`
- `src/canonical-sqlite-operator.js`
- `src/endpoints/character-read-service.js`
- `src/endpoints/worldinfo.js`
- Inference: 通用 registry 是从两个已交付 slice 的重复 rollout 责任中提取的最小复用边界，不是新的业务抽象层。
