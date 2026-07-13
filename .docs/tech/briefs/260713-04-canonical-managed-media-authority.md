---
created: 2026-07-13
source: user
confirmed: true
last_updated: 2026-07-13
feature_slug: canonical-managed-media-authority
status: active
active_process_dir: .docs/specs/260713-04-canonical-managed-media-authority
---

# Canonical Managed Media Authority Intent

## 目标结果

让 SQLite 拥有 backgrounds、assets、persona avatars、uploads/attachments 的 stable identity、
hash、metadata、folder membership、ownership 和 lifecycle；大型内容保留为数据库管理的文件。

## 约束

- 不把所有图片、音频和附件强制写入 SQLite BLOB。
- 文件路径不能作为独立身份；DB row 与 content hash 是权威。
- `image-metadata.json` 中 derived metadata 与用户创建的 folder membership 必须拆开归属。
- 静态服务、thumbnail、import allowlist 和 path guards 保持。

## 验收标准

- Import/upload/delete/rename 先更新 canonical transaction，再完成 managed-file side effect。
- Orphan blob、missing blob、hash mismatch 和 projection failure 可审计、修复。
- Existing background/assets/persona URLs 保持兼容。

## 参考资料

- `src/endpoints/assets.js`
- `src/endpoints/backgrounds.js`
- `src/endpoints/image-metadata.js`
- `src/endpoints/thumbnails.js`
- `src/user-directories.js`
