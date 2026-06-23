# Main Chat Successor Spec Set Intent

Date: 2026-06-07

## Original Request

用户先要求“阅读roadmap,确定接下来10步工作内容”，随后确认“分别编写10个spec,对应这10点”。

## Context

`.docs/tech/modernization-roadmap.md` 已在 2026-06-05 冻结，明确要求后续工作从 successor proposal 或 ADR-backed design 启动，不能把新实现切片追加到旧 roadmap。

2026-06-06 已交付两个 post-roadmap successor proof：

- `260606-01-chat-message-affordance-proof`
- `260606-02-chat-message-rendering-proof`

这些 proof 为主聊天工作区后续渲染、操作、streaming、兼容和性能工作建立了初始保护网，但没有启动生产渲染或 streaming 重构。

## UX Trend Basis

2026-06-07 的修订把这组 specs 从单纯工程 proof 调整为用户体验导向的 successor 序列。竞品和同类工具的共同趋势是：

- ChatGPT Projects 把聊天、文件、工具、Canvas 和协作放进长期任务上下文中心。
- ChatGPT Canvas 和 Claude Artifacts 把长内容、代码、可编辑产物放到聊天旁边的独立工作区，而不是只依赖线性消息流。
- Gemini Deep Research 强调计划、过程和报告的可见性，用户能理解系统正在推进什么。
- Open WebUI 和 Msty 强调知识、工具、模型、web/search 等入口在聊天工作区内可发现。

这些趋势不等于当前 specs 立即引入 Canvas、Artifacts、agentic tasks 或 database-first storage。它们只用于修正验收重点：更快恢复上下文、更清楚地看到生成状态、更稳地中断和恢复、更容易在长聊天中定位内容、更可靠地发现消息操作。

## Intent

为主聊天工作区 successor work 拆成 10 个独立、可审批、可交付的规格，顺序覆盖：

1. successor 范围锁定
2. 当前 baseline 验证
3. 渲染调用链地图
4. 非 streaming 消息渲染 helper 提取
5. 消息 DOM identity 合约加强
6. 长聊天渲染窗口 proof
7. streaming browser proof
8. 消息操作 controller 边界
9. 主聊天 interaction performance evidence
10. successor closure docs 和 release gate

## Constraints

- 不向已冻结的 `.docs/tech/modernization-roadmap.md` 追加实现 slice。
- 不引入 React、Vue、TypeScript application code 或 SPA router。
- 不把数据库变成 canonical storage；角色、聊天、world info 继续以文件为 canonical source。
- 不移动或重写 `messageFormatting()`、`StreamingProcessor`、slash-command parser、extension mount points，除非某个后续 spec 明确批准且提供独立 proof。
- 保持 `#chat > .mes`、`.mes_text`、`.mes[mesid]`、`eventSource`、`event_types`、`@sillytavern/*` 等兼容表面稳定。
- 每个 spec 只描述一个 shippable slice；实现前仍需要用户批准。

## External References

- ChatGPT Projects: https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt
- ChatGPT Canvas: https://openai.com/index/introducing-canvas/
- Claude Artifacts: https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- Gemini Deep Research: https://support.google.com/gemini/answer/15719111
- Open WebUI features: https://docs.openwebui.com/features
- Open WebUI tools: https://docs.openwebui.com/features/extensibility/plugin/tools/
- Msty Knowledge Stacks: https://docs.msty.ai/studio/knowledge-stacks/overview

## Archived Delivery Set

The approved process specs for this batch were temporary delivery-workflow artifacts and were deleted during wrap-up. Durable traceability remains in this brief, `.docs/tech/main-chat-successor-scope.md`, `.docs/tech/main-chat-baseline-validation.md`, `.docs/tech/main-chat-rendering-call-chain.md`, `.docs/tech/main-chat-performance-evidence.md`, and `.docs/PROJECT_HISTORY.md`.

The delivered slices were:

1. successor scope lock
2. main-chat baseline validation
3. rendering call-chain map
4. stored-message render descriptor helper
5. message DOM identity contract hardening
6. long-chat render-window proof
7. streaming browser proof
8. message-actions controller boundary
9. main-chat interaction-performance evidence
10. successor closure gate

## Implementation Traceability

Status on 2026-06-08: delivered and ready for archival through `delivery-workflow` wrap-up.

Durable owner docs:

- `.docs/tech/main-chat-successor-scope.md` records successor scope, validation matrix, closure checkpoint, protected surfaces, UX evidence fields, and future candidates.
- `.docs/tech/main-chat-baseline-validation.md` records the main-chat baseline validation evidence.
- `.docs/tech/main-chat-rendering-call-chain.md` records the current rendering, long-chat, user append, finalized message, and streaming call-chain map.
- `.docs/tech/main-chat-performance-evidence.md` records interaction-performance scenario ownership, metrics, dataset shape, and interpretation caveats.
- `.docs/tech/frontend-jquery-slice-migration.md` records the message-actions controller boundary.
- `.docs/tech/third-party-extension-compatibility.md` records the protected message-row DOM contract.
- `.docs/PROJECT_HISTORY.md` records the 2026-06-08 main-chat successor proof closure.

Implemented code and proof surfaces:

- `public/scripts/chat-message-render-descriptor.js` and `tests/chat-message-render-descriptor.test.js`
- `public/scripts/chat-message-actions-controller.js` and `tests/chat-message-actions-controller.test.js`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-streaming.e2e.js`
- `tests/chat-workspace-structure.test.js`
- `scripts/interaction-performance-runner.mjs`
- `src/interaction-performance-report.js`
- `tests/interaction-performance-report.test.js`

Validation status:

- Focused unit, E2E, compatibility, docs, and interaction-performance runner evidence was recorded during delivery and preserved through the durable owner docs listed above.
- Current delivered behavior does not include Canvas/Artifacts side workspace, database-first storage, provider-error retry UX, long-chat search/jump/range indicators, or a SPA/TypeScript migration.

## Change History

- 2026-06-07: 创建主聊天 successor 10-spec set 的用户意图记录，作为十个规格的上游 brief。
- 2026-06-08: 补充实施 traceability，记录 10-spec set 已交付的 durable owner docs、code/test proof surfaces、验证状态和未交付边界。
