---
created: 2026-06-23
source: user-request
confirmed: true
last_updated: 2026-06-23
---

# React Phase 4 State Management Sequenced Specs

## User Original Request

用户要求针对 React Phase 4 state management 方向使用 `$brainstorming`，分步骤编写 spec 开发设计文档。

## Background & Motivation

Phase 0-3B 已完成并从 active specs 中清理，Phase 4 曾作为下一批 React 现代化开发入口。用户希望 Phase 4 不再停留在目录级占位，而是拆成可审批、可执行、可交付的分步骤 `spec.md`，并保持 roadmap 中对 Zustand、global compatibility bridge、extension guide、Phase 4A transport expansion 和 Phase 4B renderer extraction 的边界。按 2026-06-23 当前代码状态，这批实现已完成，原 active specs 已从 `.docs/specs/` 退场，本 brief 现在作为 Phase 4 的 durable archive entry。

## Archive Entry Points

- Roadmap: [.docs/tech/react-modernization-roadmap.md](../react-modernization-roadmap.md)
- Project history: [.docs/PROJECT_HISTORY.md](../../PROJECT_HISTORY.md)
- Extension compatibility owner doc: [.docs/tech/third-party-extension-compatibility.md](../third-party-extension-compatibility.md)
- Main-chat transport current-behavior proof: [.docs/logic-description/main_chat_streaming_transport_bridge_processing_flow.md](../../logic-description/main_chat_streaming_transport_bridge_processing_flow.md)
- Main-chat renderer/windowing current-behavior proof: [.docs/tech/main-chat-rendering-call-chain.md](../main-chat-rendering-call-chain.md)
- Archival commit: `58a2d93f00e993878e7aca4e18f094c05ec02649` (`feat(react): hand state the compatibility ledger`)

## Intent Domains

### Domain 1: Zustand store foundation

- **User expectation:** Phase 4 的第一步应先建立可测试的 Zustand store foundation，而不是直接删除 legacy globals。
- **Current status:** `zustand` 已加入依赖；`app/stores/workspace-panel-store.js` 和 `app/stores/main-chat-observation-store.js` 已建立可测试 store foundation。React islands 继续按 slice 使用 TanStack Query/Form/Zod/Virtual，全局兼容面仍由 legacy owner 保持到后续 cutover。
- **Change history:** 2026-06-23 创建本 brief，作为 Phase 4 Sprint 1 spec 的上游意图；同日交付 store foundation。
- **Implementation traceability:** delivered via `app/stores/workspace-panel-store.js`, `app/stores/main-chat-observation-store.js`, `app/workspace-panels.tsx`, `tests/react-state-stores.test.js`; archival commit `58a2d93f00e993878e7aca4e18f094c05ec02649` (`feat(react): hand state the compatibility ledger`); delivery status `delivered`.

### Domain 2: Global compatibility bridge

- **User expectation:** Zustand 引入后必须继续保护 `globalThis.SillyTavern`、`eventSource`、`event_types`、jQuery globals 和 extension-facing compatibility exports。
- **Current status:** `app/compat/global-compatibility-bridge.js` 已提供 allowlisted snapshot/export bridge；compatibility surfaces 继续有效，敏感或非 main-chat panel state 不被广泛复制。
- **Change history:** 2026-06-23 创建本 brief，作为 Phase 4 Sprint 2 spec 的上游意图；同日交付全局兼容 bridge。
- **Implementation traceability:** delivered via `app/compat/global-compatibility-bridge.js`, `app/workspace-panels.tsx`, `tests/global-compatibility-bridge.test.js`; archival commit `58a2d93f00e993878e7aca4e18f094c05ec02649` (`feat(react): hand state the compatibility ledger`); delivery status `delivered`.

### Domain 3: Extension migration guide

- **User expectation:** Phase 4 需要输出扩展迁移指导，但不能把第三方扩展 API 删除或重命名当作本阶段实现内容。
- **Current status:** Tavern Helper / JS-Slash-Runner、Regex Manager、Quick Reply、Extensions Manager、`@sillytavern/*` aliases 和 protected mount points 仍是兼容边界；迁移指导已记录到 extension compatibility owning doc。
- **Change history:** 2026-06-23 创建本 brief，作为 Phase 4 Sprint 3 spec 的上游意图；同日更新扩展迁移指导。
- **Implementation traceability:** delivered via `.docs/tech/third-party-extension-compatibility.md` and `tests/third-party-extension-compatibility.test.js`; archival commit `58a2d93f00e993878e7aca4e18f094c05ec02649` (`feat(react): hand state the compatibility ledger`); delivery status `delivered`.

### Domain 4: Main-chat transport expansion evidence

- **User expectation:** Phase 4A 应分批证明 non-OpenAI / group / dry-run / nested / quiet/background generation 等 excluded transport paths，而不是回写 Phase 3B 完成定义。
- **Current status:** Phase 4A 已建立 support/fallback classifier：标准 OpenAI visible direct-chat request 进入 React-owned path；non-OpenAI、group、dry-run、nested visible、quiet/background generation 继续按 request-level fail-closed fallback 登记到 legacy。
- **Change history:** 2026-06-23 创建本 brief，作为 Phase 4A spec 的上游意图；同日交付 transport expansion evidence。
- **Implementation traceability:** delivered via `public/scripts/main-chat-visible-transport-owner.js`, `app/workspace-panels.tsx`, `.docs/logic-description/main_chat_streaming_transport_bridge_processing_flow.md`, `tests/main-chat-visible-transport-owner.test.js`, `tests/chat-message-streaming.e2e.js`; archival commit `58a2d93f00e993878e7aca4e18f094c05ec02649` (`feat(react): hand state the compatibility ledger`); delivery status `delivered`.

### Domain 5: Main-chat renderer/windowing extraction evidence

- **User expectation:** Phase 4B 应先抽取 renderer/windowing contract 和 proof，再把 full renderer owner cutover 留给 Phase 7。
- **Current status:** Phase 4B 已抽取 renderer/windowing current-behavior contract。safe finalized rows 是 Phase 7 renderer candidate；legacy `messageFormatting()`、`.mes_text` rich body、extension-mutated/editing/streaming rows、`chat_truncation` 和 `#show_more_messages` 仍保留 legacy fallback。
- **Change history:** 2026-06-23 创建本 brief，作为 Phase 4B spec 的上游意图；同日交付 renderer/windowing extraction evidence。
- **Implementation traceability:** delivered via `public/scripts/chat-message-render-descriptor.js`, `.docs/tech/main-chat-rendering-call-chain.md`, `tests/chat-message-render-descriptor.test.js`, `tests/chat-message-rendering.e2e.js`, `tests/chat-message-layout.e2e.js`; archival commit `58a2d93f00e993878e7aca4e18f094c05ec02649` (`feat(react): hand state the compatibility ledger`); delivery status `delivered`.

## Non-Goals

- 不在 brainstorming 阶段实现代码。
- 不删除 Phase 4 之外的 specs。
- 不把 Phase 7 full owner cutover 提前到 Phase 4。
- 不把 Hono、Drizzle 或 backend API 现代化混入 Phase 4。
