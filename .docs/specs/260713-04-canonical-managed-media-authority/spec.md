# Canonical Managed Media Authority

## 意图与核心流程

一句话意图：让 SQLite 拥有 backgrounds、assets、persona avatars、uploads 与 attachments 的身份、hash、metadata、归属和生命周期，而大型内容保留在数据库管理的 content root。

上传或导入先验证来源、文件名和内容，写入临时文件并计算 hash；数据库事务登记 blob 与 domain reference 后原子放置受管文件；读取通过 stable ID 解析兼容 URL；删除先解除引用并按 retention 规则回收，不再以目录扫描结果作为事实源。

## 范围 / 不做范围

本阶段包括：

- Managed blob catalog、domain references、folder membership、derived metadata 状态和 lifecycle。
- Backgrounds、assets categories、persona avatars 与 chat upload/attachment 文件的 shadow catalog/audit。
- 兼容 URL/path projection、orphan/missing/hash mismatch repair、thumbnail invalidation。
- 用户创建 folder membership 与 derived `image-metadata.json` 字段的所有权拆分。

本阶段不包括：

- 不把大型内容强制写入 SQLite BLOB。
- 不迁移 persona records 或 chat messages；只提供 stable media IDs 供后续引用。
- 不把 thumbnail、image probe 结果或临时上传提升为 canonical content。
- 不改变 import domain allowlist、静态服务 auth 或 path guards。

## 边界规则 / 验收

R1: 每个 managed blob 必须有 stable ID、content hash、size、media type、managed relative path、lifecycle state；物理路径不能单独充当身份。

R2: shadow catalog 必须在不移动现有文件的情况下识别 registered、orphan、missing、hash mismatch、duplicate-content 和 unsafe-path 状态。

R3: upload/import/rename/delete 在 write flag 开启后以 DB transaction 为 authority；文件放置或 projection 失败产生可重放 repair，不得把目录状态恢复为真源。

R4: background folders 与用户 membership 存入 canonical rows；`isAnimated`、dimensions 和 thumbnails 等可重建 metadata 保持 derived 并可重新生成。

R5: `/api/backgrounds/*`、`/api/assets/*`、persona avatar URL 和 attachment URL 保持兼容，并继续使用现有 filename/path/allowlist guards。

R6: 删除被引用 blob 必须被阻断或转为 tombstone；无引用内容按明确 retention/GC 命令回收，GC 默认 dry-run 且不得删除未审计文件。

R7: flag off 时现有文件读取可用；canonical writes 后 rollback 要求 compatibility paths 完整、hash audit clean 且无 open repair。

## 架构 / 约束

- 依赖 storage control plane；Persona/Chat specs 依赖本阶段产生的 stable IDs。
- content root 位于 per-user data root 下的受管目录，不在 `_cache`。
- 文件操作采用 staging + atomic rename/copy 的现有平台能力；数据库不能指向尚未落盘的 success state。
- `sanitize-filename`、`getFileNameValidationFunction`、外部导入 allowlist 与现有 static route 约束保持。

## 数据 / 集成

建议 schema：

- `managed_blobs(id, content_hash, size_bytes, media_type, relative_path, lifecycle_state, created_at_ms)`
- `media_references(id, blob_id, owner_type, owner_id, role, display_name, metadata_json)`
- `media_folders`、`media_folder_memberships`
- `managed_media_repairs(...)`

主要集成点：

- `src/endpoints/assets.js`
- `src/endpoints/backgrounds.js`
- `src/endpoints/image-metadata.js`
- `src/endpoints/thumbnails.js`
- upload/attachment serving paths
- `src/user-directories.js`

## 验证

```bash
bun run --cwd tests test:unit -- canonical-managed-media-store.test.js background-panel-controller.test.js thumbnail-lazy-image-loading.test.js thumbnail-cache-headers.test.js thumbnail-write-time-pregeneration.test.js thumbnail-placeholder-background.test.js --runInBand
bun run test:compat
bun run docs:check
```

手动检查背景上传/重命名/文件夹/删除、asset 下载和 attachment reload 的兼容 URL，并验证 missing/hash mismatch 的 operator recovery。

## Doc ID 契约

- `feature.background_library_panel`：更新背景列表、文件夹、选择资源与缺失文件恢复行为。
- `page.chat_workspace`：记录 persona avatar 与 chat attachment 仍使用兼容 URL，但身份与生命周期由 managed media catalog 所有。

## 参考资料

- `.docs/db/features/background-library-panel.md`
- `.docs/db/pages/chat-workspace.md`
- `src/endpoints/assets.js`
- `src/endpoints/backgrounds.js`
- `src/endpoints/image-metadata.js`
- `src/endpoints/thumbnails.js`
- `src/user-directories.js`
- Inference: DB-managed file catalog 是满足全面数据库权威同时避免 SQLite BLOB 放大备份与 I/O 风险的最小边界。
