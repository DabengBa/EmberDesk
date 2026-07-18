---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-18
feature_slug: react-main-chat-transport-retirement
status: delivered
---

# React Main Chat Transport Retirement Intent

## 原始请求

用户要求 Main Chat 放在最后阶段完成，但不能通过删除 non-OpenAI、group、dry-run、nested、quiet/background 或自动化行为来清理 legacy。

## 目标结果

React Main Chat orchestration 与 framework-neutral generation services 覆盖全部 generation family、streaming、stop、retry/fallback 和 events；`Generate()`、`StreamingProcessor`、visible/quiet bridge 与 legacy transport owner 删除或收缩为薄 public delegator。

## Checkpoint A

- **目标结果**：所有用户和扩展触发的 generation 共享一个明确 transport/lifecycle owner。
- **当前状态**：React 只接管标准 OpenAI visible direct-chat 的部分 request；其他 provider/group/dry-run/nested/quiet/background 仍由 legacy `Generate()`/`StreamingProcessor`。
- **假设**：provider payload builders 与 endpoints 可复用并迁入 service，不改变 backend API。
- **硬约束**：保留 stop/abort、continue/swipe、bounded recovery、fallback provider、events、quiet return-string/no-row、group semantics 和 JS-Slash-Runner generate functions。
- **风险边界**：不同 request family 的 row baseline、streaming finalization、tool calls、abort 和 event timing不同。
- **未决问题**：无。
- **推荐默认**：建立统一 generation command/lifecycle service，以 request kind capabilities 明确差异；React visible UI 与 public automation adapters 调用同一 service。

## 范围边界

- 包含 transport、provider routing、request assembly、streaming lifecycle、recovery、quiet/background、group/dry-run/nested 和 legacy transport 删除。
- 不完成 message row renderer/windowing；由下一 spec 处理。

## 变更历史

- 2026-07-16：创建 Main Chat transport full-owner 包。
- 2026-07-17：交付统一 generation command/lifecycle service；未扩大到独立的 renderer/windowing 迁移。
- 2026-07-18：UX 走查发现 React composer 中真实 stop pointer click 未被同一 action 边界接管；已改为 bridge 委托现有停止 lifecycle。移动端 Character Authoring 覆盖层的独立可达性问题未并入本切片。

## 最终追溯

- `public/script.js`
- `public/scripts/chat-generation-command-service.js`
- `public/scripts/chat-generation-lifecycle.js`
- `public/scripts/chat-generation-auto-recovery.js`
- `app/workspace-panels.tsx`
- `tests/chat-generation-command-service.test.js`
- `tests/chat-message-streaming.e2e.js`
- `.docs/tech/main-chat-generation-lifecycle.md`
- `.docs/tech/legacy-cutover-ledger.md`
- `.docs/db/pages/chat-workspace.md`
