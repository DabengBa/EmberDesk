# React Legacy 退休兼容契约基线 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260716-04-react-compatibility-contract-baseline.md`
Doc IDs: term.shared_browser_library, feature.extension_panel_open, feature.character_library_panel, feature.chat_message_rendering, page.chat_workspace

## Tasks

### Task 1: 建立 provider-neutral compatibility manifest
- [x] **Done**
- **Reqs:** R1, R2, R6
- **Kind:** non-behavior
- **Scope:** `tests/helpers/frontend-compatibility-contract.js`, `tests/third-party-extension-compatibility.test.js`
- **Proof:** command: bun run test:compat
- **PM:** 触发任一 contract family 的测试差异 -> 输出明确指出 globals/events/aliases/slash/regex/mount/selector 中的具体失败族
- **Doc IDs:** term.shared_browser_library, feature.extension_panel_open, feature.character_library_panel, feature.chat_message_rendering, page.chat_workspace
- **Evidence:** evidence/task-01.md

### Task 2: 增加 JS-Slash-Runner runtime compatibility proof
- [x] **Done**
- **Reqs:** R3, R4
- **Kind:** behavior
- **Scope:** `tests/third-party-extension-runtime.e2e.js`, bundled JS-Slash-Runner fixtures, deterministic workspace/provider fixture
- **Proof:** command: bun run --cwd tests test:e2e -- third-party-extension-runtime.e2e.js --workers=1
- **PM:** 启动测试 workspace 并加载 Tavern Helper -> mount、event、slash、regex 与 message mutation 均可观察成功
- **Doc IDs:** feature.extension_panel_open, feature.chat_message_rendering, page.chat_workspace
- **Evidence:** evidence/task-02.md

### Task 3: 锁定 internal bridge 非公开边界
- [x] **Done**
- **Reqs:** R5
- **Kind:** behavior
- **Scope:** `app/compat/global-compatibility-bridge.js`, `tests/global-compatibility-bridge.test.js`, compatibility manifest exclusions
- **Proof:** command: bun run --cwd tests test:unit -- global-compatibility-bridge.test.js third-party-extension-compatibility.test.js --runInBand
- **PM:** attach/detach React bridge 并读取 public globals -> public shape 不变，bridge 不作为第三方入口出现
- **Doc IDs:** term.shared_browser_library, page.chat_workspace
- **Evidence:** evidence/task-03.md

### Task 4: 更新兼容文档与后续删除 gate
- [x] **Done**
- **Reqs:** R6, R7
- **Kind:** non-behavior
- **Scope:** `.docs/tech/third-party-extension-compatibility.md`, `.docs/tech/legacy-cutover-ledger.md`, affected semantic docs
- **Proof:** command: bun run docs:check
- **PM:** 审阅 compatibility ledger -> 每类 contract 区分 behavior、current provider、replacement proof 与 deletion readiness
- **Doc IDs:** term.shared_browser_library, feature.extension_panel_open, feature.character_library_panel, feature.chat_message_rendering, page.chat_workspace
- **Evidence:** evidence/task-04.md

## Review

- [x] Review complete

### Review notes
- ZERO CONFIRMED FINDINGS after implementation evidence and focused validation.
- Frontend surfaces reviewed via route/e2e/compat proofs; no additional UX redesign in scope.
