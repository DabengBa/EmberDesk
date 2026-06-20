---
created: 2026-06-20
source: user
confirmed: true
last_updated: 2026-06-20
---

# React Phase 3 Sprint 2 Main Chat Rich Message Bodies Intent

## User Original Request

用户通过 `.docs\specs\react-phase3-main-chat $brainstorming` 要求把 Phase 3 主聊天工作区继续收敛为可审批、可 delivery 的下一份实现规格。此前用户已经明确了连续目标：“写一个 specs 然后 delivery，然后下一个，直到完成 phase3”。

这说明本轮不是继续补路线图占位稿，也不是只做现状说明，而是要把下一个未完成 Sprint 写成可以直接交给 `delivery-workflow` 的规格。

## Background & Motivation

`Phase 3 Sprint 1` 已经落地为 guarded React hidden controller：它在 `#chat` 内维持 direct-child `.mes[mesid]` 与 `#show_more_messages` 的顺序，但没有接管可见消息内容 owner。

当前 `.docs/specs/react-phase3-main-chat/phase3-sprint2-message-list-rich.md` 仍是路线图级 stub。它把 Sprint 2 写成“为消息列表添加 Markdown 渲染、代码高亮、LaTeX 和媒体嵌入支持”，但这些能力在当前仓库里已经由 legacy `messageFormatting()`、`getMessageTextHTML()`、reasoning/media/file wrappers 和相关工具链拥有。

因此，真正需要设计的不是“新增这些用户能力”，而是：在 guarded React 路径下，下一步到底把哪一层 rich message body owner 从 legacy 迁到 React，同时不破坏 outer `.mes` shell、streaming、message actions、load-more 和扩展兼容面。

## Intent Domains

### Domain: Sprint 2 必须是可交付规格，而不是路线图占位稿

- **User expectation:** 下一个未完成 Sprint 需要一个可直接进入 `delivery-workflow` 的实施规格。
- **Current status:** delivered
- **Change history:**
  - 2026-06-20: 用户要求对 `.docs/specs/react-phase3-main-chat` 执行 `brainstorming`
  - 2026-06-20: 用户此前已确认 Phase 3 采用“spec -> delivery -> 下一个”的连续推进方式
  - 2026-06-20: dated spec `260620-02-react-phase3-sprint2-main-chat-rich-message-bodies` 已完成 delivery、review 和文档同步
- **Implementation traceability:** process artifacts `.docs/specs/260620-02-react-phase3-sprint2-main-chat-rich-message-bodies/spec.md`, `.docs/specs/260620-02-react-phase3-sprint2-main-chat-rich-message-bodies/plan.md`; durable docs `.docs/specs/react-phase3-main-chat/phase3-sprint2-message-list-rich.md`, `.docs/specs/react-phase3-main-chat/README.md`, `.docs/tech/react-modernization-roadmap.md`; commit `this wrap-up commit`; delivery status `delivered`

### Domain: Sprint 2 的真实任务是迁移 rich message body owner，而不是发明已存在的 Markdown/媒体能力

- **User expectation:** Phase 3 Sprint 2 应该描述真实的主聊天迁移边界，而不是把 legacy 已有能力误写成“新功能”。
- **Current status:** delivered
- **Change history:**
  - 2026-06-20: 在仓库核对后确认，Markdown、代码高亮、LaTeX、reasoning、媒体和文件嵌入已经存在于 legacy 渲染链
  - 2026-06-20: 因此 Sprint 2 规格应改写为 rich message body owner 迁移，而不是能力新增
  - 2026-06-20: 实际交付收口为 rich-body snapshot + hidden owner-marker boundary，继续复用 legacy `messageFormatting()` / `appendMediaToMessage()` / live DOM output
- **Implementation traceability:** code `public/script.js`, `app/workspace-panels.tsx`; tests `tests/chat-message-rendering.e2e.js`, `tests/chat-message-streaming.e2e.js`, `tests/react-workspace-panels-helpers.test.js`; owning docs `.docs/db/pages/chat-workspace.md`, `.docs/db/features/chat-message-rendering.md`, `.docs/specs/react-phase3-main-chat/phase3-sprint2-message-list-rich.md`; commit `this wrap-up commit`; delivery status `delivered hidden owner-marker boundary without a second React renderer`

