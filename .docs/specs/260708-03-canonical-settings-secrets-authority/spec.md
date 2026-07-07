# Canonical Settings 与 Secrets Authority 迁移

## 意图与核心流程

一句话意图：把 settings 与 secrets 从 legacy file/store authority 迁移到 canonical SQLite，同时保持 React `/settings`、legacy settings drawer、provider secret UI 和安全边界不变。

主要参与者或触发条件：

- full World Info canonical migration 已完成
- 维护者准备执行 remaining structured user-data slices 的第一批
- settings 与 secrets 需要统一 authority、migration、audit、rollback 和 repair contract

主路径顺序：

1. 盘点 `src/endpoints/settings.js`、`src/endpoints/settings-cache.js`、`src/endpoints/secrets.js`、`src/user-storage.js` 和 React settings 现有 owner。
2. 设计 settings canonical table 与 secrets canonical table；secrets 必须保留当前 SecretManager/secret helper 边界。
3. Shadow import 当前 settings 和 secrets metadata，不改变 UI 或运行时行为。
4. DB-first reads behind flag，确保 `/settings` 与 legacy drawer payload 不变。
5. DB-first writes with projection/rollback；secrets 不得写入普通 settings payload。
6. 更新 docs 和 tests，证明 secrets 没有泄露到 logs、docs、browser storage 或普通 settings JSON。

## 范围 / 不做范围

本次要改变什么：

- settings authority 迁移到 canonical SQLite。
- secrets authority 迁移到 canonical SQLite 或 canonical secret-backed store，具体实现必须保留 SecretManager API，不暴露明文。
- `/settings` React page 和 legacy drawer 继续共存，保存语义不变。

明确推迟什么：

- 不迁移 vectors、assets、personas、backgrounds、extension storage。
- 不迁移 chat message bodies。
- 不删除 legacy settings UI fallback。

第一个可交付切片：

- settings shadow import/audit + DB-first read parity；secrets 可以先做 read/status parity，再做 write cutover。

## 边界规则 / 验收

验收项：

1. `/settings` 页面、legacy settings drawer 和 API Configuration drawer 的用户可见字段行为不变。
2. React-owned settings coverage ledger 仍只改它声明 owned 的字段。
3. Secret fields 仍通过 server-side secret route/helper 保存，不进入普通 settings response、日志、docs 或 browser storage。
4. DB-first writes 的 projection failure 必须 fail closed，并提供 operator-visible repair 状态。
5. Flag off 时，当前 file-backed/settings store 行为保持可用。
6. Migration/audit 能识别 settings payload drift 和 missing secret keys。

失败边界：

- 任意将 secret 明文写入 `.docs/`、logs、普通 settings JSON、browser local storage 的路径都阻塞交付。
- 如果 React settings 与 legacy drawer 对同一字段 owner 冲突，必须先更新 coverage ledger 和 semantic docs。

## 架构 / 约束

- 使用现有 `SecretManager` 和 exported secret helpers；不得直接读写 `secrets.json`。
- Express middleware/auth/CSRF 顺序不变。
- settings cache 若保留，只能是 derived/read-through cache，不能成为 authority。
- 任何新增 flag 必须与 canonical rollout contract 顺序一致。

## 数据 / 集成

建议 schema 方向：

- `settings_documents(handle, namespace, payload_json, version, updated_at_ms)`
- `secret_records(handle, key, encrypted_payload, metadata_json, updated_at_ms)` 或等价 SecretManager-backed canonical table
- `settings_projection_repairs(...)`
- `canonical_audit_state` slice key 增加 `settings` / `secrets`

集成点：

- `src/endpoints/settings.js`
- `src/endpoints/settings-cache.js`
- `src/endpoints/secrets.js`
- `public/scripts/secrets.js`
- React settings route / settings feature tests

## 验证

执行：

```bash
bun run --cwd tests test:unit -- settings-get-route.test.js settings-cache.test.js settings-react-route.test.js secrets-migration.test.js secrets-input-map.test.js provider-secret-field-state.test.js --runInBand
bun run --cwd tests test:unit -- canonical-sqlite-migrations.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-operator.test.js --runInBand
bun run docs:check
```

新增 focused proof：

- settings shadow import idempotency
- settings DB-first read parity
- settings DB-first write projection failure
- secret migration without plaintext leak
- flag-off rollback

## Doc ID 契约

- `page.settings`：React settings page。
- `page.api_configuration`：legacy provider/secret drawer。
- `feature.custom_base_url`、`feature.fallback_provider`、`feature.provider_secret_field_state` 如现有 docs 存在则同步；不存在时只更新拥有该语义的现有 doc。

## 参考资料

- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/db/pages/settings.md`
- `.docs/db/pages/api-configuration.md`
- `.docs/tech/provider-secret-field-state.md`
- `src/endpoints/settings.js`
- `src/endpoints/settings-cache.js`
- `src/endpoints/secrets.js`
- `public/scripts/secrets.js`
- `tests/settings-react-route.test.js`
- `tests/secrets-migration.test.js`
