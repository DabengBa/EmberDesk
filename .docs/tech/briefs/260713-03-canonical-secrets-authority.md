---
created: 2026-07-13
source: user
confirmed: true
last_updated: 2026-07-13
feature_slug: canonical-secrets-authority
status: delivered
---

# Canonical Secrets Authority Intent

## 目标结果

在不扩大明文暴露面的前提下，让 SQLite 成为 secret record、active rotation 和 label
状态的权威源，并继续只通过 `SecretManager` 与 exported helpers 访问。

## 约束

- 不与 settings table 或 extension namespace table 合并。
- `allowKeysExposure`、`EXPORTABLE_KEYS`、masking、rotation 和 migration 行为保持。
- SQLite 迁移不等于 at-rest encryption；本阶段不得虚构不存在的 key-management 能力。
- `secrets.json` 仅可作为迁移输入、受控 projection 或 rollback surface。

## 验收标准

- Flat-format migration、CUSTOM-to-OPENAI migration、读写删除旋转重命名均保持。
- 普通 settings response、日志、docs 和 browser storage 不出现 secret 明文。
- Projection failure 和 rollback blocker 对 operator 可见。

## 参考资料

- `src/endpoints/secrets.js`
- `public/scripts/secrets.js`
- `.docs/tech/provider-secret-field-state.md`
- `tests/secrets-migration.test.js`

## 交付追溯

- [Canonical SQLite Storage Roadmap](../canonical-sqlite-storage-roadmap.md)
- [API Configuration](../../db/pages/api-configuration.md)
- [Canonical Secrets Authority Processing Flow](../../logic-description/canonical_secrets_authority_processing_flow.md)
- `src/canonical-secrets-backend.js`
- `src/endpoints/canonical-secrets-store.js`
