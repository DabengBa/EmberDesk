---
created: 2026-06-20
source: user
confirmed: true
last_updated: 2026-06-20
---

# React Phase 3 Sprint 1 Main Chat Message List Basic Intent

## User Original Request

用户先要求把 React Phase 3 main-chat 路线图素材收敛成可执行规格，随后又明确给出连续目标：“写一个 specs 然后 delivery，然后下一个，直到完成 phase3”。

这说明本轮不是继续讨论路线图，也不是只验证现状，而是要把 Phase 3 拆成可连续交付的 Sprint 级规格，并从第一个可交付切片开始推进。

## Background & Motivation

当前仓库已经完成 React page islands 与一批 guarded workspace panel islands，但主聊天工作区仍由 `public/script.js`、`public/index.html`、`eventSource` / `event_types`、消息模板 DOM、`messageFormatting()`、`getMessageTextHTML()`、`updateMessageElement()`、`StreamingProcessor` 和大量扩展监听共同拥有。Phase 3 路线图材料只提供高层描述，尚不足以直接交给 `delivery-workflow`。

用户的真实目标不是写一个覆盖全部 9 个 Sprint 的大而空总 spec，而是建立一条能持续 delivery 的 Phase 3 交付链。因此第一个规格必须收敛成最小、可验证、可回退、可继续向后衔接的主聊天 React island 切片。

## Intent Domains

### Domain: 主聊天消息列表的首个 React island 切片

- **User expectation:** Phase 3 从“基础消息列表”开始，先把主聊天工作区里最小的一块 React 化，而不是一口气把 streaming、输入框、slash commands、message actions 一起迁移。
- **Current status:** delivered
- **Change history:**
  - 2026-06-20: 用户要求将 React Phase 3 main-chat 路线图材料通过 `brainstorming` 收敛为可执行规格
  - 2026-06-20: 用户进一步明确连续目标为“写一个 specs 然后 delivery，然后下一个，直到完成 phase3”
  - 2026-06-20: 交付落地为 guarded React main-chat controller；flag 开启时在 `#chat` 内挂载隐藏 host，并保留 direct-child `.mes[mesid]` 与 `#show_more_messages` 语义
- **Implementation traceability:** code paths `default/config.yaml`, `src/workspace-react-features.js`, `public/scripts/workspace-panels-react-bridge.js`, `public/script.js`, `app/workspace-panels.tsx`, `scripts/seed-dev-environment.mjs`; tests `tests/react-workspace-panels-helpers.test.js`, `tests/workspace-react-panel-flags.test.js`, `tests/chat-workspace-structure.test.js`, `tests/chat-message-rendering.e2e.js`, `tests/third-party-extension-compatibility.test.js`; owning docs `.docs/db/pages/chat-workspace.md`, `.docs/db/features/chat-message-rendering.md`, `.docs/tech/react-modernization-roadmap.md`; commit `this wrap-up commit`; delivery status `delivered guarded React controller island with legacy rendering owners retained`

### Domain: 继续遵守 guarded island + legacy fallback 迁移模式

- **User expectation:** Phase 3 不能抛弃当前仓库已接受的 React page/panel island 模式，主聊天的第一步也必须保留 legacy fallback，而不是直接改成全站 SPA 或一次性替换主工作区。
- **Current status:** delivered
- **Change history:**
  - 2026-06-15: [ADR-0007](../../adr/0007-react-page-islands-with-legacy-fallbacks.md) 接受早期 React 迁移采用 guarded islands + legacy fallback
  - 2026-06-20: 该约束被明确沿用到 Phase 3 Sprint 1 规格设计
  - 2026-06-20: Sprint 1 实现按该边界交付，flag 关闭和 bundle 缺失时会 fail-closed 回 legacy message rendering
- **Implementation traceability:** owning ADR `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`; build/serve path `vite.config.ts`, `src/server-main.js`, `src/workspace-react-features.js`, `public/scripts/workspace-panels-react-bridge.js`, `app/workspace-panels.tsx`; commit `this wrap-up commit`; delivery status `delivered`

