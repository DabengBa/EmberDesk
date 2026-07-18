---
created: 2026-07-13
source: user
confirmed: true
last_updated: 2026-07-15
feature_slug: canonical-vector-catalog-and-index
status: superseded
---

# Canonical Vector Catalog And Index Intent

## 2026-07-15 结论

用户已确认 EmberDesk 不再需要第一方 vector 功能。本 brief 的 canonical catalog 方案和
2026-07-14 的 derived hardening 后继均被
`260715-01-built-in-vector-retirement.md` 取代；当前只保留“旧索引是 derived state、不得在
升级时当作 canonical user data 自动迁移或删除”的历史约束。

## 2026-07-14 结论

本 brief 已被更小的派生索引方案取代。当前 Vectra 目录及 chunk/build 内容位于
`vectors/<source>/<collection>/<model>`，其正确属性是可删除、可重建的 derived state。
把 chunk text 或 collection catalog 提升为 canonical user data 会制造第二份文本权威，
并扩大 migration、backup 和删除一致性范围。

当时的后继方向是 derived vector index hardening：只要求 derived build 引用稳定的
canonical source IDs，具备 build identity、原子发布、last-complete fallback、
invalidation 和 corruption recovery；该方向现已被 2026-07-15 的退役决定取代。

旧 process directory 已在 2026-07-14 经用户确认后删除；当前结论仅由本 brief、后继
derived-index brief、路线图和 owning docs 维护。

## 目标结果

让 SQLite 拥有 vector collection、canonical source reference、chunk text/hash、provider/model
configuration、build version 和 invalidation state；embedding index 保持可删除重建的派生层。

以上包含 canonical chunk catalog 的原始目标已被取代。

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
