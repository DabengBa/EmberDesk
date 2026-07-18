# React Main Chat Renderer Legacy 退休 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260716-12-react-main-chat-renderer-retirement.md`
Doc IDs: feature.chat_message_rendering, feature.chat_message_actions, feature.chat_generation_auto_recovery, page.chat_workspace

## Tasks

### Task 1: 将 formatter 收敛为无 DOM side effect 的 render service
- [x] **Done**
- **Reqs:** R1, R3
- **Kind:** behavior
- **Scope:** `public/script.js` formatter paths, `public/scripts/chat-message-render-descriptor.js`, focused render service modules/tests
- **Proof:** command: bun run --cwd tests test:unit -- chat-message-render-descriptor.test.js chat-message-render-service.test.js chat-workspace-structure.test.js --runInBand
- **PM:** 对 stored/system/reasoning/media/file/regex fixtures 生成 descriptor -> 输出与当前可见 HTML 语义一致且 service 不插入 DOM
- **Doc IDs:** feature.chat_message_rendering
- **Evidence:** evidence/task-01.md

### Task 2: 让 React rows 覆盖全部 lifecycle、actions 与 compatible DOM
- [x] **Done**
- **Reqs:** R1, R2, R4, R8
- **Kind:** behavior
- **Scope:** Main Chat React row/list components, action/edit handlers, streaming result integration, unit/E2E fixtures
- **Proof:** command: bun run --cwd tests test:unit -- chat-message-render-descriptor.test.js chat-message-actions-controller.test.js react-workspace-panels-helpers.test.js --runInBand && bun run build:react:workspace-panels
- **PM:** 打开 stored chat、stream、edit/save/cancel、copy/delete/retry/swipe -> 始终同一 row，selectors/actions/focus 正确
- **Doc IDs:** feature.chat_message_rendering, feature.chat_message_actions, feature.chat_generation_auto_recovery, page.chat_workspace
- **Evidence:** evidence/task-02.md

### Task 3: 建立 extension mutation zones 并通过 runtime compatibility
- [x] **Done**
- **Reqs:** R2, R5
- **Kind:** behavior
- **Scope:** React row mutation hosts, compatibility manifest/runtime fixture, JS-Slash-Runner tests
- **Proof:** command: bun run test:compat && bun run --cwd tests test:e2e -- third-party-extension-runtime.e2e.js chat-message-streaming.e2e.js --workers=1
- **PM:** 让 JS-Slash-Runner 对 streaming/finalized rows 注入 `.TH-*` 内容 -> React 更新后 mutation 仍存在且消息可继续操作
- **Doc IDs:** feature.chat_message_rendering, page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: 让 React 独立拥有 long-chat windowing 与 restore
- [x] **Done**
- **Reqs:** R6, R8, R9
- **Kind:** behavior
- **Scope:** React list/windowing controller, TanStack Virtual range/anchor store, chat switch/load-more tests
- **Proof:** command: bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-list-walkthrough.e2e.js --workers=1 && node scripts/interaction-performance-runner.mjs --profile small --scenario main_chat_long_load_more --repeats 1 --pairs 1 --variant a
- **PM:** 打开大聊天、加载旧消息、切换 chat 再返回、移动端滚动 -> logical order、anchor、latest reachability 和性能正确
- **Doc IDs:** feature.chat_message_rendering, page.chat_workspace
- **Evidence:** evidence/task-04.md

### Task 5: 删除 legacy renderer/windowing/flags 并完成文档验证
- [x] **Done**
- **Reqs:** R7, R9, R10
- **Kind:** behavior
- **Scope:** `public/script.js` legacy render functions, fallback classifiers/markers, feature flags, full E2E/compat/perf, semantic docs/ledger/history
- **Proof:** command: bun run test:compat && bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-list-walkthrough.e2e.js chat-message-streaming.e2e.js --workers=1 && bun run perf:interaction && bun run docs:check
- **PM:** 搜索 source 并完成 desktop/mobile stored/live/long/edit/extension flows -> 无 legacy row/windowing owner，性能与文档满足 gate
- **Doc IDs:** feature.chat_message_rendering, feature.chat_message_actions, feature.chat_generation_auto_recovery, page.chat_workspace
- **Evidence:** evidence/task-05.md

## Review

- [x] Review complete
