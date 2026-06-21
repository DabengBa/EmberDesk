# Phase 3 Sprint 8: 消息操作 - 菜单

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 8（全局 Sprint 21/40）
- **预计工期**：2 周
- **风险等级**：中

---

## 目标

在不改写 visible message actions owner 的前提下，交付主聊天 message actions 的 hidden bridge boundary：让 `features.react.panels.mainChatMessageList` guarded island 读取安全的 per-row action snapshot，并在既有 `.mes_buttons` 内附加 hidden owner marker。

本 Sprint 已按实际代码边界收敛为 `messageActionSnapshots` bridge / hidden marker 交付。它不是新的 `MessageActions.tsx` visible renderer，也不把 copy/edit/delete/regenerate/swipe/reasoning handlers 从 legacy 路径迁走。

### 主要交付物

1. `public/scripts/chat-message-actions-controller.js` 暴露稳定的 `MESSAGE_ACTION_TIERS` 与 DOM-derived snapshot helper，并在 legacy open/close 后通知 bridge 重新取样
2. `public/script.js` 为安全的 visible rows 输出只读 `messageActionSnapshots` payload，并在 menu state 改变时刷新 hidden island
3. `app/workspace-panels.tsx` 用 Zod 校验 `messageActionSnapshots`，只在合法 row 的既有 `.mes_buttons` 内附加 hidden per-row action owner marker
4. `.extraMesButtonsHint`、`.extraMesButtons`、copy/edit/delete/retry/swipe/reasoning controls 继续保持 legacy DOM owner，不新增 visible React 操作按钮
5. 现有 expand/collapse、copy、edit、delete confirmation 与 mobile reachability proof 继续通过

### 成功标准

- ✅ hidden action snapshot / owner-marker boundary 落地
- ✅ menu expand/collapse、copy、edit、delete confirmation 继续正常
- ✅ visible buttons 顺序、selector 和 legacy handler owner 保持不变
- ✅ schema 失败、row 不安全或 marker 不可附加时 fail-closed
- ✅ review 期间补齐 expanded-state sync proof，避免 hidden marker 状态滞后

---

## 技术设计

### 消息操作快照

`messageActionSnapshots` 是 legacy -> React hidden island 的只读 payload。React 只校验和消费这份状态，不接管 visible action buttons、message edit mode 或 action handler。

关键字段：

- `messageId`: 当前 `.mes[mesid]` row identity
- `eligible`: 该行是否仍可安全暴露 hidden action marker
- `expanded`: 当前 extra actions menu 是否处于展开态
- `availableActions`: 当前 DOM 中真实存在的 action names
- `highFrequencyActions`: 高频 action tier
- `secondaryActions`: 次级 action tier
- `dangerActions`: 危险 action tier

---

## 验证清单

- [x] hidden action snapshot / owner-marker boundary 已落地
- [x] menu expand/collapse、copy、edit、delete confirmation 正常
- [x] mobile reachability 与正文不遮挡 proof 通过
- [x] `chat-message-actions-controller.test.js`、`react-workspace-panels-helpers.test.js`、`chat-workspace-structure.test.js` 通过
- [x] `chat-message-rendering.e2e.js`、`chat-message-layout.e2e.js` proof 通过

---

## 下一步

👉 [Phase 3 Sprint 9: 整合测试](phase3-sprint9-integration.md)
