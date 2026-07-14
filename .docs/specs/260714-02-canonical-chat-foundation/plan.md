# Canonical Chat Foundation Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260714-02-canonical-chat-foundation.md`
Doc IDs: page.chat_workspace, feature.chat_message_rendering, feature.chat_message_actions

## Tasks

### Task 1: 固定 lossless JSONL snapshot 与 identity 合同
- [x] **Done**
- **Reqs:** R1, R2, R3, R7
- **Kind:** behavior
- **Scope:** chat snapshot/parser/identity helpers and fixtures
- **Proof:** command: bun run --cwd tests test:unit -- canonical-chat-foundation.test.js chat-import-service.test.js chat-import-converters.test.js --runInBand
- **PM:** 导入含未知字段、swipes、metadata 的 character/group fixtures 两次并 rename -> payload 往返一致且 IDs 不变
- **Doc IDs:** page.chat_workspace, feature.chat_message_rendering, feature.chat_message_actions
- **Evidence:** evidence/task-01.md

### Task 2: 建立 schema、shadow import 与 attachment refs
- [x] **Done**
- **Reqs:** R1, R3, R4
- **Kind:** behavior
- **Scope:** migrations, canonical chat store/importer, managed media references
- **Proof:** command: bun run --cwd tests test:unit -- canonical-chat-foundation.test.js canonical-sqlite-migrations.test.js canonical-managed-media-store.test.js --runInBand
- **PM:** 重复执行 shadow import -> 不移动 JSONL/attachments，row count 与 IDs 稳定
- **Doc IDs:** page.chat_workspace, feature.chat_message_rendering
- **Evidence:** evidence/task-02.md

### Task 3: 接入 audit、operator 与 shadow-only gate
- [x] **Done**
- **Reqs:** R5, R6, R7
- **Kind:** behavior
- **Scope:** chat audit, slice registry/operator, focused compatibility proof, owning docs
- **Proof:** command: bun run --cwd tests test:unit -- canonical-chat-foundation.test.js canonical-storage-slice-registry.test.js canonical-sqlite-operator.test.js --runInBand && bun run test:compat && bun run docs:check
- **PM:** 制造 parse/order/attachment drift -> status blocked 且 `/api/chats/get` 仍从 JSONL 返回
- **Doc IDs:** page.chat_workspace, feature.chat_message_rendering, feature.chat_message_actions
- **Evidence:** evidence/task-03.md

## Review

- [x] Review complete
