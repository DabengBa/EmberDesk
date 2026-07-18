---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-18
feature_slug: react-main-chat-renderer-retirement
status: delivered
---

# React Main Chat Renderer Retirement Intent

## 原始请求

用户要求 Main Chat legacy renderer 最后清理，保留所有消息、编辑、streaming、long-chat、actions 与扩展 mutation 行为。

## 目标结果

React 独立拥有 stored/finalized/streaming/editing/system/unsafe/extension-mutated rows、rich body、actions、swipes 与 long-chat windowing；legacy dual-owner list/windowing flags 退役。`printMessages` / `showMoreMessages` / `updateMessageElement` 可保留为薄兼容适配器。

## Checkpoint A

- **目标结果**：所有消息 row family 只有一个 React lifecycle/render owner。
- **当前状态**：已交付。React sole-owns rows/windowing/restore/actions/mutation zones；framework-neutral render service 无 DOM side effect；产品 dual-path flag 退役。
- **假设**：framework-neutral formatting/sanitization services 可保留，第三方扩展通过稳定 row DOM/mutation zones 继续工作。
- **硬约束**：保留 `.mes` identity、markdown/regex/sanitizer/reasoning/media/files/swipes/actions、scroll anchor、events 和 JS-Slash-Runner mutations。
- **风险边界**：React reconciliation 可能覆盖 extension DOM，virtualization 可能破坏 selectors/reading position，editing/streaming 可能重复 row。
- **未决问题**：无。
- **推荐默认**：建立 provider-neutral render descriptor/service；React rows 提供稳定 imperative mutation zones；windowing 由 React 单一拥有。

## 范围边界

- 包含 renderer、row lifecycle、actions/edit、extension zones、long-chat windowing/restore 和 legacy dual-path 删除。
- 不改变 generation transport、chat storage、markdown/regex semantics 或 workspace shell chrome。

## 最终稳定追溯

- Owning product docs: `.docs/db/features/chat-message-rendering.md`, `.docs/db/features/chat-message-actions.md`, `.docs/db/features/chat-generation-auto-recovery.md`, `.docs/db/pages/chat-workspace.md`
- Cutover ledger: `.docs/tech/legacy-cutover-ledger.md`
- Project history: `.docs/PROJECT_HISTORY.md` (2026-07-18 React Main Chat renderer sole owner)
- Code: `public/scripts/chat-message-render-service.js`, `public/scripts/chat-message-render-descriptor.js`, `app/workspace-panels.tsx`, `public/script.js`, `src/workspace-react-features.js`

## 变更历史

- 2026-07-18：交付 sole-owner；移除 process-dir 指针，保留 owning-doc 追溯。
- 2026-07-16：创建 Main Chat final renderer-owner 包，依赖 transport retirement。

## 参考资料

- `public/script.js`
- `public/scripts/chat-message-render-descriptor.js`
- `public/scripts/chat-message-render-service.js`
- `public/scripts/chat-message-actions-controller.js`
- `app/workspace-panels.tsx`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-layout.e2e.js`
- `.docs/tech/main-chat-rendering-call-chain.md`
