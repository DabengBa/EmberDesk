# Main Chat Next Successor Spec Set Intent

Date: 2026-06-08

## Original Request

用户询问“根据 roadmap,我们接下来的开发方向是什么?”后，要求“针对以上几点, 拆分步骤, 编写多个specs开发设计文件”。

## Context

`.docs/tech/modernization-roadmap.md` 已冻结，不能继续追加实现切片。2026-06-08 已归档的 main-chat successor proof set 关闭了第一批保护网：

- `.docs/tech/main-chat-successor-scope.md`
- `.docs/tech/main-chat-baseline-validation.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `.docs/tech/main-chat-performance-evidence.md`
- `.docs/PROJECT_HISTORY.md` 中的 2026-06-08 closure entry

closure checkpoint 仍留下几个用户体验缺口：provider error/retry、长聊天搜索/跳转/范围指示、移动端完整 walkthrough、低风险 controller 继续切片、streaming 状态边界、性能优化候选，以及需要 ADR 的大迁移入口。

## Intent

把下一阶段开发方向拆成多个独立 successor specs。每个 spec 都应是一个可审批、可交付的小切片，优先补已知 UX gap，同时继续保护主聊天兼容表面。

本轮 UX 修正意见的归档位置是 `.docs/tech/main-chat-ux-trend-recommendations.md`。该文档把最新竞品趋势转为 EmberDesk 的执行队列：先修复恢复、长聊天方向感、移动端可达性、消息动作优先级、上下文/工具范围披露和响应后来源/工具证据，再把 Projects/Canvas/Artifacts/rich work blocks/Deep Research/Knowledge/RAG/Tools/MCP/代码执行/自动化等大方向放入 ADR-backed successor gate。

## Grill Review: 2026-06-08

用户要求本轮不要继续提问，而是联网搜索后自问自答，改进设计方案。自审结论：

- 期望结果：用户不是要一个新的大 roadmap，而是要能马上进入审批和实施的小规格集合；每个规格都应改善主聊天实际使用体验。
- 代表性成功场景：provider 失败后不中断对话；长聊天加载旧消息后可快速回到最新上下文；移动端能触达 composer、message actions、load-more 和 stop/recovery；后续 controller/helper 切片不破坏扩展兼容。
- 竞品趋势压力：ChatGPT Projects 强调 chats/files/instructions/tools/memory 的持续上下文和权限边界；ChatGPT Canvas 与 Claude Artifacts 强调可编辑工作输出，但 OpenAI 2026 release notes 也显示写作/代码能力会回到 in-chat writing/code blocks；Claude Research 与 Gemini Deep Research 强调来源、等待状态、报告和可恢复长任务；Open WebUI 与 Msty 强调知识、工具、项目/聊天集合、可配置检索、MCP/代码执行、诊断和本地数据所有权。
- 推荐回答：EmberDesk 现在不应直接复制 Canvas/Artifacts/Deep Research，而应先把主聊天恢复性、导航性、可达性和兼容 gate 做扎实；未来要新增项目上下文、旁侧工作区、富聊天工作块、知识栈、工具/MCP/代码执行、database-first 或 provider protocol overhaul 时，必须走 ADR-backed design。
- 追加修正：任何让模型读取文件、memory、World Info、web、RAG、MCP、代码或自动化上下文的方案，都必须先定义 pre-send scope disclosure；任何使用来源或工具的响应，都必须有 post-response evidence，说明实际用了什么、跳过了什么、失败了什么。
- Tiger: provider-error spec 如果只记录“可以继续输入”而没有明确恢复 CTA，用户会认为 retry UX 没交付。修订为必须提供一个明确恢复动作或显式复用当前生成入口，并用 E2E 证明。
- Tiger: long-chat jump-to-latest 若改动 `chat` 顺序、`mesid` 或 `power_user.chat_truncation` 语义，会破坏 third-party extension long-chat/变量管理逻辑。修订为只加恢复入口，不改截断和 message id 语义。
- Paper Tiger: 不引入 Canvas/Artifacts 会显得落后。短期这是可控风险，因为当前仓库仍处在 jQuery shell 与兼容表面保护阶段；只有当用户明确要求旁侧创作工作区时才升级为 ADR Tiger。
- Elephant: “提升用户体验”容易被理解成视觉重做，但当前最大风险是生成失败、长聊天迷路、移动端不可达和大迁移越界。规格应优先让失败和恢复路径可观察。

## Recommended Spec Set

1. `.docs/specs/260608-01-provider-error-retry-ux/spec.md`
2. `.docs/specs/260608-02-long-chat-navigation-recovery/spec.md`
3. `.docs/specs/260608-03-main-chat-mobile-walkthrough-hardening/spec.md`
4. `.docs/specs/260608-04-message-action-priority-touch-ux/spec.md`
5. `.docs/specs/260608-05-non-streaming-row-population-helper/spec.md`
6. `.docs/specs/260608-06-streaming-state-controller-boundary/spec.md`
7. `.docs/specs/260608-07-main-chat-performance-optimization-candidate/spec.md`
8. `.docs/specs/260608-08-successor-adr-gate-compat-matrix/spec.md`

## Constraints

- 不重开 frozen roadmap。
- 不引入 React、Vue、TypeScript application code 或 SPA router。
- 不把 database-first storage、Canvas/Artifacts side workspace、rich in-chat work block、tools/MCP/code execution、automation 或 `/lib.js` replacement 作为普通小切片处理。
- 不移动 `messageFormatting()`、`getMessageTextHTML()`、`StreamingProcessor`、slash-command parser 或 extension mount points，除非对应 spec 单独批准并有 proof。
- 保持 `#chat > .mes`、`.mes_text`、`.mes[mesid]`、`.last_mes`、`eventSource`、`event_types`、`@sillytavern/*` 等兼容表面稳定。

