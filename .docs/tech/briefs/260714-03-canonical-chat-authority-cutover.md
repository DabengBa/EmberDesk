---
created: 2026-07-14
source: user
confirmed: true
last_updated: 2026-07-15
feature_slug: canonical-chat-authority-cutover
status: delivered
---

# Canonical Chat Authority Cutover Intent

## 目标结果

在 foundation audit clean 后，把 character/group chat 的完整 payload reads/writes 切换为
DB-first authority，并保留 JSONL projection、import/export、rename/delete 和 rollback
兼容合同。

## 约束

- provider generation、streaming、renderer、message actions 和 DOM contracts 不改变。
- route payload 必须保持完整数组合同；本阶段不引入 server pagination。
- canonical commit 后 projection failure 必须记录 repair，不能把 JSONL 恢复为权威。
- 未知字段、swipes、metadata、integrity 和 attachment wrappers 必须往返保真。

## 验收标准

- get/save/rename/delete/import/export 在独立 read/write flags 下具备 parity proof。
- character 与 group chats 共用一致 authority contract。
- rollback 仅在 projection audit clean、attachments 完整且无 open repair 时允许。

## 非目标

- 不实现 search/recent 优化、backup/restore closure 或 large-chat server pagination。

## 交付结果

- `src/endpoints/chats.js` 保持 route owner，并在 clean-audit canonical read/write gates
  后协调完整 payload 的 read/export 和 canonical-first mutation。
- `src/endpoints/canonical-chat-read-service.js`、`canonical-chat-write-service.js` 与
  `canonical-chat-store.js` 保持完整 payload、stable IDs、JSONL projection 和 repair
  replay 所需的责任边界。
- `src/canonical-sqlite-operator.js` 与
  `scripts/canonical-sqlite-repair.mjs` 提供 chat repair 的 list/replay 路径。
- 耐久行为和用户可见合同见
  [canonical-sqlite-storage-roadmap](../canonical-sqlite-storage-roadmap.md)、
  [project history](../../PROJECT_HISTORY.md)、
  [chat workspace](../../db/pages/chat-workspace.md)、
  [chat rendering](../../db/features/chat-message-rendering.md) 和
  [chat actions](../../db/features/chat-message-actions.md)。

## 参考资料

- `src/endpoints/chats.js`
- `src/endpoints/chat-backup-helpers.js`
- `public/script.js`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
