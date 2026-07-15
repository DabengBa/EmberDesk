---
created: 2026-07-14
source: user
confirmed: true
last_updated: 2026-07-14
feature_slug: canonical-chat-query-recovery
status: active
active_process_dir: .docs/specs/260714-04-canonical-chat-query-recovery
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

## 参考资料

- `src/endpoints/chat-route-service.js`
- `src/endpoints/chat-backup-helpers.js`
- `src/canonical-sqlite-operator.js`
- `.docs/db/pages/chat-workspace.md`

