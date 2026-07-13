---
created: 2026-07-13
source: user
confirmed: true
last_updated: 2026-07-13
feature_slug: canonical-chat-message-authority
status: active
active_process_dir: .docs/specs/260713-07-canonical-chat-message-authority
---

# Canonical Chat Message Authority Intent

## 目标结果

让 SQLite 成为 character/group chat sessions、messages、swipes、chat metadata 和 attachment
references 的权威源，JSONL 降为 import/export/projection/rollback surface。

## 约束

- 保持 message order、role/name、reasoning、media/file wrappers、swipes 和 metadata。
- Provider generation、streaming 和 visible renderer owner 不因存储迁移重写。
- Integrity conflict、backup retention、import converter 和 JSONL export 保持明确语义。
- Persona/background chat locks 随 `chat_metadata` 一起迁移。

## 验收标准

- Character/group save/get/rename/delete/import/export/search/recent 全部有 DB-first parity。
- Large-chat transaction、pagination/search 和 backup/restore 有性能与恢复 proof。
- JSONL projection failure 不能恢复 JSONL authority。

## 参考资料

- `src/endpoints/chats.js`
- `src/endpoints/chat-route-service.js`
- `src/endpoints/chat-import-service.js`
- `public/scripts/chats.js`
- `.docs/db/pages/chat-workspace.md`
