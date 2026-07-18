# React Main Chat Transport Legacy 退休 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260716-11-react-main-chat-transport-retirement.md`
Doc IDs: page.chat_workspace, feature.chat_generation_auto_recovery, feature.chat_message_actions, feature.fallback_provider

## Tasks

### Task 1: 建立完整 generation command matrix 与 lifecycle service
- [x] **Done**
- **Reqs:** R1, R3, R4, R5
- **Kind:** behavior
- **Scope:** generation command/lifecycle modules, existing auto-recovery helpers, request matrix unit tests
- **Proof:** command: bun run --cwd tests test:unit -- chat-generation-command-service.test.js chat-generation-lifecycle.test.js chat-generation-auto-recovery.test.js chat-completions-openai-fallback.test.js chat-completions-google.test.js main-chat-bridge-contract.test.js react-workspace-panels-helpers.test.js --runInBand
- **PM:** 对每个 visible/non-visible request kind 创建 plan 并模拟 success/failure/abort -> owner、attempt、baseline、finalization 均明确且无 legacy fallback
- **Doc IDs:** page.chat_workspace, feature.chat_generation_auto_recovery, feature.chat_message_actions, feature.fallback_provider
- **Evidence:** evidence/task-01.md

### Task 2: 迁移 provider/group/request assembly 到统一 service
- [x] **Done**
- **Reqs:** R1, R2, R5
- **Kind:** behavior
- **Scope:** `public/script.js` generation paths, provider payload builders, group/quiet/dry-run/nested adapters, focused provider tests
- **Proof:** command: bun run --cwd tests test:unit -- chat-generation-command-service.test.js chat-generation-lifecycle.test.js chat-generation-auto-recovery.test.js chat-completions-openai-fallback.test.js chat-completions-google.test.js main-chat-bridge-contract.test.js react-workspace-panels-helpers.test.js --runInBand
- **PM:** 对 provider/group/quiet/dry-run/nested fixtures 生成 request -> payload、result shape 与现有 behavior 一致
- **Doc IDs:** page.chat_workspace, feature.fallback_provider
- **Evidence:** evidence/task-02.md

### Task 3: 让 React visible UI 与 public automation adapters 共用 service
- [x] **Done**
- **Reqs:** R3, R5, R6, R8
- **Kind:** behavior
- **Scope:** `app/workspace-panels.tsx`, composer/action mutations, slash/extension generation adapters, event integration
- **Proof:** command: bun run test:compat && bun run --cwd tests test:unit -- chat-generation-command-service.test.js main-chat-bridge-contract.test.js react-workspace-panels-helpers.test.js --runInBand && bun run build:react:workspace-panels
- **PM:** 从 composer/actions 与 JS-Slash-Runner generate/quiet 触发请求 -> 同一 lifecycle、events、stop/recovery 和 result behavior
- **Doc IDs:** page.chat_workspace, feature.chat_generation_auto_recovery, feature.chat_message_actions
- **Evidence:** evidence/task-03.md

### Task 4: 删除 Generate/StreamingProcessor bridges、flags 与 fallback split
- [x] **Done**
- **Reqs:** R7
- **Kind:** behavior
- **Scope:** `public/script.js`, retired visible transport owner module, transport bridge/markers, workspace flags/tests
- **Proof:** command: bun run --cwd tests test:unit -- chat-generation-command-service.test.js main-chat-bridge-contract.test.js react-workspace-panels-helpers.test.js --runInBand && bun run build:react:workspace-panels
- **PM:** 搜索运行时和执行 request matrix -> 无 visible/quiet transport owner、feature fallback 或 hidden split；`Generate()` 保留为服务委托，`GenerationStreamSession` 仅为内部 streaming 实现
- **Doc IDs:** page.chat_workspace
- **Evidence:** evidence/task-04.md

### Task 5: 完成 E2E、compat、performance 与语义文档
- [x] **Done**
- **Reqs:** R4, R6, R8, R9
- **Kind:** behavior
- **Scope:** streaming/extension E2E, interaction runner, semantic docs, lifecycle technical docs, ledger/history
- **Proof:** command: bun run test:compat && bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js third-party-extension-runtime.e2e.js --workers=1 && bun run perf:interaction && bun run docs:check
- **PM:** 完整跑 request matrix 的 success/stop/retry/fallback/error -> 无重复/丢失，性能与 extension behavior 可接受
- **Doc IDs:** page.chat_workspace, feature.chat_generation_auto_recovery, feature.chat_message_actions, feature.fallback_provider
- **Evidence:** evidence/task-05.md

## Review

- [x] Review: R-01 simplified perf runner failure diagnostics (severity: low; scope: Task 5 interaction runner; proof: focused Character Library tests, single-scenario performance rerun, and `git diff --check` passed)
- [x] Review: R-02 React composer stop control now handles real pointer clicks through the bridge instead of falling into the portal-incompatible legacy delegated path (severity: high; scope: Task 5 visible stop; proof: RED/green focused streaming E2E, visible action matrix, UX screenshots, and compatibility validation passed)
- [x] Review complete
