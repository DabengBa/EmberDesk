# Extension Operation Safety Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260714-05-extension-operation-safety.md`
Doc IDs: feature.extension_panel_open, term.shared_browser_library

## Tasks

### Task 1: 固定 operation decision 与 failure envelope
- [ ] **Done**
- **Reqs:** R1, R2, R3, R5
- **Kind:** behavior
- **Scope:** Git/worktree state helpers, route contract tests, global/user scope fixtures
- **Proof:** command: bun run --cwd tests test:unit -- extension-repo-update-state.test.js extension-operation-safety.test.js --runInBand
- **PM:** 对 clean/dirty/detached/no-upstream/missing/invalid/collision fixtures 预检 -> decision 与 reason 稳定且无 worktree mutation
- **Doc IDs:** feature.extension_panel_open
- **Evidence:** evidence/task-01.md

### Task 2: 接入 install/update/switch/move/delete routes
- [ ] **Done**
- **Reqs:** R1, R2, R3, R4, R5, R6
- **Kind:** behavior
- **Scope:** `src/endpoints/extensions.js`, shared operation service, focused route tests
- **Proof:** command: bun run --cwd tests test:unit -- extension-operation-safety.test.js extension-repo-update-state.test.js --runInBand
- **PM:** 执行 user install/update/move/delete 与 global forbidden cases -> 成功 shape 兼容，失败不覆盖 dirty changes
- **Doc IDs:** feature.extension_panel_open
- **Evidence:** evidence/task-02.md

### Task 3: 完成 UI feedback、兼容与文档
- [ ] **Done**
- **Reqs:** R5, R7, R8
- **Kind:** behavior
- **Scope:** extension panel feedback, compatibility tests, owning semantic/tech docs
- **Proof:** command: bun run --cwd tests test:unit -- workspace-react-panel-flags.test.js react-workspace-panels-helpers.test.js --runInBand && bun run test:compat && bun run docs:check
- **PM:** 在 extension panel 触发可重试、需用户处理和 forbidden failures -> 用户可区分状态且 protected mounts 正常
- **Doc IDs:** feature.extension_panel_open, term.shared_browser_library
- **Evidence:** evidence/task-03.md

## Review

- [ ] Review complete

