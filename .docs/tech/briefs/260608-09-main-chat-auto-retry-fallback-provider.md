# Main Chat Auto Retry Fallback Provider Intent

Date: 2026-06-08

## Original Request

用户想要增加一个窗口，用于维护第二个 `baseURL` 和 API key，作为“备用服务商”。已有“空回复时重试”按钮；现在希望调整为：空回复时自动重试一次，如果仍然空回复，则使用备用服务商重试一次；如果仍然空回复，再像之前一样显示“重试”按钮。

## Context

当前 main-chat recovery hardening 已交付 provider-failure 行内手动重试、长聊天 jump-to-latest、移动端可达性 proof 和 streaming 控制状态 helper。既有边界明确写过 provider failure recovery 是本地 UI 恢复，不是 scheduled retry 或 provider protocol change。

本轮讨论改变了该边界：用户明确要求把空回复、网络报错、provider failure、流中断都纳入同一条自动恢复流，并新增备用 OpenAI-compatible 服务商配置。

## Intent

把主聊天区用户可见生成的失败恢复从“立刻让用户手动重试”升级为有限自动恢复：

1. 主服务商正常生成。
2. 如果出现空回复、网络报错、provider failure 或流中断，自动用主服务商重试一次。
3. 如果仍失败，自动使用备用 OpenAI-compatible 服务商重试一次。
4. 如果备用服务商仍失败，再显示现有手动“重试”入口。

备用服务商只维护 `baseURL + API key + model`，只在备用重试那一次临时覆盖请求，不改变用户当前主服务商配置。

## Confirmed Product Decisions

- 自动恢复覆盖空回复、网络报错、provider failure 和流中断。
- 备用服务商只支持 OpenAI-compatible，不扩展到 Claude、Google AI Studio 或 Vertex AI 协议。
- 备用配置包含 `baseURL + API key + model`。
- 如果某次失败已经流出半截文本，自动重试成功后不保留半截文本为聊天内容。
- 自动重试过程需要轻量可见状态，例如“正在重试”和“正在使用备用服务商”。
- 范围只覆盖主聊天区用户可见生成，不覆盖 `quiet` generation、总结、记忆、插件后台请求或扩展脚本 `generate/generateRaw`。
- 备用服务商 UI 应嵌入 API Connections 抽屉的连接配置区，不作为独立弹窗、向导或 Connection Profile 子流程；主聊天自动恢复状态应显示在当前助手消息行内。

## Constraints

- 不改变 `chat` 顺序、`.mes[mesid]`、`.mes_text`、`.last_mes`、`eventSource`、`event_types` 或 `@sillytavern/*` 兼容表面。
- 不引入 React、Vue、TypeScript application code 或 SPA 框架。
- 不把备用服务商做成通用连接路由系统，也不替换 Connection Profile。
- 不把备用 API key 明文写入普通设置文件；应复用现有 server-side secret 机制或等价安全边界。
- 不自动重放后台/插件生成，避免费用、日志、权限和兼容性不可解释。

## Grill Review Addendum: 2026-06-08

用户要求本轮不要继续提问，而是联网搜索、自问自答，并使用 Claude Code 只读复核后综合修改文档。

外部证据转译为本项目边界：

- OpenAI Chat Completions streaming 返回 `chat.completion.chunk` 序列，SSE/stream 可能在最终 chunk 前断开；因此“流中断”必须是显式 recoverable failure，而不是等同于用户主动停止。
- OpenAI rate limit 文档和 Help Center 均说明 429 需要 pace/backoff，且失败请求也会消耗 per-minute 限额；因此本设计保持固定三段链，不增加可配置次数，不做无限重发。
- MDN Server-Sent Events 文档说明 `text/event-stream` 是持续文本流，连接错误和关闭需要单独处理；因此自动恢复需要统一收敛 streaming error、network error 和后端非 2xx，而不是只靠最终空文本检测。

Claude Code 只读复核接受的修正：

- 锁定备用 API key 使用专用 secret key，例如 `SECRET_KEYS.OPENAI_FALLBACK`，避免复用主 OpenAI secret namespace 污染主 key 生命周期。
- 明确 fallback request 使用备用 `baseURL/model` 和 server-resolved fallback secret，不改变主 `oai_settings`、主 secret active id 或 Connection Profile。
- 定义统一的 `isRecoverableGenerationFailure()` 判定边界，覆盖空回复、网络异常、后端/provider error、流式连接异常和非用户主动 abort。
- 明确 `CHARACTER_MESSAGE_RENDERED` 只在最终成功或最终失败时发出一次；自动重试中间步骤不发完成事件。
- 明确 429/503 等 rate/overload 错误最多使用一次有上限的短延迟，不增加额外重试次数。
- 在 UI 上提示备用服务商启用会产生额外 API 成本。

Claude Code 建议但本轮拒绝的点：

- “最终失败后保留最后一次半截文本”与用户已确认的“不保留”冲突。本规格继续要求最终失败也不把半截文本保留为聊天内容、swipe、历史字段或隐藏字段。

## Evidence Trail

