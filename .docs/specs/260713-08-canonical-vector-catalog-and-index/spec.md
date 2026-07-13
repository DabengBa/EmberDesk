# Canonical Vector Catalog And Derived Index

## 意图与核心流程

一句话意图：让 SQLite 拥有 vector collection、canonical source reference、chunk text/hash、build configuration 与 invalidation state，同时把 embedding index 保持为可删除重建的派生加速层。

索引任务从 canonical chat、World Info 与 managed file IDs 读取文本，按稳定 chunk policy 生成 source/chunk catalog；provider/model/config 形成不可变 build identity；embedding 写入 Vectra 派生目录并登记 build 状态；query 只使用 current complete build，损坏或缺失 index 可从 catalog 重建。

## 范围 / 不做范围

本阶段包括：

- Collection、source、chunk、build、provider/model config、content hash、invalidation 与 rebuild state。
- 从 canonical sources 迁移/重建 catalog，保留现有 query/insert/delete/purge endpoint payload。
- Vectra index 生命周期、corruption/missing/provider failure repair。
- Extension vectors UI 与 provider adapters 的兼容。

本阶段不包括：

- 不把 embeddings 当作消息、World Info 或文件真源。
- 不引入外部 vector database。
- 不在 source IDs 稳定前迁移；本阶段依赖 chat 与 managed media authority 完成。
- 不把 provider secrets 或 request objects 持久化到 catalog。

## 边界规则 / 验收

R1: 每个 vector source 必须引用 canonical source type + stable source ID + source revision/content hash；文件名、chat path 或 Vectra folder 不能单独充当身份。

R2: chunk catalog 必须保存稳定 order、text/hash、chunk policy version 和 source revision；重复构建幂等，source 变化只失效受影响 chunks/builds。

R3: provider、model、dimensions 与 relevant config 共同形成 build identity；配置变化创建新 build，不得静默复用旧 embeddings。

R4: embedding index 是 derived state；missing/corrupt index 可删除重建，不能删除 canonical collection/source/chunk catalog。

R5: provider/batch failure 必须将 build 标记为 failed/incomplete，并保留上一 complete build 可查询；不得发布部分 build。

R6: `/api/vector/query|insert|delete|purge` 与 extension vectors UI payload/权限行为保持；purge derived index 不删除 canonical source data。

R7: source 删除或权限变化必须使相关 catalog tombstone/invalidate，query 不得返回已删除 source 的 stale result。

R8: rollback/flag off 可回到当前 Vectra directory behavior；canonical cutover 后 rollback 前必须证明 legacy index 与 current catalog 对齐或完成重建。

## 架构 / 约束

- 依赖 canonical chat、World Info 与 managed media IDs。
- Provider adapters under `src/vectors/` 只负责 embedding，不拥有 source 或 catalog。
- Vectra 目录仍位于可重建 derived storage；不得移入 canonical DB path 并伪装为 authority。
- 构建状态必须支持 crash 后识别 incomplete，不需要为本阶段引入通用 job system。

## 数据 / 集成

建议 schema：

- `vector_collections(id, owner_scope, name, active_build_id, ...)`
- `vector_sources(id, collection_id, source_type, source_id, source_revision, content_hash, state, ...)`
- `vector_chunks(id, source_row_id, chunk_index, text, content_hash, policy_version, ...)`
- `vector_builds(id, collection_id, provider, model, dimensions, config_hash, state, index_path, ...)`

主要集成点：

- `src/endpoints/vectors.js`
- `src/vectors/`
- `public/scripts/extensions/vectors/`
- canonical chat/World Info/media read services

## 验证

```bash
bun run --cwd tests test:unit -- canonical-vector-catalog.test.js canonical-vector-index.test.js canonical-sqlite-operator.test.js --runInBand
bun run test:compat
bun run docs:check
```

手动验证 provider/model 切换、partial batch failure、index 删除后 rebuild、source 删除后 query 过滤和 extension vectors UI。

## Doc ID 契约

- `feature.extension_panel_open`：记录 vectors extension 的 build/rebuild/error 状态仍通过现有 extension surface 提供。
- `page.chat_workspace`：记录 chat/World Info/file 只作为 canonical source，vector result 不反向拥有源内容。

## 参考资料

- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/db/features/extension-panel-open.md`
- `.docs/db/pages/chat-workspace.md`
- `src/endpoints/vectors.js`
- `src/vectors/`
- `public/scripts/extensions/vectors/`
- Inference: 将 source/chunk catalog 设为 canonical、embedding index 设为 derived，能消除当前目录索引承担身份的歧义，同时保留可重建性。
