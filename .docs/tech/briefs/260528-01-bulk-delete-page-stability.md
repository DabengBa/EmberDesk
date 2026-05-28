# Brief: 260528-01 Bulk Delete Page Stability

## User Original Request

- "调查: 在角色列表中通过批量删除功能删掉第二页的一个角色卡后,角色列表会发生怎样的变化?"
- "这个行为和我们 2026-05-28 前两次的开发目的是不是不同?"
- "$brainstorming 如何修复这一点, 实现用户体验"
- "只做'单选删除'吗? 如果多选呢?"

## Background & Motivation

用户发现：在角色列表第 2 页进入批量选择，只选中 1 张角色卡并通过批量删除确认后，当前实现会走 bulk edit full-refresh fallback，最终跳回第 1 页。这个结果和 2026-05-28 前两次角色列表增量 reconcile 的用户体验方向不一致：删除角色时应尽量保留当前浏览上下文，让当前页按删除后的列表补位或回到删除后最后一个有效页，而不是让用户失去原本所在的分页位置。用户进一步指出，多选批量删除也应被纳入同一用户体验目标，而不应只修复单选。

## Intent Domains

- 用户可见行为：批量入口中删除 1 个或多个角色成功后，优先保留当前页；当前页不再存在时，回到删除后最后一个有效页。
- 删除流程：继续复用现有统一确认弹窗、World Info cascade、聊天删除选项和生成中阻断规则。
- 列表状态：保留 `data-chid`、legacy `chid`、`id="CharID${chid}"`、`.character_select`、`.bulk_select_checkbox` 等兼容边界。
- 性能和稳定性：复用既有单删增量 reconcile 与普通页面 reconcile 机制；多删可先实现 page-preserving refresh，再在安全条件下增量复用可见行。
- 文档与验证：更新 `feature.character_delete`、`feature.character_library_panel` 和角色列表状态处理说明中的 bulk 删除分页稳定边界。

## Non-Goals

- 不改变搜索、标签过滤、bogus-folder drilldown、in-flight print 等复杂状态的 correctness fallback。
- 不重写批量选择 UI、统一删除弹窗或 World Info cascade。
- 不改变服务器删除 API、角色卡文件格式、群组刷新或聊天清理语义。
- 不重新设计 partial failure 的 toast 文案或逐项失败报告；本切片只保证成功删除后列表位置不无故回第 1 页。
- 不引入新的前端框架、全局 store 或分页库替换。

## Recommended Scope

第一个可交付切片处理：当前角色库处于第 N 页、无 active filter、非 bogus-folder、非 in-flight print，批量选择模型中有 1 个或多个有效角色 avatar，用户通过 bulk delete 成功删除其中至少 1 个角色。成功后列表应退出 bulk 模式，并显示删除后的目标页：优先第 N 页；如果删除后第 N 页不存在，则显示删除后的最后一页。复杂状态仍可 full refresh，但不能默认把安全 bulk 删除带回第 1 页。

## Implementation Traceability

| Intent Domain | Code / doc path | Delivery status | Traceability |
|---|---|---|---|
| 批量删除保留分页上下文 | `public/scripts/BulkEditOverlay.js`; `public/script.js`; `public/scripts/character-list-render-state.js` | delivered | Bulk delete passes explicit context into the delete flow; `reconcileCharacterListAfterDelete()` uses a page-preserving bulk delete plan for one or more successful deleted avatars. Commit: `fb505d142 fix(character-list): preserve page after bulk delete`. |
| 单选和多选目标页计算 | `public/scripts/character-list-render-state.js`; `tests/character-list-render-state.test.js` | delivered | Pure helper covers page 2 refill, multi-delete, last-page clamp, no-delete fallback, filter/bogus fallback, and duplicate render-key fallback. Commit: `fb505d142 fix(character-list): preserve page after bulk delete`. |
| 批量选择清理与兼容边界 | `public/scripts/BulkEditOverlay.js`; `tests/character-list-state.test.js`; `tests/character-list-structure.test.js`; `tests/third-party-extension-compatibility.test.js` | delivered | Existing `browseState()` cleanup remains in `finally`; row identity and `.bulk_select_checkbox` compatibility stay covered. Commit: `fb505d142 fix(character-list): preserve page after bulk delete`. |
| 语义与逻辑文档 | `.docs/db/features/character-delete.md`; `.docs/db/features/character-library-panel.md`; `.docs/logic-description/character_list_state_processing_flow.md`; `.docs/logic-description/character_list_state_sandbox_proof.py` | delivered | Product docs and reproducible logic proof now describe bulk-delete page stability and fallback boundaries. Commit: `fb505d142 fix(character-list): preserve page after bulk delete`. |

## Validation Snapshot

- `bun run --cwd tests test:unit -- character-list-render-state.test.js character-list-state.test.js character-list-structure.test.js --runInBand`
- `bun run test:compat`
- `uv run python .docs\logic-description\character_list_state_sandbox_proof.py`
- `bun run docs:check`
- `bun run docs:build`