- `.docs/PROJECT_HISTORY.md`：记录 2026-06-08 main-chat recovery hardening。
- `.docs/tech/briefs/260608-01-main-chat-next-successor-spec-set.md`：旧边界写明 provider failure recovery 不是 scheduled retry 或 provider protocol change，本轮作为最新意图覆盖它。
- `.docs/tech/main-chat-ux-trend-recommendations.md`：恢复状态必须可见、不能丢用户消息或重复空助手行。
- `.docs/db/pages/api-configuration.md`、`.docs/db/features/custom-base-url.md`、`.docs/db/features/connection-profile.md`：现有 API 配置、base URL/API key 和连接档案边界。
- `.docs/db/pages/chat-workspace.md`、`.docs/db/features/chat-message-rendering.md`、`.docs/db/features/chat-message-actions.md`：主聊天、消息渲染、失败重试语义所有者。
- `.docs/tech/third-party-extension-compatibility.md`：消息行 DOM、事件和 slash-command 兼容表面。
- `public/script.js`：`Generate()`、`StreamingProcessor`、`sendGenerationRequest()`、`showGenerationFailureRecovery()`、空回复 `.empty_reply_regenerate`。
- `public/scripts/openai.js`：`createGenerationParameters()`、`sendOpenAIRequest()`、`reverse_proxy`、`proxy_password`、`openai_model`、统一 API key UI 处理。
- `src/endpoints/backends/chat-completions.js`：OpenAI-compatible `/chat/completions` 请求转发和 `reverse_proxy`/`proxy_password` 处理。
- `src/endpoints/secrets.js`、`public/scripts/secrets.js`：server-side secret 存储和前端写入接口。
- OpenAI API Reference, Chat Completions: `POST /chat/completions`，给定 conversation messages 返回模型回复；streaming response 使用 `chat.completion.chunk`。
- OpenAI Rate Limits guide / Help Center: 429 需要 pacing/backoff，失败请求也会消耗 per-minute 限额。
- MDN Server-Sent Events: `text/event-stream` 是持续 UTF-8 文本流，连接错误和关闭需要独立处理。
- Claude Code 只读复核参考结论已综合取舍后写入本 brief 和 spec；临时评审报告不作为持久追溯文件保存。

## Implementation Traceability

- Delivery status: delivered and wrap-up archived on 2026-06-08.
- Commit: wrap-up commit `feat(chat): keep a fallback line ready for recovery`.
- UI configuration path: `public/index.html`, `public/style.css`, and `public/scripts/openai.js` add an inline API Connections fallback provider section with enabled, Base URL, model, dedicated API key save/clear controls, status chip, and cost warning.
- Secret boundary path: `public/scripts/secrets.js`, `src/endpoints/secrets.js`, and `src/endpoints/backends/chat-completions.js` add `SECRET_KEYS.OPENAI_FALLBACK` and resolve only the fixed browser marker `openai_fallback_provider` to the fallback secret.
- Recovery coordinator path: `public/scripts/chat-generation-auto-recovery.js` defines fallback readiness and recoverable failure helpers; `public/script.js` coordinates primary, primary retry, optional fallback retry, partial text cleanup, stop exclusion, and final manual retry state for visible main-chat generation only.
- Documentation path: `.docs/db/features/fallback-provider.md`, `.docs/db/features/chat-generation-auto-recovery.md`, `.docs/db/pages/api-configuration.md`, `.docs/db/pages/chat-workspace.md`, `.docs/db/features/chat-message-rendering.md`, and `.docs/db/features/chat-message-actions.md` describe the final user-visible semantics.
- Validation evidence: `bun run --cwd tests test:unit -- chat-streaming-control-state.test.js openai-provider-capabilities.test.js secrets-input-map.test.js chat-completions-openai-fallback.test.js chat-workspace-structure.test.js chat-generation-auto-recovery.test.js --runInBand` passed 48 tests; `bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js` passed 8 tests; `bun run test:compat` passed 8 tests; `bun run docs:check` validated 27 semantic docs; `bun run docs:build` rebuilt the 27-document semantic bundle.

## Change History

- 2026-06-08: 创建本 brief，记录用户已确认的自动重试与备用 OpenAI-compatible 服务商范围；明确该意图覆盖旧的“provider failure 只做本地 UI 恢复，不做自动重试/provider protocol change”边界。
- 2026-06-08: 按用户要求执行联网搜索和 Claude Code 只读复核；综合后锁定专用 fallback secret、统一 recoverable failure 判定、有限 rate/overload 延迟、事件发出时机和费用可见性，并拒绝“最终失败保留半截文本”的冲突建议。
- 2026-06-08: 按 `impeccable` 产品 UI 规则补充 UI 决策：备用服务商作为 API Connections 内嵌紧凑配置区，主聊天恢复状态作为消息行内状态，不新增弹窗向导或第二套重试按钮体系。
- 2026-06-08: 交付实现并完成 wrap-up 前评审；修复备用服务商状态 chip 在缺少专用 API key 时误显示 ready 的问题，最终交付记录写入 `.docs/PROJECT_HISTORY.md` 和语义文档。
