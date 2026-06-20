# Phase 3 Sprint 5: 流式生成 - 控制状态

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 5（全局 Sprint 18/40）
- **预计工期**：2 周
- **风险等级**：高

---

## 目标

在不改写 provider transport、token append、`Generate()` 或 `StreamingProcessor` owner 的前提下，交付主聊天 visible generation 的控制状态桥接：停止、自动恢复状态、最终失败重试、完成/停止后的继续前进路径。

本 Sprint 已按实际代码边界收敛为 `features.react.panels.mainChatMessageList` guarded hidden island 的 generation-control bridge/state 交付。它不是 SSE/EventSource transport rewrite，也不新增 provider pause/resume。脚本执行的 pause/continue/abort 仍属于 `#form_sheld .stscript_*` 与 `SlashCommandAbortController`，后续输入框 / slash 迁移另行处理。

### 主要交付物

1. `public/scripts/chat-streaming-control-state.js` 扩展为纯 generation-control state classifier，覆盖 `idle`、`streaming`、`recoveringPrimary`、`recoveringFallback`、`stopped`、`completed`、`error`
2. `public/script.js` 为 main-chat React bridge 输出只读 `generationControl` payload，并在 stop / recovery / failure / completion 状态变化时刷新 hidden island
3. `app/workspace-panels.tsx` 用 Zod 校验 `generationControl` payload，schema 不安全时 fail-closed 到 idle/fallback 状态
4. `#mes_stop`、`#mes_continue`、`.generation_auto_recovery_status`、`.generation_failure_notice`、`.generation_failure_retry` 继续保持 legacy DOM owner，不新增可见 React 控件
5. 现有 streaming / fallback / retry / continue baseline E2E proof 继续通过

### 成功标准

- ✅ 停止生成即时生效
- ✅ 不新增 provider pause/resume；slash-command pause/resume 与 main-chat generation control 分离
- ✅ 错误状态显示正确
- ✅ 错误后可重试
- ✅ 生成完成、停止、自动恢复和最终失败都保持单一 assistant row / existing recovery path

---

## 技术设计

### 生成控制状态

`generationControl` 是 legacy -> React hidden island 的只读 payload。React 只校验和消费这份状态，不接管 provider 请求、token append、retry routing 或 visible DOM owner。

关键字段：

- `phase`: `idle` / `streaming` / `recoveringPrimary` / `recoveringFallback` / `stopped` / `completed` / `error`
- `stopVisible`: 现有 `#mes_stop` 是否应可见
- `continueSurface`: `hidden` / `legacy`
- `activeMessageId`: 当前 generation / recovery 所属 message row
- `recoveryStatusLabel`: 自动恢复状态文案
- `failureRetryVisible`: `.generation_failure_retry` 是否可见
- `failureNoticeVisible`: `.generation_failure_notice` 是否存在

---

## 验证清单

- [x] 停止生成即时生效
- [x] provider pause/resume 未引入，slash-command controls 未混入
- [x] 错误状态显示正确
- [x] 重试功能正常
- [x] 完成 / 停止 / retry 后消息 row identity 正确

---

## 下一步

👉 [Phase 3 Sprint 6: 输入框 - 基础功能](phase3-sprint6-input-basic.md)
