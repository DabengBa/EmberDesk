# Chat Message Rendering Proof Intent

Date: 2026-06-06

## Original Request

用户在已交付 `260606-01-chat-message-affordance-proof` 后询问“根据 roadmap, 下一步工作是什么”。根据已冻结的 `.docs/tech/modernization-roadmap.md`，下一步不应继续追加 roadmap slice，而应启动 successor proposal / ADR-backed design。用户随后确认“建吧”。

## Intent

为主聊天工作区 successor work 创建第二个可交付规格。该规格不直接重构 `messageFormatting()`、`updateMessageElement()`、`addOneMessage()` 或 `StreamingProcessor`，而是先建立普通非 streaming 消息从已存在 chat JSONL 到浏览器 DOM 的真实 proof。

这个 proof 的目的，是在后续真正改 message rendering、streaming、slash-command message injection 或 extension-facing message surfaces 前，先拥有可重复的浏览器级失败信号。

## Constraints

- 不向已冻结的 `.docs/tech/modernization-roadmap.md` 追加新的 implementation slice。
- 不拆 `StreamingProcessor`，不改变 streaming token 渲染或 generation 事件时序。
- 不移动或重写 `messageFormatting()`、`getMessageTextHTML()`、`updateMessageElement()`、`addOneMessage()`、`printMessages()`。
- 不改变 `#chat > .mes`、`.mes_text`、`.mes[mesid]`、`is_user`、`is_system`、swipe controls、reasoning wrapper、media/file wrapper。
- 不改变 slash-command parser、extension mount points、`@sillytavern/*` aliases、`eventSource` / `event_types`。
- 不依赖外部 API key 或 provider response；proof 必须使用 Playwright seed data 或本地 fixture。
- UI 变更不是本切片目标；现有 dense workspace 视觉方向保持不变。

## Recommended Slice

“Chat message rendering proof”：新增真实 app browser proof，使用 Playwright webServer 的 seed dev profile 打开主工作区，选择或加载 seeded character chat，验证普通已存消息渲染为稳定 `.mes` DOM：

- `#chat > .mes[mesid]` 存在且数量来自 seeded chat。
- `.mes_text` 可见且内容与对应 seed chat JSONL message 保真。
- 用户消息和角色消息都保留 `is_user` / `is_system` 语义。
- `.mes_text` 布局不被居中。
- message action affordance、swipe/reasoning/media wrapper 的关键 DOM identity 不被破坏；默认可见操作和通过现有 `Message Actions` 展开入口出现的操作都应能被 role/name proof 覆盖。
- 首条 message text 可见时间被记录，先作为 proof evidence / warning，不在本切片声明性能优化。
- 长聊天初始渲染不会一次性炸 DOM：当 chat 超过 truncation 上限时，初始 message DOM 数量受限且 `#show_more_messages` 可见。

选择原因：

- 已交付的 `260606-01-chat-message-affordance-proof` 保护了消息操作控件，但没有证明真实 chat 数据加载到 message DOM 的链路。
- `getChat()`、`printMessages()`、`redisplayChat()`、`updateMessageElement()`、`getMessageTextHTML()`、`messageFormatting()` 是未来 message rendering refactor 的高风险路径。
- 使用 seed dev environment 可以避免 API key、provider latency、streaming 和网络不确定性。
- Msty 的 command palette、ChatGPT desktop 的系统级快捷入口、Claude artifacts 的独立工作空间，以及 SillyTavern release notes 中对 chat/streaming/layout 的持续修复，共同说明现代聊天工作区的 UX 竞争点已经从“消息能显示”升级为“历史可快速恢复、内容可信、长会话不拖垮界面、操作可继续发现”。本切片只吸收这些趋势中与 rendering proof 直接相关的底层证据，把 command palette、artifact/side panel 和 streaming UX 留给后续规格。

## Implementation Traceability

Delivered status: delivered on 2026-06-06.

Delivered proof surfaces:

- `tests/chat-message-rendering.e2e.js`: real app browser proof for seeded stored chat rendering, JSONL-to-DOM text fidelity, first visible message timing annotation, long-chat truncation, real rendered-row action affordance, and console-error hygiene.
- `tests/chat-message-layout.e2e.js`: retained synthetic layout proof for message box centering without centered message text.
- `tests/chat-workspace-structure.test.js`: retained static structure proof for message template identity.
- `tests/third-party-extension-compatibility.test.js`: retained compatibility gate for extension, slash-command, event, and protected DOM surfaces.

Delivered documentation surfaces:

- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/PROJECT_HISTORY.md`

## Change History

- 2026-06-06: 记录第二个主聊天 successor slice 的用户意图，并把范围限定为普通非 streaming 消息渲染 proof，不进入渲染或 streaming 重构。
- 2026-06-06: 按 UX 竞争力复审修订 intent：proof 从 DOM 存在升级为内容保真、首条消息可见时间记录、长聊天 truncation 保护、真实 rendered row action affordance 与 console hygiene；command palette、message search/jump、artifact-style side workspace 和 streaming UX 明确延后。
- 2026-06-06: 交付真实 app 消息渲染 proof、`feature.chat_message_rendering` 语义文档和 chat workspace 关联；未改变 production rendering、streaming、provider、slash-command 或 extension behavior。