### Domain: 继续保护 direct-child `.mes` outer shell，并把高风险行为留在 legacy

- **User expectation:** Sprint 2 不能借“rich rendering”之名，顺带改掉 `#chat > .mes[mesid]`、swipe/buttons、streaming、load-more、message actions 或事件公共表面。
- **Current status:** delivered
- **Change history:**
  - 2026-06-08: main-chat successor docs 已把 `.mes` DOM、`eventSource`、`event_types`、message action affordance 归为受保护表面
  - 2026-06-20: Sprint 2 设计继续沿用该保护边界
  - 2026-06-20: stored chat、long-chat load-more、finalized streaming proof 均继续通过，说明 outer row shell 和高风险 owner 仍留在 legacy
- **Implementation traceability:** protected owners `public/script.js`, `public/scripts/chat-message-render-descriptor.js`; tests `tests/chat-workspace-structure.test.js`, `tests/chat-message-rendering.e2e.js`, `tests/chat-message-layout.e2e.js`, `tests/chat-message-streaming.e2e.js`, `tests/third-party-extension-compatibility.test.js`; owning docs `.docs/tech/main-chat-successor-scope.md`, `.docs/tech/third-party-extension-compatibility.md`, `.docs/db/features/chat-message-rendering.md`, `.docs/db/features/chat-message-actions.md`; commit `this wrap-up commit`; delivery status `delivered with outer shell, streaming, load-more, and action owners retained in legacy`

### Domain: TanStack 采用要跟随真实 owner 表面，而不是为了“全用上”而扩 scope

- **User expectation:** Phase 3 要继续严格推动 TanStack 栈采用，但采用方式必须与当前 React owner 表面匹配。
- **Current status:** partially delivered
- **Change history:**
  - 2026-06-16 起: 用户已明确要求路线图严格推动 TanStack Form / Query / Zod 的采用
  - 2026-06-20: 结合主聊天边界判断，Sprint 2 适合使用 TanStack Query 承接 bridge-state、Zod 校验 rich-body payload；由于本 Sprint 不拥有用户编辑表单，也不重写外层滚动列表，因此 TanStack Form 和 TanStack Virtual 不应被勉强塞入本切片
  - 2026-06-20: 实际交付复用共享 `app/workspace-panels.tsx` 的 TanStack Query shell，并在 rich-body snapshot 边界落实 Zod 校验；TanStack Form / Virtual 继续保留给后续真正拥有该表面的 Sprint
- **Implementation traceability:** shared shell `app/workspace-panels.tsx`; roadmap `.docs/tech/react-modernization-roadmap.md`; dependency surface `package.json`; commit `this wrap-up commit`; delivery status `Query shell reused and Zod contract delivered; Form/Virtual deferred by design`

## Non-Goals

- 不把 legacy 已有 Markdown/媒体/LaTeX/代码高亮能力重新包装成“新增功能”
- 不在本 Sprint 接管 outer `.mes` row shell、avatar/header/buttons/swipe affordance
- 不在本 Sprint 接管 `StreamingProcessor`、`Generate()`、message actions controller、composer、slash-command parser、load-more 或 scroll recovery
- 不在本 Sprint 移除 legacy fallback，也不引入新的主聊天 route 或 SPA shell

## Source Evidence

- `.docs/specs/react-phase3-main-chat/README.md`
- `.docs/specs/react-phase3-main-chat/phase3-sprint1-message-list-basic.md`
- `.docs/specs/react-phase3-main-chat/phase3-sprint2-message-list-rich.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/main-chat-successor-scope.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `.docs/tech/main-chat-ux-trend-recommendations.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
- `public/index.html`
- `public/script.js`
- `public/scripts/chat-message-render-descriptor.js`
- `app/workspace-panels.tsx`
- `package.json`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-layout.e2e.js`
- `tests/chat-message-streaming.e2e.js`
- `https://tanstack.com/virtual/latest/docs/introduction`
- `https://tanstack.com/virtual/latest/docs/framework/react/react-virtual`
- `https://react.dev/reference/react-dom/components/common`
