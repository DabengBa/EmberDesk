# React Workspace Shell Legacy 退休 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260716-13-react-workspace-shell-retirement.md`
Doc IDs: feature.next_workspace_shell, page.chat_workspace

## Tasks

### Task 1: 建立 React registry 与受限 child-slot lifecycle contract
- [x] **Done**
- **Reqs:** R1, R2, R3, R4
- **Kind:** behavior
- **Scope:** `app/workspace-panels.tsx`, `app/stores/workspace-panel-store.js`, workspace shell registry/slot controller, focused unit tests
- **Proof:** command: bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js react-state-stores.test.js --runInBand && bun run build:react:workspace-panels
- **PM:** 依次打开/关闭/重开/pin Character Library、World Info、Backgrounds、Extensions、Group/Character Authoring 与 Main Chat content slot -> React registry state 是唯一 authority，first-open 正常，slot 的 legacy class 不回写 dock state
- **Doc IDs:** feature.next_workspace_shell, page.chat_workspace
- **Evidence:** evidence/task-01.md
- **Notes:** 每个 slot 必须声明 stable key、mount target、accessible name、content owner 和允许的 feature-local compatibility capability；Settings 继续直接导航 `/settings`。

### Task 2: 由 React root layout 管理 slot layout、startup 与局部失败隔离
- [x] **Done**
- **Reqs:** R1, R5, R6
- **Kind:** behavior
- **Scope:** root workspace bootstrap, React shell layout/styles/status/recovery, main-chat content-slot integration, extension/chat/panel integration tests
- **Proof:** command: bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js chat-message-list-walkthrough.e2e.js --workers=1
- **PM:** desktop/mobile 启动、打开 slot、注入一个 slot/panel failure、发送/滚动 chat -> React shell/chat 仍可用，错误局部化，composer/extension entry 可达
- **Doc IDs:** feature.next_workspace_shell, page.chat_workspace
- **Evidence:** evidence/task-02.md
- **Notes:** `#chat`、`#send_form` 与 `#nonQRFormItems` 是 Main Chat content regions；它们的 selector contracts 保持，但不拥有 shell layout state。

### Task 3: 将 child compatibility capability 限定在 slot 内并保持 public reachability
- [x] **Done**
- **Reqs:** R4, R5
- **Kind:** behavior
- **Scope:** shell child-slot capability wiring, public compatibility providers, `app/compat/global-compatibility-bridge.js`, runtime compatibility tests
- **Proof:** command: bun run test:compat && bun run --cwd tests test:e2e -- third-party-extension-runtime.e2e.js workspace-shell-panel-navigation.e2e.js --workers=1
- **PM:** 在 sole-owner shell 的 child slot 中加载 extension、执行 slash/regex、访问 character/message selectors -> contract 行为完整，slot capability 不泄漏为 public shell bridge，internal bridge 未公开
- **Doc IDs:** feature.next_workspace_shell, page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: 仅在 slot proof 通过后删除 legacy shell chrome、adapters、flags 与 fallback
- [x] **Done**
- **Reqs:** R7, R8
- **Kind:** behavior
- **Scope:** `public/index.html`, `public/script.js`, legacy shell/drawer CSS/handlers, `public/scripts/workspace-shell-takeover-contract.js`, `public/scripts/workspace-panels-react-bridge.js`, `src/react-feature-flags.js`, `src/workspace-react-features.js`, config flags/payload/tests, build gate
- **Proof:** command: bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js workspace-react-panel-flags.test.js global-compatibility-bridge.test.js chat-workspace-structure.test.js --runInBand && bun run build:react:workspace-panels
- **PM:** 对每个声明 slot 完成独立 mount/open-close-reopen/pin/mobile/failure/extension proof 后，搜索发布 source/DOM 并模拟 missing build -> 无 takeover/strict/shell fallback、legacy chrome 或 shell drawer adapter；feature-local protected DOM 与 documented capability 仍可达
- **Doc IDs:** feature.next_workspace_shell, page.chat_workspace
- **Evidence:** evidence/task-04.md
- **Notes:** 任何 slot 的 proof 缺失均阻止本任务；不得为了删除 adapter 删除 extension mount DOM、selector 或 feature-local capability。

### Task 5: 完成 slot navigation matrix、performance 与 durable docs closeout
- [x] **Done**
- **Reqs:** R9, R10
- **Kind:** behavior
- **Scope:** shell E2E/performance, `.docs/db/features/next-workspace-shell.md`, `.docs/db/pages/chat-workspace.md`, project overview/roadmap/ledger/history
- **Proof:** command: bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js chat-message-list-walkthrough.e2e.js --workers=1 && bun run perf:interaction && bun run docs:check
- **PM:** 完整 slot navigation matrix、refresh、mobile、chat、extension 和 failure flows -> React sole shell owner 与 child-slot boundary 可验证，性能与 durable docs 完成
- **Doc IDs:** feature.next_workspace_shell, page.chat_workspace
- **Evidence:** evidence/task-05.md

## Review

- [x] Review: R-01 synchronize retired shell ownership docs (severity: medium; scope: documentation; evidence: stale current takeover/flag/fallback claims in workspace shell coordination, cutover ledger, semantic page state, and workspace-panel flags flow; proof: `bun run docs:check && bun run docs:build`)
- Doc ID gate and topology review: `bun run docs:check` and `bun run docs:build` passed; 30 semantic docs compiled with no reported topology issue.
- Frontend and compatibility review: focused unit gate passed (60 tests); `bun run test:compat` passed (12 tests); workspace bundle build passed; fresh Playwright navigation, chat, and extension-runtime suite passed (15 tests).
- Evidence gap: `bun run perf:interaction` completed and wrote `artifacts/interaction-perf/2026-07-18T07-33-58-423Z/report.md`, but character-index assertions observed the filesystem path and several main-chat samples were invalid after page errors. This does not identify a shell regression; it does not establish a complete performance comparison.
- [x] Review complete
