# Canonical Chat Authority Cutover Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260714-03-canonical-chat-authority-cutover.md`
Doc IDs: page.chat_workspace, feature.chat_message_rendering, feature.chat_message_actions

## Tasks

### Task 1: 实现 DB-first full-payload reads 与 exports
- [x] **Done**
- **Reqs:** R1, R3, R8, R9
- **Kind:** behavior
- **Scope:** canonical chat read service, `/get`, export, route parity tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-chat-read-service.test.js chat-route-service.test.js --runInBand && bun run test:compat
- **PM:** 同一 character/group chat 在 JSONL 与 DB read flags 下打开 -> header、messages、swipes、metadata 和可见顺序一致
- **Doc IDs:** page.chat_workspace, feature.chat_message_rendering
- **Evidence:** evidence/task-01.md

### Task 2: 切换 canonical-first mutations 与 projection repair
- [x] **Done**
- **Reqs:** R2, R3, R4, R5, R6
- **Kind:** behavior
- **Scope:** save/rename/delete/import coordinator, projection repairs, focused tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-chat-write-service.test.js canonical-chat-route-authority.test.js chat-import-service.test.js chat-backup-helpers.test.js --runInBand
- **PM:** 模拟 JSONL projection failure -> route 返回明确状态、DB payload 可读、repair 可重放且 external edit 不覆盖 DB
- **Doc IDs:** page.chat_workspace, feature.chat_message_actions
- **Evidence:** evidence/task-02.md

### Task 3: 完成 flags、rollback 与 browser compatibility proof
- [x] **Done**
- **Reqs:** R7, R8, R9
- **Kind:** behavior
- **Scope:** rollout gates, operator repair, semantic/tech docs, E2E compatibility
- **Proof:** command: bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-streaming.e2e.js chat-message-layout.e2e.js && bun run test:compat && bun run docs:check
- **PM:** 执行 audit-clean rollback、open-repair rollback 和长聊天重载 -> clean 时恢复 JSONL，open repair 被阻断，客户端 load-more 行为不变
- **Doc IDs:** page.chat_workspace, feature.chat_message_rendering, feature.chat_message_actions
- **Evidence:** evidence/task-03.md

## Review

- [x] Review: R-01 block invalid canonical write fallback (severity: high; scope: chat mutation routes; details: review.md#r-01-canonical-write-gate-previously-fell-back-to-jsonl; proof: canonical-chat-route-authority.test.js)
- [x] Review complete
