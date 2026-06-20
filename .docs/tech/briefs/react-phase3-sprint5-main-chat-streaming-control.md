---
created: 2026-06-21
source: user
confirmed: true
last_updated: 2026-06-21
---

# React Phase 3 Sprint 5 Main Chat Streaming Control Intent

## User Original Request

用户这次明确点名了 5 个 Phase 3 路线图占位稿：

- `.docs\specs\react-phase3-main-chat\phase3-sprint5-streaming-control.md`
- `.docs\specs\react-phase3-main-chat\phase3-sprint6-input-basic.md`
- `.docs\specs\react-phase3-main-chat\phase3-sprint7-input-slash.md`
- `.docs\specs\react-phase3-main-chat\phase3-sprint8-message-actions.md`
- `.docs\specs\react-phase3-main-chat\phase3-sprint9-integration.md`

并通过 `$brainstorming` 要求把这些路线图素材继续收敛成可审批、可 delivery 的实施规格。

这说明本轮目标不是解释路线图，也不是继续泛谈 Phase 3 方向，而是把下一批未完成 Sprint 中的第一个可发货切片，写成能直接交给 `delivery-workflow` 的 `spec.md`。

## Background & Motivation

当前仓库对 Phase 3 的真实完成状态已经不是 README 里最早那种“消息列表 / SSE / 控制状态 / 输入 / actions”粗粒度拆法。

截至 2026-06-20，本地代码和 durable 文档已经确认：

1. `Sprint 1-3` 已交付的是同一个 `features.react.panels.mainChatMessageList` guarded hidden controller island。
2. `public/script.js` 仍然拥有 `Generate()`、`StreamingProcessor`、token append、failure recovery DOM、composer、slash-command 和 message-action handlers。
3. 现有 `phase3-sprint4` 到 `phase3-sprint9` 文档仍主要是路线图 stub，其中 `Sprint 4` 把主聊天 streaming 写成 `EventSource` / SSE transport、`Sprint 5` 把控制状态写成 pause/resume，这都和当前仓库事实不匹配。
4. 真实代码里存在两套不同的“控制”表面：
   - provider/main-chat generation：`#mes_stop`、`#mes_continue`、`.generation_auto_recovery_status`、`.generation_failure_retry`
   - slash-command execution：`#form_sheld .stscript_pause`、`.stscript_continue`、`.stscript_stop`，由 `SlashCommandAbortController` 的 pause/continue/abort 驱动

因此，这一轮不能把 Sprint 5-9 一起糊成一个大 spec，也不能继续沿用“主聊天 provider streaming 可以 pause/resume”的错误前提。最小、真实、可交付的下一步，是先把 Sprint 5 改写成“visible generation control-state boundary”切片：在不改写 transport 和 token owner 的前提下，收敛 stop / continue / retry / auto-recovery status 这组表面。

## Intent Domains

### Domain: 5-9 需要先拆分，只设计第一个可交付切片

- **User expectation:** 继续推进 Phase 3 后半段，但不是一次性写完 5 个独立系统的实施规格。
- **Current status:** delivered
- **Change history:**
  - 2026-06-21: 用户点名 `phase3-sprint5` 到 `phase3-sprint9` 五个 stub，并通过 `$brainstorming` 要求继续收敛为可交付规格
  - 2026-06-21: 依据 `brainstorming` 规则与当前 repo 边界，确认这批请求必须先分解，只能先写第一个可发货切片
- **Implementation traceability:** governing workflow `C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.codex\skills\brainstorming\SKILL.md`; current phase summary `.docs/specs/react-phase3-main-chat/README.md`; roadmap `.docs/tech/react-modernization-roadmap.md`; target slice `phase3-sprint5-streaming-control`; commit `this wrap-up commit`; delivery status `delivered`

### Domain: Sprint 5 的真实范围是 generation control-state，不是 transport 或 provider pause/resume

- **User expectation:** 这一个 Sprint 应该围绕主聊天 generation 的“控制状态”来写，而不是继续保留错误的 SSE/EventSource 示例或虚构的 provider pause/resume 能力。
- **Current status:** delivered
- **Change history:**
  - 2026-06-21: 核对 `public/script.js`、`public/scripts/chat-streaming-control-state.js` 和 `tests/chat-message-streaming.e2e.js` 后，确认当前主聊天 streaming transport 并不是 React `EventSource` owner
  - 2026-06-21: 同时确认现有 main-chat provider flow 具备 stop、auto-recovery、final retry、continue-last-message 等表面，但没有一个可被诚实迁移的“pause/resume provider stream”原语
- **Implementation traceability:** code `public/script.js`, `public/scripts/chat-streaming-control-state.js`, `public/scripts/chat-generation-lifecycle.js`, `app/workspace-panels.tsx`; tests `tests/chat-streaming-control-state.test.js`, `tests/chat-message-streaming.e2e.js`, `tests/react-workspace-panels-helpers.test.js`; owning docs `.docs/tech/react-modernization-roadmap.md`, `.docs/logic-description/main_chat_generation_control_bridge_processing_flow.md`, `.docs/db/features/chat-generation-auto-recovery.md`; commit `this wrap-up commit`; delivery status `delivered`

### Domain: slash-command pause/resume 必须和 main-chat generation control 分开

- **User expectation:** 不能把 `#form_sheld` 的脚本执行暂停/继续按钮混进主聊天 provider streaming 的控制状态设计里。
- **Current status:** delivered
- **Change history:**
  - 2026-06-21: 核对 `public/scripts/slash-commands.js` 和 `SlashCommandAbortController.js` 后，确认 slash-command execution 拥有独立的 pause/continue/abort 状态机
  - 2026-06-21: 因此 Sprint 5 明确排除 slash-command pause/resume，后续若要迁移 composer/slash surface，应归到 Sprint 6-7
