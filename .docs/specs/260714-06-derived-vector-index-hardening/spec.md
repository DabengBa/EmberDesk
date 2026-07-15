# Derived Vector Index Hardening

## 意图与核心流程

一句话意图：让 vector index 明确保持 derived，同时以 stable source IDs、build identity、
atomic publish、last-complete fallback 和 deterministic rebuild 提升可靠性。

Builder 从 canonical chat/World Info/managed media source adapter 读取文本快照，计算 source
revision/content hash 与 chunk policy；provider/model/dimensions/config 形成 build identity。
新 generation 在 staging 构建并校验，完成后原子发布；失败或损坏继续使用上一 complete
generation，必要时删除 derived state 后重建。

## 范围 / 不做范围

本阶段包括：

- Stable source references、build identity、generation manifests 和 invalidation。
- Atomic generation publish、last-complete fallback、corruption detection/rebuild。
- Query/insert/delete/purge compatibility 与 operator diagnostics。

本阶段不包括：

- 不建立 canonical vector source/chunk text tables。
- 不把 embeddings/chunks/manifests 纳入用户数据 backup authority。
- 不引入外部 vector database 或通用 background job system。

## 边界规则 / 验收

R1: Source identity 必须使用 canonical source type + stable ID + revision/hash，不能只依赖路径。

R2: Provider、model、dimensions、chunk policy 与 relevant config 必须进入 build identity。

R3: Build 必须写入 staging generation，完整校验后才能原子设为 current。

R4: Failed/incomplete/corrupt generation 不可查询；存在上一 complete generation 时必须可回退。

R5: Source 变化或删除只 invalidate 受影响 collections/builds，stale result 不得继续返回。

R6: 删除全部 vector derived state 后必须可从 canonical sources 确定性重建。

R7: `/api/vector/query|insert|delete|purge` payload、权限和 vectors extension UI 保持兼容。

R8: Purge/build cleanup 不得删除 chat、World Info、managed media 或 provider secrets。

## 架构 / 约束

- 依赖 canonical chat query/recovery 完成稳定 source/query/recovery contract。
- `src/vectors/` provider adapters 只负责 embeddings。
- Derived files 继续位于 vector storage，不放进 canonical DB path。

## 数据 / 集成

Generation manifest 可记录 source refs、config hash、state、created/completed time 和 index
relative path；它与 chunks/embeddings 一样可删除重建。

## 验证

```bash
bun run --cwd tests test:unit -- derived-vector-index-hardening.test.js canonical-sqlite-operator.test.js --runInBand
bun run test:compat
bun run docs:check
```

## Doc ID 契约

- `feature.extension_panel_open`：更新 vectors extension 的 build/rebuild/fallback/error 状态。
- `page.chat_workspace`：明确 vector 只引用 chat source，不反向拥有 chat content。

## 参考资料

- `.docs/db/features/extension-panel-open.md`
- `.docs/db/pages/chat-workspace.md`
- `src/endpoints/vectors.js`
- `public/scripts/extensions/vectors/`

