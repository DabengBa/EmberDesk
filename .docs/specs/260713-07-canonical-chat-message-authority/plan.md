# Canonical Chat Message Authority Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260713-07-canonical-chat-message-authority.md`
Doc IDs: page.chat_workspace, feature.chat_message_rendering, feature.chat_message_actions

## Tasks

### Task 1: 建立 chat schema、JSONL import 与 lossless audit
- [ ] **Done**
- **Reqs:** R1, R2
- **Kind:** behavior
- **Scope:** canonical migrations, chat store/import/audit, `tests/canonical-chat-store.test.js`
- **Proof:** command: bun run --cwd tests test:unit -- canonical-chat-store.test.js chat-import-service.test.js chat-import-converters.test.js canonical-sqlite-migrations.test.js --runInBand
- **PM:** 导入 character/group/unknown-field/swipe/media fixtures 两次 -> IDs/order/payload 稳定且 audit 无字段损失
- **Doc IDs:** page.chat_workspace, feature.chat_message_rendering
- **Evidence:** evidence/task-01.md

### Task 2: 切换 get/search/recent/export 与分页
- [ ] **Done**
- **Reqs:** R3, R7
- **Kind:** behavior
- **Scope:** chat read service/routes, indexes/pagination, route/performance tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-chat-store.test.js chat-route-service.test.js chat-backup-helpers.test.js --runInBand
- **PM:** 对 large-chat fixture 比较 JSONL 与 DB-first get/search/recent/export -> payload/排序一致，分页不读取无关全部消息
- **Doc IDs:** page.chat_workspace, feature.chat_message_rendering
- **Evidence:** evidence/task-02.md

### Task 3: 切换 chat mutations、attachments 与 projection repair
- [ ] **Done**
- **Reqs:** R4, R5
- **Kind:** behavior
- **Scope:** `src/endpoints/chats.js`, chat write service, attachment refs, projection/operator tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-chat-store.test.js chat-route-service.test.js chat-import-service.test.js canonical-sqlite-operator.test.js --runInBand
- **PM:** 执行 save/swipe/rename/delete/import 并模拟 JSONL projection failure -> DB 保持完整事务、repair 可重放、外部文件不自动接管
- **Doc IDs:** page.chat_workspace, feature.chat_message_actions
- **Evidence:** evidence/task-03.md

### Task 4: 完成 backup/restore、rollback 与 Node 26 性能证明
- [ ] **Done**
- **Reqs:** R6, R7, R9
- **Kind:** behavior
- **Scope:** backup/restore operator, rollback gates, performance fixture/report, focused tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-chat-store.test.js chat-backup-helpers.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-operator.test.js --runInBand
- **PM:** 创建/恢复含 attachments 的备份并测试 rollback -> manifest/integrity 完整时成功，缺失 blob 或 repair 时阻断；记录 Node 26.3.0 large-chat 指标
- **Doc IDs:** page.chat_workspace
- **Evidence:** evidence/task-04.md

### Task 5: 运行 renderer/action/extension 回归并更新文档
- [ ] **Done**
- **Reqs:** R3, R8
- **Kind:** behavior
- **Scope:** message renderer/action/E2E/compat tests, semantic/tech/logic docs
- **Proof:** command: bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-streaming.e2e.js chat-message-layout.e2e.js && bun run test:compat && bun run docs:check
- **PM:** 在真实 workspace 执行 load/send/regenerate/retry/swipe/search/recent/export -> 可见 rows/actions/streaming 和 extension surfaces 保持
- **Doc IDs:** page.chat_workspace, feature.chat_message_rendering, feature.chat_message_actions
- **Evidence:** evidence/task-05.md

## Review

- [ ] Review complete
