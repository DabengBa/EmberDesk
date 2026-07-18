# React Workspace Shell Legacy 退休 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260716-13-react-workspace-shell-retirement.md`
Doc IDs: feature.next_workspace_shell, page.chat_workspace

## Tasks

### Task 1: 将 navigation 与 panel lifecycle 改为直接 React ownership
- [ ] **Done**
- **Reqs:** R1, R2, R3, R4
- **Kind:** behavior
- **Scope:** `app/workspace-panels.tsx` 及拆分 shell/registry/components, React router/panel store, unit tests
- **Proof:** command: bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js react-state-stores.test.js --runInBand && bun run build:react:workspace-panels
- **PM:** 依次打开/关闭/重开/pin 所有 migrated entries 和允许的 child slot -> React state 是唯一 authority，first-open 正常
- **Doc IDs:** feature.next_workspace_shell, page.chat_workspace
- **Evidence:** evidence/task-01.md

### Task 2: 完成 root layout、startup、failure isolation 与 mobile
- [ ] **Done**
- **Reqs:** R1, R5, R6
- **Kind:** behavior
- **Scope:** root workspace bootstrap/React shell layout/styles/status/recovery, extension/chat/panel integration tests
- **Proof:** command: bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js chat-message-list-walkthrough.e2e.js --workers=1
- **PM:** desktop/mobile 启动、打开 panel、注入一个 panel failure、发送/滚动 chat -> shell/chat 可用，错误局部化，composer/extension entry 可达
- **Doc IDs:** feature.next_workspace_shell, page.chat_workspace
- **Evidence:** evidence/task-02.md

### Task 3: 保持 public compatibility 与 extension reachability
- [ ] **Done**
- **Reqs:** R4, R5
- **Kind:** behavior
- **Scope:** shell child slots, compatibility provider wiring, `app/compat/global-compatibility-bridge.js`, runtime compatibility tests
- **Proof:** command: bun run test:compat && bun run --cwd tests test:e2e -- third-party-extension-runtime.e2e.js workspace-shell-panel-navigation.e2e.js --workers=1
- **PM:** 在 sole-owner shell 中加载 extension、执行 slash/regex、访问 character/message selectors -> contract 行为完整且 internal bridge 未公开
- **Doc IDs:** feature.next_workspace_shell, page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: 删除 legacy chrome、drawer adapters、flags 与 fallback
- [ ] **Done**
- **Reqs:** R7, R8
- **Kind:** behavior
- **Scope:** `public/index.html`, `public/script.js`, legacy shell/drawer CSS/handlers, `src/workspace-react-features.js`, config flags/payload/tests, build gate
- **Proof:** command: bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js workspace-react-panel-flags.test.js global-compatibility-bridge.test.js chat-workspace-structure.test.js --runInBand && bun run build:react:workspace-panels
- **PM:** 搜索发布 source/DOM 并模拟 missing build -> 无 takeover/strict/panel fallback、legacy chrome 或 drawer adapter，missing build 明确阻止发布
- **Doc IDs:** feature.next_workspace_shell, page.chat_workspace
- **Evidence:** evidence/task-04.md

### Task 5: 完成 navigation matrix、performance 与 durable docs closeout
- [ ] **Done**
- **Reqs:** R9, R10
- **Kind:** behavior
- **Scope:** shell E2E/performance, `.docs/db/features/next-workspace-shell.md`, `.docs/db/pages/chat-workspace.md`, project overview/roadmap/ledger/history
- **Proof:** command: bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js chat-message-list-walkthrough.e2e.js --workers=1 && bun run perf:interaction && bun run docs:check
- **PM:** 完整 navigation matrix、refresh、mobile、chat、extension 和 failure flows -> sole owner 可验证，性能与 durable docs 完成
- **Doc IDs:** feature.next_workspace_shell, page.chat_workspace
- **Evidence:** evidence/task-05.md

## Review

- [ ] Review complete