### Domain: 消息行 DOM、事件和扩展兼容面不能在 Sprint 1 中被破坏

- **User expectation:** 第一个 Sprint 可以改消息列表的渲染承载方式，但不能顺带改变 `.mes`、`.mes_text`、`.mes[mesid]`、reasoning/media/file wrappers、`CHAT_CHANGED` / `MESSAGE_RECEIVED` / `CHARACTER_MESSAGE_RENDERED` / `USER_MESSAGE_RENDERED` / `STREAM_TOKEN_RECEIVED` 这些兼容表面。
- **Current status:** delivered
- **Change history:**
  - 2026-06-08: 主聊天 successor proof 已将受保护表面写入 durable docs
  - 2026-06-20: 该兼容边界被提升为 Sprint 1 规格的硬约束
  - 2026-06-20: guarded React host 改为隐藏 controller，不渲染可见 panel shell；Playwright 在 React flag 开启下继续通过 stored-chat / long-chat proof
- **Implementation traceability:** owning docs `.docs/tech/main-chat-successor-scope.md`, `.docs/tech/main-chat-rendering-call-chain.md`, `.docs/tech/third-party-extension-compatibility.md`; tests `tests/chat-workspace-structure.test.js`, `tests/chat-message-rendering.e2e.js`, `tests/third-party-extension-compatibility.test.js`; code `public/script.js`, `app/workspace-panels.tsx`, `public/scripts/chat-message-render-descriptor.js`; commit `this wrap-up commit`; delivery status `delivered`

### Domain: 严格推动 TanStack Query / Form / Zod / Virtual 的 Phase 3 采用

- **User expectation:** React 现代化路线要严格推动 TanStack 栈采用。对于主聊天第一步，不能在 spec 里随便写“React 重写”却没有落到现有已采用栈；同时也不能为了套用依赖而把 legacy-owned 高风险逻辑一起硬搬进 React。
- **Current status:** partially delivered
- **Change history:**
  - 2026-06-16 起: 用户已明确要求路线图严格推动 TanStack Form / TanStack Query / Zod 的采用
  - 2026-06-20: 该约束沿用到 Phase 3 Sprint 1；同时以最小切片原则约束 TanStack Virtual 只用于消息列表窗口化，不借机扩展到 streaming 或输入
  - 2026-06-20: Sprint 1 复用共享 `app/workspace-panels.tsx` 的 TanStack Query shell，但没有在本 Sprint 引入新的 TanStack Form/Zod message controls 或 TanStack Virtual renderer；该缺口已在路线图和 Sprint 文档中改写为后续 Sprint 范围，而不再假装“已采用”
- **Implementation traceability:** roadmap `.docs/tech/react-modernization-roadmap.md`; accepted dependency surface `package.json`; shared island patterns `app/workspace-panels.tsx`, `app/character-library-panel.tsx`; commit `this wrap-up commit`; delivery status `Query shell reused; Form/Zod/Virtual for main-chat rows deferred to later Phase 3 sprints`

## Non-Goals

- 本轮不一次性设计完整 Phase 3 九个 Sprint 的执行细节
- 本轮不迁移 `StreamingProcessor`、`Generate()`、自动恢复、slash-command parser、发送输入框、message actions controller
- 本轮不更改 `/api/chats/get` payload 形状，不把聊天 canonical storage 从文件迁走
- 本轮不把 `messageFormatting()`、`getMessageTextHTML()`、regex/sanitizer 行为改写为新的 React formatter
- 本轮不移除 legacy 主聊天渲染或现有 `#chat` 工作流

## Source Evidence

- `.docs/PROJECT_HISTORY.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/main-chat-successor-scope.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `.docs/tech/main-chat-baseline-validation.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `public/index.html`
- `public/script.js`
- `public/scripts/chat-message-render-descriptor.js`
- `src/server-main.js`
- `src/workspace-react-features.js`
- `public/scripts/workspace-panels-react-bridge.js`
- `vite.config.ts`
- `tests/chat-workspace-structure.test.js`
- `tests/chat-message-rendering.e2e.js`
