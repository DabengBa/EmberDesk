# Brief: 260528-02 Unified Delete Confirmation

## User Original Request

- "$brainstorming"
- "将'“临时聊天将丢失”的二次确认'整合到已有的删除确认面板中.不再做'二次'的确认,支持与'世界书'等内容的'全部删除'."

## Background & Motivation

用户在验证 2026-05-28 的批量删除分页稳定性改动时发现：批量删除第二页角色时，如果当前处于临时聊天并触发“临时聊天将丢失”的独立二次确认，接受该二次确认后角色列表仍会跳回第 1 页。这个行为和 2026-05-28 前两次角色列表删除体验目标不同：删除确认应集中在一个面板中完成，成功后保留用户所在的列表上下文；临时聊天丢失提示应是同一个删除确认面板内的信息，而不是另一个会打断并改变删除链路的确认弹窗。

## Intent Domains

- 删除确认体验：单个删除和批量删除都只显示一个删除确认面板；临时聊天未保存消息丢失提示内嵌在该面板中。
- 级联删除：已有 World Info cascade 区域继续显示在同一面板内，`Delete All` 支持一次选中聊天文件和所有世界书删除项。
- 删除执行：确认按钮或 `Delete All` 之后直接进入删除执行，不再对临时聊天弹出第二个确认。
- 列表状态：批量删除仍保留上一轮完成的分页稳定性；不因临时聊天关闭或二次确认分支回到第 1 页。
- 兼容安全：直接调用 `deleteCharacter()`、没有先展示集成确认面板的路径仍应保留安全兜底，避免扩展或旧入口静默关闭临时聊天。

## Non-Goals

- 不重新设计角色删除 API、角色文件删除语义、聊天文件删除语义或 World Info 文件格式。
- 不恢复跨角色清理世界书引用；该边界继续遵循 ADR-0005。
- 不重写角色列表分页、增量 reconcile 或 bulk edit 选择模型。
- 不改变复杂列表状态的 full-refresh fallback 规则。
- 不引入新的前端框架、全局状态管理或独立确认系统。

## Recommended Scope

第一个可交付切片处理：用户从单个角色删除入口或批量删除入口触发删除时，确认面板同时包含聊天文件选项、临时聊天未保存消息提示、World Info cascade 和 `Delete All`。用户点击 `Delete` 或 `Delete All` 后，不再出现“临时聊天将丢失”的第二个确认。批量删除必须继续传递 `deleteContext.source === 'bulk'`，从而保持当前分页上下文。没有集成确认的直接调用路径通过显式 `temporaryChatAcknowledged` 之类的选项区分，继续保留安全兜底。

## Implementation Traceability

| Intent domain | Delivered code path | Evidence | Status |
|---|---|---|---|
| 删除确认体验 | `public/script.js` adds `temporaryChatAcknowledged` handling in `deleteCharacter()` and appends the temporary-chat warning to the selected-character delete confirmation; `public/scripts/BulkEditOverlay.js` passes the same acknowledgement from bulk delete. | `bun run --cwd tests test:unit -- character-list-structure.test.js --runInBand` passed with `12 passed`. | Delivered in the wrap-up commit. |
| 级联删除 | `public/scripts/world-cascade-dialog.js` makes integrated single-delete `Delete All` select `#del_char_checkbox` and every `.world-cascade-checkbox`; standalone world-info fallback remains world-only. | Focused structural proof verifies chat-file plus world-info checkbox selection. | Delivered in the wrap-up commit. |
| 删除执行 | `public/script.js` keeps the direct-call fallback confirmation when callers omit `temporaryChatAcknowledged`, while ordinary single-delete no-cascade and cascade paths pass explicit delete options. | Final review fixed the no-cascade branch to pass `deleteWorlds: []` and `clearWorldReferences: false`; focused proof passed after the fix. | Delivered in the wrap-up commit. |
| 列表状态 | `public/scripts/BulkEditOverlay.js` preserves `deleteContext: { source: 'bulk', selectedCount: count }`; no pagination reconcile logic changed for this feature. | `bun run test:compat` passed with `6 passed`; browser walkthrough confirmed bulk `Delete All` returned to the list without a second confirmation. | Delivered in the wrap-up commit. |
| 文档契约 | `.docs/db/features/character-delete.md` and `.docs/PROJECT_HISTORY.md` record the unified temporary-chat warning and `Delete All` behavior. | `bun run docs:check` validated 22 semantic docs; `bun run docs:build` built the 22-document bundle. | Delivered in the wrap-up commit. |
