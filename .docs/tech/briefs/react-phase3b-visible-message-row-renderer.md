---
created: 2026-06-22
source: user
confirmed: true
last_updated: 2026-06-22
---

# React Phase 3B Visible MessageRow Renderer Intent

## User Original Request

用户先确认 Phase 3 的 remaining visible-owner gaps 最适合继续放在 Phase 3 方向下推进，随后要求“更新 roadmap，新增一个 Phase 3B，把这 5 个缺口拆成明确 sprint”。路线图已新增 `Phase 3B: 主聊天可见 Owner 迁移`，并把第一个 sprint 定义为 `Visible MessageRow Renderer`。

本轮用户通过 `$brainstorming` 要求“编写spec开发文档”。按当前路线图和 brainstorming 规则，本 brief 只为 Phase 3B 的第一个可交付切片提供上游意图：visible MessageRow renderer；其余 Phase 3B sprint 继续作为后续独立 spec。

## Background & Motivation

Phase 3 已按当前批准的 guarded hidden main-chat island scope 完成：React 已能观察和校验消息列表顺序、rich-body snapshot、scroll restore、streaming/generation/composer/slash/message-action hidden bridge，但 `.mes` 可见行、`.mes_text` body、formatter/media/file live DOM、message actions、visible composer、slash UI 和 provider transport 仍由 legacy owner 驱动。

用户希望路线图不要把这些 visible-owner gaps 悬空到 Phase 4/5/6，也不要回写 Phase 3 的完成定义。Phase 3B 的第一步应把最核心的读消息体验推进到 React-owned visible MessageRow renderer，同时保留当前 `.mes` DOM / selector / action / extension 兼容面，并让不安全行继续 fallback。

## Intent Domains

### Domain: Phase 3B Sprint 1 visible MessageRow renderer

- **User expectation:** 在 Phase 3 hidden-island 基线上，正式启动 visible owner cutover，第一步让安全的 stored / finalized / non-editing message rows 由 React 渲染可见 MessageRow。
- **Current status:** delivered and validated
- **Change history:**
  - 2026-06-22: 用户确认 remaining visible-owner gaps 放入 Phase 3 后续子阶段更合适。
  - 2026-06-22: `.docs/tech/react-modernization-roadmap.md` 新增 Phase 3B，并把 visible MessageRow renderer 列为 Sprint 1。
  - 2026-06-22: 本 brief 将 Sprint 1 收敛为一个可交付 spec，不把 message actions、composer、slash UI、provider transport 一起纳入。
- **Implementation traceability:** archived scope lives in `.docs/tech/react-modernization-roadmap.md` Phase 3B Sprint 1 and `.docs/PROJECT_HISTORY.md` entry `2026-06-22 / Main-chat visible MessageRow owner boundary`; code paths `public/script.js` (`messageRowSnapshots`, safe-row eligibility, bridge state), `app/workspace-panels.tsx` (visible row schema, row owner portal, fail-closed row slots); docs `.docs/db/pages/chat-workspace.md`, `.docs/db/features/chat-message-rendering.md`, `.docs/db/features/chat-message-actions.md`, `.docs/tech/react-modernization-roadmap.md`, `.docs/PROJECT_HISTORY.md`; validation `bun run build:react:workspace-panels`, `bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js --runInBand`, `bun run --cwd tests test:unit -- chat-workspace-structure.test.js --runInBand`, `bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js`, `bun run --cwd tests test:e2e -- chat-message-layout.e2e.js`, `bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js`, `bun run test:compat`, `bun run docs:check`, `bun run docs:build`; delivery status `implemented and wrap-up-ready on 2026-06-22`

## Non-Goals

- 不在本 spec 中实现 visible message actions owner；copy / edit / delete / retry / swipe / reasoning handlers 仍由 legacy owner 保持。
- 不迁移 visible composer、slash autocomplete/parser UI、provider transport、token append 或 TanStack Query mutation。
- 不重写 `messageFormatting()`、regex placement、markdown sanitizer、media/file append 或 extension mount points。
- 不改变聊天 JSONL、角色文件、World Info、Backgrounds、Extensions 或 canonical storage。
- 不把 Phase 3 的 hidden-island 完成定义改写为未完成。

## Source Evidence

- `.docs/tech/react-modernization-roadmap.md`
- `.docs/specs/react-phase3-main-chat/README.md`
- `.docs/PROJECT_HISTORY.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `.docs/tech/main-chat-successor-scope.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
- `Product.md`
- `DESIGN.md`
- `app/workspace-panels.tsx`
- `public/script.js`
- `tests/chat-message-rendering.e2e.js`
- `tests/chat-message-layout.e2e.js`
