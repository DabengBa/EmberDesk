# Canonical Vectors 与 Assets Authority 迁移

## 意图与核心流程

一句话意图：把 vectors 与 assets 纳入 canonical SQLite authority，并清理旧的文件真源/derived storage 语义，同时保持 provider integration、asset import/export 和 extension asset flows 可用。

主要参与者或触发条件：

- settings/secrets canonical migration 已完成
- 维护者准备继续 remaining structured user-data slices
- vectors/assets 需要独立 authority、repair、rollback 与性能验证

主路径顺序：

1. 盘点 `src/endpoints/vectors.js`、`src/vectors/*`、`src/endpoints/assets.js` 和 assets extension 当前存储方式。
2. 设计 canonical tables：vector collections/items/provider metadata、asset packages/files/metadata。
3. Shadow import 当前 vector state 和 asset metadata；大文件/二进制内容是否入 DB 需以本 spec 的证据决定。
4. DB-first read parity，保持现有 endpoint payload。
5. DB-first write with projection/import/export compatibility。
6. 增加 repair tooling，处理 provider drift、missing asset blobs、projection failure。

## 范围 / 不做范围

本次要改变什么：

- vectors authority 迁移到 canonical SQLite。
- assets metadata authority 迁移到 canonical SQLite。
- 对二进制 asset blobs，优先设计为 canonical metadata + managed file/blob projection；只有证据证明必要时才把 blob 直接放入 DB。

明确推迟什么：

- 不迁移 personas/backgrounds。
- 不迁移 extension storage。
- 不迁移 chat message bodies。

第一个可交付切片：

- vectors canonical metadata + audit；assets 先迁移 metadata 与 projection repair，不强制一次性移动所有 blob。

## 边界规则 / 验收

验收项：

1. Existing vector provider endpoints 和 extension vectors UI 不改变 payload shape。
2. Vector DB rows 能表达 provider、collection、item identity、embedding metadata 与 invalidation 状态。
3. Assets endpoint、assets extension marketplace/install/import flows 仍可用。
4. Missing provider、embedding failure、missing asset file 都返回可诊断状态，不造成 silent data loss。
5. DB-first writes 不能把 projection files 重新当 authority。
6. Large asset handling 有明确性能和 backup/restore 边界。

失败边界：

- 如果 provider-specific vector behavior 不能统一表达，必须按 provider slice 拆分 plan tasks。
- 如果 asset blob 进入 DB 会明显破坏 backup/restore 或性能，必须保留 managed file projection 并把 DB 作为 metadata authority。

## 架构 / 约束

- 复用 canonical manager/migrations/operator 模式。
- 不引入外部 vector DB；本阶段仍是 local SQLite。
- Provider adapters under `src/vectors/*` 不应被改造成 storage owners。
- Assets extension UI 和 endpoint compatibility 保持。

## 数据 / 集成

建议 schema 方向：

- `vector_collections(id, provider, scope, owner_key, metadata_json, updated_at_ms)`
- `vector_items(id, collection_id, content_hash, embedding_json_or_blob, source_ref_json, updated_at_ms, deleted_at_ms)`
- `asset_records(id, kind, owner_key, path_or_blob_ref, metadata_json, updated_at_ms, deleted_at_ms)`
- `structured_projection_repairs(slice, owner_key, reason, payload_json, resolved_at_ms)`

集成点：

- `src/endpoints/vectors.js`
- `src/vectors/*`
- `src/endpoints/assets.js`
- `public/scripts/extensions/assets/*`
- `public/scripts/extensions/vectors/*`

## 验证

执行：

```bash
bun run --cwd tests test:unit -- canonical-sqlite-migrations.test.js canonical-sqlite-operator.test.js --runInBand
bun run test:compat
bun run docs:check
```

新增 focused proof：

- vector metadata migration idempotency
- provider failure does not corrupt canonical state
- asset metadata import/export parity
- missing blob/file repair report
- flag-off rollback

## Doc ID 契约

- `page.chat_workspace`：extension/assets/vectors 从 workspace 入口可达。
- `feature.extension_panel_open`：assets/vectors extension surfaces。
- 如果新增 operator-facing term，可新增 `term.canonical_vector_store` 或 `term.canonical_asset_store`，否则不新增用户可见 Doc ID。

## 参考资料

- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `src/endpoints/vectors.js`
- `src/vectors/`
- `src/endpoints/assets.js`
- `public/scripts/extensions/assets/`
- `public/scripts/extensions/vectors/`
