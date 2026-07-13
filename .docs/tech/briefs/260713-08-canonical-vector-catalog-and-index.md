---
created: 2026-07-13
source: user
confirmed: true
last_updated: 2026-07-13
feature_slug: canonical-vector-catalog-and-index
status: active
active_process_dir: .docs/specs/260713-08-canonical-vector-catalog-and-index
---

# Canonical Vector Catalog And Index Intent

## 目标结果

让 SQLite 拥有 vector collection、canonical source reference、chunk text/hash、provider/model
configuration、build version 和 invalidation state；embedding index 保持可删除重建的派生层。

## 约束

- Vector work必须在 canonical chat、World Info 和 managed-file IDs 稳定后执行。
- Vectra/provider adapters 不成为消息、World Info 或文件真源。
- Provider/model 变化必须创建新 build identity，不能静默复用旧 embedding。
- 不引入外部 vector database。

## 验收标准

- Collection/source/chunk catalog 可从 canonical sources 重建且幂等。
- Missing/corrupt embedding index 可删除后重建，不丢失 source catalog。
- Query/insert/delete/purge payload 与 extension vectors UI 保持兼容。

## 参考资料

- `src/endpoints/vectors.js`
- `src/vectors/`
- `public/scripts/extensions/vectors/`
- `.docs/tech/third-party-extension-compatibility.md`
