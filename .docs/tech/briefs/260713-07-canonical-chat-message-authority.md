---
created: 2026-07-13
source: user
confirmed: true
last_updated: 2026-07-14
feature_slug: canonical-chat-message-authority
status: superseded
---

# Canonical Chat Message Authority Intent

## 2026-07-14 结论

本 brief 的方向仍然成立，但单包同时承担 schema/import、runtime cutover、query/index、
backup/recovery 和 performance proof，范围过大且无法为每个风险建立独立 rollback gate，
因此已拆分为三个可执行后继包：

1. [canonical chat foundation brief](260714-02-canonical-chat-foundation.md)
2. [canonical chat authority-cutover brief](260714-03-canonical-chat-authority-cutover.md)
3. [canonical chat query/recovery brief](260714-04-canonical-chat-query-recovery.md)

当前 `/get` 与 `/save` 仍以完整 JSONL 为边界，浏览器 `showMoreMessages()` 只是对已加载
数组的客户端切片。服务端分页没有现成兼容合同，本轮明确不把它夹带进 storage migration；
如未来确有大聊天按页读取需求，应以独立性能/交互 spec 处理。

旧 process directory 已在 2026-07-14 经用户确认后删除；历史意图由本 brief 保留，
执行合同由三个后继 brief 和 active packages 维护。

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
