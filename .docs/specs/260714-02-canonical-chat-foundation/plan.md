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

- [x] Review: R-01 preserve session and message IDs when a header-only update or group file rename changes the former source key (severity: high; scope: Task 1; evidence: `tests/canonical-chat-foundation.test.js`; proof: focused test passes).
- [x] Review: R-02 refresh attachment references after managed-media availability changes, even when the JSONL snapshot itself is unchanged (severity: high; scope: Task 2; evidence: `src/endpoints/canonical-chat-store.js`; proof: focused test passes).
- [x] Review: R-03 block audit when raw JSONL bytes change despite equivalent parsed payloads, and prove each R5 drift category (severity: medium; scope: Tasks 1 and 3; evidence: `src/canonical-chat-shadow-import.js`; proof: focused test passes).
- [x] Review: R-04 expose an opt-in `--import-chats` maintenance path so the delivered shadow importer can populate rows before its read-only audit (severity: medium; scope: Task 3; evidence: `scripts/canonical-sqlite-audit.mjs`; proof: CLI test passes).
- [x] Review: R-05 make invalid `--import-chats` usage recoverable with a concise error, usage text, and exit code 1 instead of a JavaScript stack trace (severity: medium; scope: Task 3; evidence: `scripts/canonical-sqlite-audit.mjs`; proof: CLI test passes).
- Review boundary: `src/endpoints/chats.js` is outside commit `3ad6b60c0` and currently has unrelated worktree changes; this review did not alter that route surface.
- [x] Review complete
