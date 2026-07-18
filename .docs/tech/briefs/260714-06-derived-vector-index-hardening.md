---
created: 2026-07-14
source: user
confirmed: true
last_updated: 2026-07-14
feature_slug: derived-vector-index-hardening
status: superseded
---

# Derived Vector Index Hardening Intent

> 2026-07-15：本方向已被
> `260715-01-built-in-vector-retirement.md` 取代。用户确认 EmberDesk 不再需要第一方
> vector runtime，因此不再实施 generation hardening。

## 目标结果

保持 Vectra、chunks 和 build manifests 为可删除重建的 derived state，同时用稳定 canonical
source IDs、完整 build identity、原子发布、last-complete fallback、invalidation 和
corruption recovery 消除索引漂移与半构建风险。

## 约束

- vector chunk text/embedding 不成为 chat、World Info 或 media 的第二权威。
- provider/model/dimensions/chunk policy/source revision 共同决定 build identity。
- incomplete build 不可见；失败时继续查询上一 complete build。
- purge derived index 不删除 canonical source data。

## 验收标准

- source 变化只使相关 build 失效，stable source IDs 不依赖文件路径。
- index 删除、损坏或中断构建后可确定性重建。
- query/insert/delete/purge payload 与 vectors extension UI 保持兼容。

## 非目标

- 不引入外部 vector database，不建立 canonical chunk catalog。

## 参考资料

- `src/endpoints/vectors.js`
- `src/vectors/`
- `public/scripts/extensions/vectors/`
- `.docs/db/pages/chat-workspace.md`