- **Implementation traceability:** protected code `public/scripts/slash-commands.js`, `public/scripts/slash-commands/SlashCommandAbortController.js`, `public/index.html`, `public/style.css`; delivered boundary code `public/scripts/chat-streaming-control-state.js`, `public/script.js`, `app/workspace-panels.tsx`; proof `tests/chat-streaming-control-state.test.js`, `tests/chat-message-streaming.e2e.js`; related route-map stubs `.docs/specs/react-phase3-main-chat/phase3-sprint6-input-basic.md`, `.docs/specs/react-phase3-main-chat/phase3-sprint7-input-slash.md`; commit `this wrap-up commit`; delivery status `delivered without provider pause/resume`

### Domain: Sprint 5 继续沿用现有 `mainChatMessageList` guarded island，而不是另起主聊天大迁移入口

- **User expectation:** 在主聊天后半段继续保持 guarded island + legacy fallback 迁移模式，不新开一套更重的 React host、路由或 transport 入口。
- **Current status:** delivered
- **Change history:**
  - 2026-06-20: `Sprint 1-3` 已把 `features.react.panels.mainChatMessageList` 建成共享 workspace-panels bundle 里的 hidden controller island
  - 2026-06-21: 结合当前代码和现有 flag/bundle 结构，确认 Sprint 5 的最小落点应是扩展同一 island 的 bridge/control-state 边界，而不是再发明新的 main-chat React shell
- **Implementation traceability:** code `app/workspace-panels.tsx`, `public/script.js`, `public/scripts/workspace-panels-react-bridge.js`, `src/workspace-react-features.js`, `default/config.yaml`; docs `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`, `.docs/specs/react-phase3-main-chat/README.md`, `.docs/tech/react-modernization-roadmap.md`; commit `this wrap-up commit`; delivery status `delivered on the existing mainChatMessageList guarded island`

### Domain: TanStack 采用要诚实，不能为了“全采用”伪造一个表单或远端查询

- **User expectation:** 路线图继续严格推动 TanStack 栈采用，但这个 Sprint 也不能为了满足形式而把 push-driven local control state 包装成假的 form 或 server query。
- **Current status:** delivered
- **Change history:**
  - 2026-06-16 起: 用户已明确要求路线图严格推动 TanStack Form / Query / Zod 的采用
  - 2026-06-21: 结合当前 Sprint 5 的真实表面，确认可诚实采用的是 Zod bridge-state 校验和既有 shared Query shell；而 TanStack Form 应留给真正拥有输入 owner 的 Sprint 6-7
- **Implementation traceability:** roadmap `.docs/tech/react-modernization-roadmap.md`; current shared bundle `app/workspace-panels.tsx`; current test surface `tests/react-workspace-panels-helpers.test.js`; logic proof `.docs/logic-description/main_chat_generation_control_bridge_sandbox_proof.py`; commit `this wrap-up commit`; delivery status `delivered with Zod bridge validation and existing TanStack Query shell, while TanStack Form remains reserved for Sprint 6-7 input ownership`

## Non-Goals

- 不为 `phase3-sprint6` 到 `phase3-sprint9` 同时产出实现规格
- 不在本轮把 `phase3-sprint4-streaming-sse.md` 改造成 transport rewrite spec
- 不把 `Generate()`、`StreamingProcessor`、provider 请求链、token append 或 fallback routing 改写成 React owner
- 不把 `#send_form` / `#send_textarea` / slash autocomplete / message-actions menu 一并迁移
- 不把 slash-command pause/resume 误写成 main-chat generation pause/resume
- 不新增主聊天路由、SPA shell、数据库存储或新的 canonical data layer

## Source Evidence

- `C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.codex\skills\brainstorming\SKILL.md`
- `C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.codex\skills\brainstorming\references\research-and-questions.md`
- `C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.codex\skills\brainstorming\references\spec-doc.md`
- `C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.codex\skills\brainstorming\references\handoff.md`
- `.docs/specs/react-phase3-main-chat/README.md`
- `.docs/specs/react-phase3-main-chat/phase3-sprint4-streaming-sse.md`
- `.docs/specs/react-phase3-main-chat/phase3-sprint5-streaming-control.md`
- `.docs/specs/react-phase3-main-chat/phase3-sprint6-input-basic.md`
- `.docs/specs/react-phase3-main-chat/phase3-sprint7-input-slash.md`
- `.docs/specs/react-phase3-main-chat/phase3-sprint8-message-actions.md`
- `.docs/specs/react-phase3-main-chat/phase3-sprint9-integration.md`
- `.docs/PROJECT_HISTORY.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/main-chat-successor-scope.md`
- `.docs/tech/main-chat-generation-lifecycle.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
- `.docs/db/features/chat-generation-auto-recovery.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `app/workspace-panels.tsx`
- `public/index.html`
- `public/script.js`
- `public/scripts/chat-streaming-control-state.js`
- `public/scripts/chat-generation-lifecycle.js`
- `public/scripts/chat-message-actions-controller.js`
- `public/scripts/slash-commands.js`
- `public/scripts/slash-commands/SlashCommandAbortController.js`
- `tests/chat-streaming-control-state.test.js`
- `tests/chat-message-streaming.e2e.js`
- `tests/chat-message-layout.e2e.js`
- `tests/chat-workspace-structure.test.js`
- `tests/react-workspace-panels-helpers.test.js`
