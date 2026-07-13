---
created: 2026-07-13
source: user
confirmed: true
last_updated: 2026-07-13
feature_slug: canonical-storage-control-plane
status: delivered
---

# Canonical Storage Control Plane Intent

## 目标结果

把 character 与 World Info 已交付的 canonical SQLite rollout、audit、repair 和 rollback
模式扩展成可注册、可隔离的通用 slice 控制面，为全面数据库化提供共同基础。

## 约束

- 不在本阶段迁移新的业务数据域。
- 保留 `src/canonical-sqlite.js`、migration runner 和 operator CLI 的现有责任。
- 每个 slice 必须有独立状态、flag legality、audit scope、repair type 和 rollback blockers。
- 不能让一个 slice 的 drift 阻断无关 slice 的只读或修复操作。

## 验收标准

- 后续 settings、secrets、media、persona、extension、chat 和 vector specs 可复用同一注册合同。
- Operator status、audit、repair、backup/restore readiness 能按 slice 查询。
- 已交付 character 与 World Info 行为保持兼容。

## 非目标

- 不新增用户可见 UI。
- 不引入 ORM、外部数据库或异步 job system。

## 参考资料

- `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `src/canonical-sqlite-rollout-contract.js`
- `src/canonical-sqlite-operator.js`
- `src/canonical-sqlite-migrations.js`

## Delivery Trace

- Code: `src/canonical-storage-slice-registry.js`, `src/canonical-sqlite-rollout-contract.js`, `src/canonical-sqlite-operator.js`, `src/endpoints/characters.js`, `src/endpoints/worldinfo.js`, `scripts/canonical-sqlite-repair.mjs`, `scripts/canonical-sqlite-audit.mjs`
- Tests: `tests/canonical-storage-slice-registry.test.js`, `tests/canonical-sqlite-operator.test.js`, `tests/canonical-sqlite-cli.test.js`, character/World Info route regressions
- Owning docs: `.docs/tech/canonical-sqlite-storage-roadmap.md`, `.docs/tech/canonical-sqlite-store-manager.md`, `.docs/PROJECT_HISTORY.md`, `.docs/project-overview.md`, ADR-0011
