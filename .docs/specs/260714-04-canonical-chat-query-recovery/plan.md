# Canonical Chat Query And Recovery Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260714-04-canonical-chat-query-recovery.md`
Doc IDs: page.chat_workspace, feature.chat_message_rendering

## Tasks

### Task 1: 切换 canonical search/recent queries
- [x] **Done**
- **Reqs:** R1, R2, R8
- **Kind:** behavior
- **Scope:** canonical indexes/query service, search/recent routes, parity fixtures
- **Proof:** command: bun run --cwd tests test:unit -- canonical-chat-query.test.js chat-route-service.test.js --runInBand
- **PM:** 对相同 character/group fixtures 比较 JSONL 与 canonical search/recent -> shape、排序、limit 和过滤一致
- **Doc IDs:** page.chat_workspace
- **Evidence:** evidence/task-01.md

### Task 2: 完成 attachment integrity、backup/restore 与 repair
- [x] **Done**
- **Reqs:** R3, R4, R5, R6
- **Kind:** behavior
- **Scope:** backup manifest, restore journal, attachment repairs, operator commands/tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-chat-backup-restore.test.js canonical-sqlite-operator.test.js canonical-managed-media-store.test.js --runInBand
- **PM:** 模拟 missing attachment、corrupt backup 和 interrupted restore -> 原 authority 可用且 status/repair 明确
- **Doc IDs:** page.chat_workspace, feature.chat_message_rendering
- **Evidence:** evidence/task-02.md

### Task 3: 建立 Node 26 large-chat release proof
- [x] **Done**
- **Reqs:** R7, R8
- **Kind:** non-behavior
- **Scope:** deterministic benchmark fixtures, release validation docs, regression thresholds
- **Proof:** command: node --version && bun run --cwd tests test:unit -- canonical-chat-query.test.js canonical-chat-backup-restore.test.js --runInBand
- **PM:** 在 Node.js 26.3.0 对固定规模执行 search/recent/save/concurrent-read/backup -> 记录结果与阈值，失败不得以 payload 改造绕过
- **Doc IDs:** page.chat_workspace, feature.chat_message_rendering
- **Evidence:** evidence/task-03.md

## Review

- [x] Review: R-01 return client error for unregistered managed attachment writes (severity: high; scope: Task 2 write routes; details: tests/canonical-chat-route-authority.test.js; proof: bun run --cwd tests test:unit -- canonical-chat-write-service.test.js canonical-chat-route-authority.test.js --runInBand)
- [x] Review complete
