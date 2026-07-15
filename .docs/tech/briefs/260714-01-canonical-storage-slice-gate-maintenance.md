---
created: 2026-07-14
source: user
confirmed: true
last_updated: 2026-07-14
feature_slug: canonical-storage-slice-gate-maintenance
status: delivered
---

# Canonical Storage Slice Gate Maintenance Intent

## 目标结果

补齐已交付 storage control plane 的维护性缺口：让每个已注册 slice 可选择独立 flags，
未声明独立 flags 的旧 slice 继续使用现有 global fallback；同时让 migration tests 验证
目标 domain 的 migration contract，而不是硬编码整个 migration catalog 的最终版本。

## 代码事实

- migrations 当前已到 v6；部分 settings/secrets 测试仍硬编码 v5，新增无关 migration
  就会误报失败。
- registry 已包含 characters、world_info、settings、secrets、managed_media。
- 只有 managed media 已有独立 per-slice flags；其余 slice 仍依赖 global flags。

## 约束

- 不迁移新业务数据，不改变现有默认 flag 语义。
- characters 与 World Info 的旧配置必须继续工作。
- registry、operator、backup/restore readiness 保持单一共享合同。

## 验收标准

- 通用 resolver 支持 per-slice override 和 backward-compatible global fallback。
- domain tests 不再依赖无关 migration 的最终版本号。
- 新 chat slice 可以复用同一 flag、operator、backup contract，而无需复制分支。

## 非目标

- 不启用任何默认关闭的 canonical authority。
- 不重构全部配置系统或引入新的 feature-flag framework。

## 参考资料

- `src/storage-feature-flags.js`
- `src/canonical-storage-slice-registry.js`
- `src/canonical-sqlite-migrations.js`
- `tests/canonical-settings-store.test.js`
- `tests/canonical-secrets-store.test.js`

## Final Implementation Trace

Delivered through `src/storage-feature-flags.js`,
`src/canonical-storage-slice-registry.js`, and
`src/canonical-sqlite-operator.js`; durable behavior is described in
`../canonical-sqlite-storage-roadmap.md` and
`../../db/pages/settings.md`.
