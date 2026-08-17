---
created: 2026-07-14
source: user
confirmed: true
last_updated: 2026-07-15
feature_slug: canonical-chat-query-recovery
status: delivered
---

# Canonical Chat Query And Recovery Intent

## 目标结果

在 chat authority cutover 后完成 search/recent query indexes、attachment reference integrity、
backup/restore、operator repair 和 Node 26 large-chat proof，使 canonical chat 可运营、可恢复。

## 约束

- search/recent response shape、排序和过滤语义保持。
- backup/restore 覆盖 DB revision、projection state 和 managed attachment manifest。
- repair 不得静默丢弃未知 payload 或把 stale JSONL 重新提升为权威。
- 性能优化优先使用 schema/index/query，不夹带浏览器 server-pagination 改造。

## 验收标准

- search/recent 不再依赖目录全量扫描作为 normal canonical path。
- corruption、missing projection、dangling attachment 和 interrupted restore 有明确状态与命令。
- Node.js 26.3.0 下完成 large-chat query/write/backup 基线和回归阈值。

## 非目标

- 不改变聊天交互、渲染、streaming 或 `showMoreMessages()` 客户端合同。

## 交付结果

- `src/endpoints/canonical-chat-query-service.js` 现在作为 character/group chat
  canonical search/recent query owner，`src/endpoints/chats.js` 在 clean audit 后走
  canonical reads，并只为 root chat recent 保留兼容文件回退。
- `src/endpoints/canonical-chat-write-service.js` 在 canonical commit 前拒绝未注册的
  managed attachment 路径，避免 authority 写入携带失配引用。
- `src/endpoints/canonical-chat-backup-restore-service.js` 与
  `src/canonical-sqlite-migrations.js` 现在提供 attachment manifest 校验、
  restore journal 记录和 interrupted restore 状态。
- `scripts/canonical-chat-node24-benchmark.mjs` 与当前测试/文档一起提供
  Node.js 26.3.0 的 fixed-scale search/recent/save/concurrent-read/backup proof。
- 耐久行为和用户可见合同见
  [canonical-sqlite-storage-roadmap](../canonical-sqlite-storage-roadmap.md)、
  [project history](../../PROJECT_HISTORY.md)、
  [chat workspace](../../db/pages/chat-workspace.md) 和
  [chat rendering](../../db/features/chat-message-rendering.md)。

## 参考资料

- `src/endpoints/chat-route-service.js`
- `src/endpoints/chat-backup-helpers.js`
- `src/canonical-sqlite-operator.js`
- `.docs/db/pages/chat-workspace.md`
