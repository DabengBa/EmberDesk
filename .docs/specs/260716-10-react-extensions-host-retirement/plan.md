# React Extensions Host Legacy 退休 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260716-10-react-extensions-host-retirement.md`
Doc IDs: feature.extension_panel_open, term.shared_browser_library, page.chat_workspace

## Tasks

### Task 1: 抽出 extension lifecycle、operations 与 Extras services
- [x] **Done**
- **Reqs:** R1, R3, R4, R8
- **Kind:** behavior
- **Scope:** `public/scripts/extensions.js`, focused extension service modules, `src/endpoints/extensions.js`, `src/extension-operation-safety.js`, unit tests
- **Proof:** command: bun run --cwd tests test:unit -- extension-operation-safety.test.js extension-repo-update-state.test.js react-workspace-panels-helpers.test.js --runInBand
- **PM:** 执行 discovery/activation/manage/install/update/delete/Extras 与失败 fixtures -> service result、security 和 worktree state 与现有 contract 一致
- **Doc IDs:** feature.extension_panel_open
- **Evidence:** evidence/task-01.md

### Task 2: 让 React Host 拥有 lifecycle 与稳定 compatibility slots
- [x] **Done**
- **Reqs:** R1, R2, R4
- **Kind:** behavior
- **Scope:** Extensions React host/components, slot lifecycle manager, TanStack state/actions, mount/cleanup tests
- **Proof:** command: bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js global-compatibility-bridge.test.js --runInBand && bun run build:react:workspace-panels
- **PM:** first open/loading/error/retry 后加载 bundled extensions -> slots 稳定、内容可达、关闭/重开不重复 mount
- **Doc IDs:** feature.extension_panel_open, page.chat_workspace
- **Evidence:** evidence/task-02.md

### Task 3: 保持 JS-Slash-Runner、aliases、events、slash 与 regex
- [x] **Done**
- **Reqs:** R2, R5, R6
- **Kind:** behavior
- **Scope:** `public/scripts/extensions.js` public barrel, aliases/exports, compatibility manifest/runtime E2E
- **Proof:** command: bun run test:compat && bun run --cwd tests test:e2e -- third-party-extension-runtime.e2e.js --workers=1
- **PM:** 加载 Tavern Helper/Regex/Quick Reply representative flows -> mount、events、slash、regex 和 message mutation 均工作
- **Doc IDs:** feature.extension_panel_open, term.shared_browser_library, page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: 删除 legacy host、controls、flag 与 fallback
- [x] **Done**
- **Reqs:** R6, R7
- **Kind:** behavior
- **Scope:** legacy extension drawer HTML/CSS/control handlers, `public/script.js`, workspace flags/mount paths/tests
- **Proof:** command: bun run build:react:workspace-panels && bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js third-party-extension-compatibility.test.js --runInBand
- **PM:** 打开 Extensions 并检查 DOM/source -> React host 唯一 owner，compatibility slots 存在但无 legacy drawer/runtime fallback
- **Doc IDs:** feature.extension_panel_open, page.chat_workspace
- **Evidence:** evidence/task-04.md

### Task 5: 完成 operations、browser、mobile 与语义文档验证
- [x] **Done**
- **Reqs:** R3, R4, R8, R9
- **Kind:** behavior
- **Scope:** `tests/extensions-host.e2e.js`, operation/runtime fixtures, semantic docs, ledger/history
- **Proof:** command: bun run test:compat && bun run --cwd tests test:e2e -- extensions-host.e2e.js third-party-extension-runtime.e2e.js workspace-shell-panel-navigation.e2e.js --workers=1 && bun run docs:check
- **PM:** desktop/mobile 完成 load/retry/manage/install/blocked dirty worktree/Extras/reload -> 行为完整且文档为 sole owner
- **Doc IDs:** feature.extension_panel_open, term.shared_browser_library, page.chat_workspace
- **Evidence:** evidence/task-05.md

## Review

- [x] Review complete
- [x] Review: R-01 Retry mapped to Manage not deferred reload (severity: medium; scope: bridge/retry; details: evidence/review.md#r-01) — fixed and revalidated
