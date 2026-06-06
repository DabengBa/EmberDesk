# Chat Message Affordance Proof Intent

Date: 2026-06-06

## Original Request

用户在 modernization roadmap 冻结后询问“根据 roadmap, 下一步工作是什么”，确认下一步应启动 successor proposal / ADR-backed design；随后要求“写一个新的 spec”。

## Intent

为主聊天工作区 successor work 创建第一个可交付规格。该规格不直接重构 message rendering 或 streaming，而是先补强消息行操作的可发现性与兼容性证明，为后续更高风险的 `messageFormatting()`、`StreamingProcessor`、slash-command 和 extension surface 工作建立保护网。

## Constraints

- 不向已冻结的 `.docs/tech/modernization-roadmap.md` 追加新的 implementation slice。
- 不拆 `StreamingProcessor`、不移动 `messageFormatting()`、不改变 `.mes_text` 的渲染语义。
- 不改变 `#chat > .mes`、`.mes_text`、`.mes[mesid]`、swipe class、reasoning wrapper、extension mount point、`eventSource` / `event_types` 或 slash-command public exports。
- 不引入 React、Vue、TypeScript application code 或 SPA router。
- UI 变更必须保留当前 dense workspace 方向，并以浏览器 proof 验证可见路径。

## Recommended First Slice

“Chat message affordance proof”：在 `#message_template` 的现有消息操作控件上增加稳定 role/name/focus affordance，并新增结构与浏览器证明，确认消息行操作可被 role/name 发现，同时冻结消息 DOM 兼容合约。

选择原因：

- roadmap 明确把主聊天工作区、消息渲染和 streaming 列为 successor entry point，需要独立设计和 browser proof。
- 当前 repo 已有 chat send-form affordance 证明，但消息行自身仍缺少同等级保护。
- `StreamingProcessor` 和消息渲染路径与 reasoning、swipes、tool calls、media、token counters、events、extensions 交织，直接拆分风险过高。

## Implementation Traceability

Delivered status: delivered on 2026-06-06.

Delivered code surfaces:

- `public/index.html`: added role/name/focus affordance to existing message-row actions in `#message_template` and media gallery controls in `#message_gallery_controls`.

Delivered proof surfaces:

- `tests/chat-workspace-structure.test.js`: freezes message-template DOM identity and in-scope action role/name/focus attributes.
- `tests/chat-message-layout.e2e.js`: browser proof for visible message-row layout and role/name discovery of common message actions.
- `tests/third-party-extension-compatibility.test.js`: compatibility gate for protected extension and slash-command surfaces.

Delivered documentation surfaces:

- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-actions.md`

## Change History

- 2026-06-06: 记录 successor spec 的用户意图，并把第一个可交付切片限定为消息行 affordance 与 rendering contract proof。
- 2026-06-06: 交付消息行操作 role/name/focus affordance、结构测试、浏览器 proof、`feature.chat_message_actions` 语义文档；未改变 message rendering、streaming、slash-command 或 extension mount behavior。
