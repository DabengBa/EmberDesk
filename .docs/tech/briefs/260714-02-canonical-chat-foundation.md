---
created: 2026-07-14
source: user
confirmed: true
last_updated: 2026-07-15
feature_slug: canonical-chat-foundation
status: delivered
---

# Canonical Chat Foundation Intent

## 目标结果

在不改变 runtime authority 的前提下，为 character/group chats 建立 canonical schema、
稳定 session/message IDs、lossless JSONL shadow import 和 fail-closed audit。

## 代码事实

当前 chat body 仍是 JSONL；`/get` 全量加载，`/save` 全量重写，search/recent 直接扫描文件。
因此第一阶段只建立可证明的数据模型和迁移基线，不同时切换 reads/writes。

## 约束

- 未知 message/header fields 必须 lossless round-trip。
- persona/background locks 作为 `chat_metadata` 保存。
- attachment 只引用 managed media stable IDs，不复制 bytes。
- flag off 与 foundation 阶段都保持 JSONL runtime authority。

## 验收标准

- 重复 import 幂等，rename 不改变 stable session/message identity。
- audit 能报告 parse、ordering、metadata、swipe、attachment 和 projection drift。
- foundation 完成后仍没有 route 从 SQLite 读取或写入 chat body。

## 非目标

- 不做 DB-first cutover、search/recent index、server pagination 或 UI 改造。

## 参考资料

- `src/endpoints/chats.js`
- `src/endpoints/chat-import-service.js`
- `src/endpoints/chat-import-converters.js`
- `.docs/db/pages/chat-workspace.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `src/canonical-chat-shadow-import.js`
- `src/endpoints/canonical-chat-store.js`
