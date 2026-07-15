# Canonical Storage Slice Gate Maintenance

## 意图与核心流程

一句话意图：把已交付 canonical storage control plane 补齐为可长期扩展的 per-slice
gate contract，并消除 migration tests 对无关 catalog 版本的脆弱依赖。

配置解析先读取 slice-specific flags；未配置时回退现有 global flags。Registry descriptor
声明 flag key、audit、repair、rollback 和 backup capabilities，operator 与 route adapters
使用同一 resolver。Migration tests 改为断言目标 migration 已应用及 domain schema 可用。

## 范围 / 不做范围

本阶段包括：

- 通用 slice flag resolver 与 registry descriptor contract。
- characters、world_info、settings、secrets、managed_media 的兼容接入。
- migration test helper，按 migration ID/domain schema 断言。
- 为后续 chat slices 提供注册、operator、backup readiness 接口。

本阶段不包括：

- 不迁移新业务数据、不启用默认关闭 flags。
- 不修改 route payload、不重构 config parser。

## 边界规则 / 验收

R1: Slice-specific flag 缺失时必须保持现有 global flag 语义，已有配置无需迁移。

R2: Slice-specific flag 显式设置时只影响该 slice，不能改变无关 slice 状态。

R3: Registry 是 flag、audit、repair、rollback、backup capability 的单一描述入口。

R4: Domain migration tests 必须断言其所需 migration/schema，不得硬编码整个 catalog 最终版本。

R5: Operator status 必须同时报告 effective flags 与来源，避免 global fallback 和 override 歧义。

R6: 新 resolver 的错误配置必须 fail closed，并给出稳定 reason code。

## 架构 / 约束

- 保留 `src/storage-feature-flags.js` 和 registry/operator 现有责任边界。
- characters/World Info 的共享 flag 行为是兼容合同。
- 不增加依赖；使用现有 config 与纯 helper 模式。

## 数据 / 集成

不新增 canonical 业务表。可能新增 registry descriptor 字段、flag snapshot helper 和
test-only migration assertion helper。

主要集成点：

- `src/storage-feature-flags.js`
- `src/canonical-storage-slice-registry.js`
- `src/canonical-sqlite-operator.js`
- `src/canonical-sqlite-migrations.js`

## 验证

```bash
bun run --cwd tests test:unit -- canonical-storage-slice-registry.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-operator.test.js canonical-sqlite-migrations.test.js canonical-settings-store.test.js canonical-secrets-store.test.js canonical-managed-media-store.test.js --runInBand
bun run docs:check
```

## Doc ID 契约

本阶段不改变用户可见页面、feature 或 term，不绑定 Doc ID。

## 参考资料

- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `default/config.yaml`
- `src/storage-feature-flags.js`
- `src/canonical-storage-slice-registry.js`