## Evidence Trail

- `.docs/tech/modernization-roadmap.md`
- `.docs/tech/main-chat-successor-scope.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `.docs/tech/main-chat-performance-evidence.md`
- `.docs/tech/main-chat-ux-trend-recommendations.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-streaming.e2e.js`
- `tests/chat-workspace-structure.test.js`
- `tests/third-party-extension-compatibility.test.js`
- https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt
- https://help.openai.com/en/articles/9930697-what-is-the-canvas-featue-in-chatgpt-and-how-do-i-use-it
- https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- https://support.anthropic.com/en/articles/9517075-what-are-projects
- https://support.anthropic.com/en/articles/11088861-using-research-on-claude-ai
- https://support.google.com/gemini/answer/15719111
- https://docs.openwebui.com/features
- https://docs.openwebui.com/features/extensibility/plugin/tools/
- https://docs.openwebui.com/features/chat-conversations/web-search/agentic-search/
- https://docs.msty.ai/studio/
- https://docs.msty.ai/claw/overview
- https://www.perplexity.ai/help-center/en/articles/10352961-what-are-spaces/

## Implementation Traceability

Status on 2026-06-08: delivered and ready for archival through `delivery-workflow` wrap-up.

Durable owner docs:

- `.docs/db/pages/chat-workspace.md` records provider failure recovery, long-chat jump-to-latest, and mobile reachability states.
- `.docs/db/features/chat-message-rendering.md` records long-chat jump-to-latest and failure-row identity behavior.
- `.docs/db/features/chat-message-actions.md` records action priority, touch reachability, and failure retry action behavior.
- `.docs/tech/main-chat-successor-scope.md` records the successor gate classification matrix and trend-gated ADR categories.
- `.docs/tech/main-chat-ux-trend-recommendations.md` records the current competitor-trend pressure map and UX correction backlog.
- `.docs/PROJECT_HISTORY.md` records the 2026-06-08 main-chat recovery and successor gate hardening evolution entry.

Implemented code and proof surfaces:

- `public/script.js`
- `public/style.css`
- `public/scripts/chat-message-actions-controller.js`
- `public/scripts/chat-message-render-descriptor.js`
- `public/scripts/chat-streaming-control-state.js`
- `tests/chat-message-actions-controller.test.js`
- `tests/chat-message-render-descriptor.test.js`
- `tests/chat-streaming-control-state.test.js`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-streaming.e2e.js`
- `tests/chat-message-layout.e2e.js`
- `scripts/interaction-performance-runner.mjs`

Validation status:

- Focused unit, compatibility, and performance-helper tests passed: `bun run --cwd tests test:unit -- chat-message-actions-controller.test.js chat-message-render-descriptor.test.js chat-streaming-control-state.test.js chat-workspace-structure.test.js third-party-extension-compatibility.test.js interaction-performance-report.test.js --runInBand`.
- Browser layout proof passed: `bun run --cwd tests test:e2e -- chat-message-layout.e2e.js`.
- Browser rendering proof passed on the current worktree with mobile long-chat recovery: `bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js`.
- Browser streaming proof passed serially with unique user/data-root/port: `bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js`. The provider-failure test verifies retry click recovery without duplicating the original user row.
- Compatibility gate passed: `bun run test:compat`.
- Semantic docs passed: `bun run docs:check`.
- Main-chat long-load-more runner evidence was recorded under ignored `artifacts/interaction-perf/2026-06-08T03-33-51-086Z/report.md` and `artifacts/interaction-perf/2026-06-08T03-34-57-221Z/report.md`; this supports evidence-only closure and does not claim a performance win.

Delivered boundaries:

- Provider failure recovery is local UI recovery, not scheduled retry or provider protocol change.
- Long-chat recovery is jump-to-latest only, not search, jump-to-message, range indicators, or summaries.
- Mobile work is proof and targeted reachability hardening, not a full mobile redesign.
- Row and streaming helpers are narrow decision boundaries; they do not own message body formatting, token append, provider retry, event timing, or public extension APIs.
- Project memory, artifact/canvas side workspace, rich in-chat work blocks, RAG/knowledge stacks, source-aware research, tools, MCP, code execution, automations, framework migration, storage migration, provider protocol rewrite, and `/lib.js` replacement remain ADR-backed successor categories.
- Future context/tool work must define pre-send scope disclosure and post-response usage/source evidence before implementation.

## Change History

- 2026-06-08: 创建下一阶段 main-chat successor spec set 的用户意图记录，作为 8 个新规格的上游 brief。
- 2026-06-08: 按 grill-with-docs 自问自答和联网竞品资料修订方向：小切片聚焦恢复、导航、移动可达、兼容 gate；Canvas/Artifacts/Deep Research/知识栈类方向保留为 ADR-backed successor，不进入普通小规格。
- 2026-06-08: 新增 UX trend recommendations 文档并回链本 brief；明确最新竞品趋势对应的 EmberDesk 修正顺序和 ADR gate。
- 2026-06-08: 补充实施 traceability，记录 8-spec set 已交付的 durable owner docs、code/test proof surfaces、验证状态和未交付边界。
- 2026-06-08: 按 2026 最新竞品信号补充上下文/工具 scope disclosure、post-response source/tool evidence、rich in-chat work block 与本地所有权修正意见。
