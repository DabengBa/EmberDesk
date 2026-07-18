---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-16
feature_slug: react-main-chat-renderer-retirement
status: active
active_process_dir: .docs/specs/260716-12-react-main-chat-renderer-retirement
---

# React Main Chat Renderer Retirement Intent

## 原始请求

用户要求 Main Chat legacy renderer 最后清理，保留所有消息、编辑、streaming、long-chat、actions 与扩展 mutation 行为。

## 目标结果

React 独立拥有 stored/finalized/streaming/editing/system/unsafe/extension-mutated rows、rich body、actions、swipes 与 long-chat windowing；legacy `printMessages()`、`updateMessageElement()`、formatter DOM path、`showMoreMessages()` 和 row fallback 删除。

## Checkpoint A

- **目标结果**：所有消息 row family 只有一个 React lifecycle/render owner。
- **当前状态**：React 只拥有 safe finalized rows 的部分 rich-body/action shell；legacy formatter、streaming/edit/unsafe rows 与 load-more 仍存在。
- **假设**：framework-neutral formatting/sanitization services 可保留，第三方扩展通过稳定 row DOM/mutation zones 继续工作。
- **硬约束**：保留 `.mes` identity、markdown/regex/sanitizer/reasoning/media/files/swipes/actions、scroll anchor、events 和 JS-Slash-Runner mutations。
- **风险边界**：React reconciliation 可能覆盖 extension DOM，virtualization 可能破坏 selectors/reading position，editing/streaming 可能重复 row。
- **未决问题**：无。
- **推荐默认**：建立 provider-neutral render descriptor/service；React rows 提供稳定 imperative mutation zones；windowing 由 React 单一拥有。

## 范围边界

- 包含 renderer、row lifecycle、actions/edit、extension zones、long-chat windowing/restore 和 legacy 删除。
- 不改变 generation transport、chat storage、markdown/regex semantics 或 workspace shell chrome。

## 变更历史

- 2026-07-16：创建 Main Chat final renderer-owner 包，依赖 transport retirement。

## 参考资料

- `public/script.js`
- `public/scripts/chat-message-render-descriptor.js`
- `public/scripts/chat-message-actions-controller.js`
- `app/workspace-panels.tsx`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-layout.e2e.js`
- `.docs/tech/main-chat-rendering-call-chain.md`
