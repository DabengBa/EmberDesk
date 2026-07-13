# Canonical Extension State Authority Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260713-06-canonical-extension-state-authority.md`
Doc IDs: feature.extension_panel_open, term.shared_browser_library

## Tasks

### Task 1: 建立 extension registry、namespace schema 与 discovery audit
- [ ] **Done**
- **Reqs:** R1, R2, R4
- **Kind:** behavior
- **Scope:** canonical migrations, extension store/discovery/audit, `tests/canonical-extension-store.test.js`
- **Proof:** command: bun run --cwd tests test:unit -- canonical-extension-store.test.js extension-repo-update-state.test.js canonical-sqlite-migrations.test.js --runInBand
- **PM:** 对 healthy/unregistered/missing/dirty/detached/collision fixtures 运行 discovery -> 每项得到独立状态且不改写 worktree
- **Doc IDs:** feature.extension_panel_open
- **Evidence:** evidence/task-01.md

### Task 2: 切换 registry reads 与 first-party namespace storage
- [ ] **Done**
- **Reqs:** R1, R4, R5
- **Kind:** behavior
- **Scope:** extension/settings adapters, `src/endpoints/extensions.js`, frontend host tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-extension-store.test.js workspace-react-panel-flags.test.js react-workspace-panels-helpers.test.js --runInBand
- **PM:** 开启 read flag 打开 Extensions Host -> 列表、scope、enabled 与 first-party settings 兼容，namespace collision 被拒绝
- **Doc IDs:** feature.extension_panel_open, term.shared_browser_library
- **Evidence:** evidence/task-02.md

### Task 3: 实现 worktree commands、repair 与 rollback
- [ ] **Done**
- **Reqs:** R3, R6, R7
- **Kind:** behavior
- **Scope:** install/update/switch/move/delete coordinators, repair operator, focused tests
- **Proof:** command: bun run --cwd tests test:unit -- canonical-extension-store.test.js extension-repo-update-state.test.js canonical-sqlite-operator.test.js --runInBand
- **PM:** 操作 clean 与 dirty repos -> clean 成功登记 revision，dirty/detached/no-upstream 阻断且保留 repair state；open repair 阻断 rollback
- **Doc IDs:** feature.extension_panel_open
- **Evidence:** evidence/task-03.md

### Task 4: 固化第三方兼容与文档
- [ ] **Done**
- **Reqs:** R5, R7
- **Kind:** behavior
- **Scope:** protected compatibility tests, extension/shared-library semantic docs, roadmap/logic docs
- **Proof:** command: bun run test:compat && bun run docs:check
- **PM:** 运行 JS-Slash-Runner blocker sample -> mount、imports、events、slash、regex 与 wand surfaces 保持
- **Doc IDs:** feature.extension_panel_open, term.shared_browser_library
- **Evidence:** evidence/task-04.md

## Review

- [ ] Review complete
