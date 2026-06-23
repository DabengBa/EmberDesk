---
created: 2026-06-21
source: user
confirmed: true
last_updated: 2026-06-21
---

# React Phase 3 Sprint 8 Main Chat Message Actions Bridge Intent

## User Original Request

用户先要求把 Phase 3 后续未完成 Sprint 收敛成可审批、可 delivery 的实施规格，覆盖 streaming control、input basic、input slash、message actions 和 integration。

在后续交付节奏上，用户又明确接受“写一个 specs 然后 delivery，然后下一个，直到完成 phase3”的连续推进方式。因此，Sprint 8 的目标不是解释 message actions 现状，而是把这块路线图 stub 收敛成一个可以真实落地、可验证、可 wrap-up 的 main-chat bridge 切片。

## Background & Motivation

截至 2026-06-21，Phase 3 前序交付已经确认：

1. `features.react.panels.mainChatMessageList` 是当前主聊天迁移的唯一 guarded React island。
2. `public/script.js`、`chat-message-actions-controller.js` 和既有 `.mes` row handlers 仍然拥有可见 message actions 的交互、编辑、删除、复制、重试和 swipe 行为。
3. 现有路线图里的 “消息操作菜单 React 化” 说法过粗，如果直接照抄，很容易误导成“马上用 React 重画 visible buttons / menu”。
4. 当前真实可交付的最小边界，是让 React hidden island 只消费安全的 message-action snapshot，在 protected row 里插入 hidden owner marker，而不是夺走 legacy controls owner。

因此，Sprint 8 必须被落实为 message actions bridge boundary，而不是一次高风险的 visible menu ownership cutover。

## Intent Domains

### Domain: Sprint 8 只交付 hidden message-actions bridge，不重写 visible buttons

- **User expectation:** Phase 3 要继续向前推进，但每个 Sprint 都必须从当前代码事实出发，避免把路线图文案直接误翻译成过度迁移。
- **Current status:** delivered
- **Change history:**
  - 2026-06-21: 用户要求把 Phase 3 后续 Sprint 收敛成可 delivery 的规格，并继续推进实际交付
  - 2026-06-21: Sprint 8 被落地为 `messageActionSnapshots` bridge 和 hidden owner-marker boundary，而不是新的 visible `MessageActions.tsx`
- **Implementation traceability:** code `public/script.js`, `app/workspace-panels.tsx`; tests `tests/react-workspace-panels-helpers.test.js`, `tests/chat-message-rendering.e2e.js`; owning docs `.docs/db/features/chat-message-actions.md`, `.docs/db/pages/chat-workspace.md`, `.docs/tech/react-modernization-roadmap.md`; commit `this wrap-up commit`; delivery status `delivered hidden bridge and marker boundary without visible React action buttons`

### Domain: Legacy message-action affordances and handlers remain the visible interaction owner

- **User expectation:** 用户看到的 Message Actions、Copy、Edit、Delete、Retry、Swipe、Reasoning 等入口不能被这次 React bridge 回归或替换。
- **Current status:** delivered
- **Change history:**
  - 2026-06-21: 交付明确保留 `.extraMesButtonsHint`、`.extraMesButtons` 和既有 message-action handlers
  - 2026-06-21: review 期间继续确认 delete confirmation、edit mode、copy 和 mobile reachability 仍由 legacy surface 驱动
- **Implementation traceability:** code `public/scripts/chat-message-actions-controller.js`, `public/script.js`; proof `tests/chat-message-actions-controller.test.js`, `tests/chat-message-layout.e2e.js`, `tests/chat-message-rendering.e2e.js`, `tests/chat-workspace-structure.test.js`; owning docs `.docs/db/features/chat-message-actions.md`, `.docs/tech/third-party-extension-compatibility.md`; commit `this wrap-up commit`; delivery status `delivered while keeping legacy visible owner semantics`

### Domain: Hidden action snapshots must fail closed and stay synchronized with current DOM action state

- **User expectation:** React 只能读取当前 DOM 里真实存在、且仍然安全可认领的 action state；如果 row 不合法、schema 不通过或状态变化不同步，就必须 fail-closed。
- **Current status:** delivered
- **Change history:**
  - 2026-06-21: `MESSAGE_ACTION_TIERS` 被复用为唯一 tiers 来源，snapshot 只描述真实 DOM action names，不记录消息文本
  - 2026-06-21: final review 修复了 legacy open/close 后 hidden `expanded` snapshot 滞后的缺口，controller 现在会在 DOM 状态变化后通知 React bridge 重新取样
- **Implementation traceability:** code `public/scripts/chat-message-actions-controller.js`, `public/script.js`, `app/workspace-panels.tsx`; tests `tests/chat-message-actions-controller.test.js`, `tests/react-workspace-panels-helpers.test.js`, `tests/chat-message-rendering.e2e.js`; logic docs `.docs/logic-description/main_chat_message_actions_bridge_processing_flow.md`, `.docs/logic-description/main_chat_message_actions_bridge_sandbox_proof.py`; commit `this wrap-up commit`; delivery status `delivered with fail-closed snapshots and review-hardened expanded-state sync`

### Domain: TanStack adoption remains honest: reuse Zod and the shared Query shell, not fake form/query ownership

- **User expectation:** 路线图要继续严格推动 TanStack Form / Query / Zod，但不能为了“形式完整”把纯 DOM-derived action snapshot 伪装成新的 form owner 或 server query。
- **Current status:** delivered
- **Change history:**
  - 2026-06-16 起: 用户明确要求路线图严格推动 TanStack Form / Query / Zod 采用
  - 2026-06-21: Sprint 8 真实采用的是 Zod snapshot schema 与既有 shared Query-backed workspace shell；没有伪造新的 TanStack Form 或远端 query owner
- **Implementation traceability:** code `app/workspace-panels.tsx`; tests `tests/react-workspace-panels-helpers.test.js`; docs `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`, `.docs/tech/react-modernization-roadmap.md`; commit `this wrap-up commit`; delivery status `delivered on the shared TanStack Query shell with Zod validation, without inventing fake form ownership`

## Non-Goals

- 不新增 visible React message-actions toolbar 或 per-row action buttons renderer
- 不改变 `.extraMesButtonsHint`、`.extraMesButtons`、`.mes_edit_delete`、`.mes_edit_done` 等 protected selectors
- 不迁移 message edit mode owner
- 不迁移 provider transport、token append、composer 或 slash-command 执行 surface
- 不把 message actions snapshot 保存进 chat 或其他 canonical data

## Source Evidence

- `.docs/PROJECT_HISTORY.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/db/features/chat-message-actions.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/logic-description/main_chat_message_actions_bridge_processing_flow.md`
- `.docs/logic-description/main_chat_message_actions_bridge_sandbox_proof.py`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `public/scripts/chat-message-actions-controller.js`
- `public/script.js`
- `app/workspace-panels.tsx`
- `tests/chat-message-actions-controller.test.js`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-layout.e2e.js`
- `tests/react-workspace-panels-helpers.test.js`
- `tests/chat-workspace-structure.test.js`
