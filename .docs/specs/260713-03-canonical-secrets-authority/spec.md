# Canonical Secrets Authority

## 意图与核心流程

一句话意图：让 canonical SQLite 成为 secret records、labels、active selection 和 rotation state 的权威源，同时维持 `SecretManager`、masking 与 exposure gate 为唯一访问边界。

启动或首次访问时，`SecretManager` 在 secrets slice audit-clean 后从数据库读取；迁移先解析现有 flat/array `secrets.json` 并保留 IDs 与 active 语义；所有新增、删除、重命名、切换和读取继续经 manager 完成，兼容文件只作为受控 projection/rollback surface。

## 范围 / 不做范围

本阶段包括：

- Secret record、key、value、label、active state 与 migration marker。
- Flat-format、CUSTOM-to-OPENAI 等现有迁移行为。
- Shadow import/audit、DB-first manager backend、projection repair、rollback blocker。
- 普通 API 返回的 masked state 与允许暴露 key 的现有例外。

本阶段不包括：

- 不把 secrets 合并进 settings 或 extension namespace。
- 不宣称 SQLite 自动提供 at-rest encryption。
- 不新增密钥托管服务、主密码、系统 keychain 或新 UI。
- 不改变 provider transport 或 secret field ownership。

## 边界规则 / 验收

R1: `secrets.json` 的 flat 与 array 格式必须幂等迁移；现有 record ID、label、active 唯一性和 migration markers 保持或以明确映射记录。

R2: 所有运行时 secret 读写只能通过 `SecretManager` 与既有 exported helpers；endpoint、provider adapter 和 extension 不得直接查询 secret tables。

R3: `allowKeysExposure=false` 时，非 `EXPORTABLE_KEYS` 的 value 不得出现在普通 response、日志、audit、repair、docs、browser storage 或测试快照。

R4: write flag 开启后，新增、删除、重命名与 active rotation 在一个数据库事务中维持每个 key 至多一个 active record；失败不得留下半完成状态。

R5: compatibility projection 失败必须记录不含明文的 repair intent 并阻断 rollback；repair replay 从数据库生成文件，不反向接受文件为真源。

R6: flag off 时当前 `SecretManager` 文件 backend 可用；canonical write 后回滚必须 audit clean、projection current 且无 open repair。

R7: API Configuration 中 masked/active/label 行为及 provider secret field state 保持，现有 CUSTOM-to-OPENAI migration 不丢值或错误激活。

## 架构 / 约束

- 依赖 canonical storage control plane；不依赖 settings document 内容。
- `SecretManager` 内部可选择 backend adapter，但 public methods 和 helper exports 保持。
- audit 输出只比较 key、record ID、label、active、value hash/存在性，不输出 value。
- 数据库备份也包含明文 secret 的现有风险；文档必须如实说明，不把存储迁移描述为加密。

## 数据 / 集成

建议 schema：

- `secret_records(id, secret_key, value, label, active, created_at_ms, updated_at_ms)`
- unique partial/index contract 保证每个 `secret_key` 至多一个 active row。
- `secret_projection_repairs(...)` 只保存 record IDs、operation、error class 和时间。

主要集成点：

- `src/endpoints/secrets.js`
- `public/scripts/secrets.js`
- provider secret helpers/callers
- `.docs/tech/provider-secret-field-state.md`

## 验证

```bash
bun run --cwd tests test:unit -- canonical-secrets-store.test.js secrets-migration.test.js secrets-input-map.test.js provider-secret-field-state.test.js canonical-sqlite-operator.test.js --runInBand
bun run docs:check
```

另需对测试输出、operator JSON 和 HTTP fixtures 做 secret canary 扫描，证明未出现原始 value。

## Doc ID 契约

- `page.api_configuration`：更新 provider secret 保存、masked state 与恢复边界；绑定点保持现有 API Configuration drawer 和 secret routes。

## 参考资料

- `.docs/tech/provider-secret-field-state.md`
- `.docs/db/pages/api-configuration.md`
- `src/endpoints/secrets.js`
- `public/scripts/secrets.js`
- `tests/secrets-migration.test.js`
- `tests/secrets-input-map.test.js`
- `tests/provider-secret-field-state.test.js`
