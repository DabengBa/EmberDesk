---
created: 2026-06-23
source: user-request
confirmed: true
last_updated: 2026-06-24
---

# React Phase 7 Full Owner Cutover Sequenced Specs

## User Original Request

用户要求使用 `$brainstorming`，把完整的 Phase 7 拆成多个步骤 `spec`，并且这些 `spec` 全部完成后即可完成 roadmap 里剩余的全部 React 现代化开发计划。

## Background & Motivation

当时 Phase 7 只有 phase-level archive/stub material，已经能说明 surface 顺序，但还不足以直接交给 `delivery-workflow` 做端到端交付。与此同时，Phase 4、Phase 5 和 Phase 6 的输入已经固定：Phase 4 提供 state / transport / renderer current-behavior proof，Phase 5 已关闭 backend runtime / Drizzle 方向的不确定性，Phase 6 已把 `JS-Slash-Runner` 定成 extension compatibility hard gate。用户当时要的是一个完整、可执行、不会把已归档阶段重新拉回 active 的 Phase 7 delivery set。按 2026-06-24 当前代码与文档状态，这组 Phase 7 dated delivery specs 已全部完成交付；原 active process specs 现在只作为归档前的流程材料，durable 入口由本 brief、Phase 7 phase README、roadmap、project history、ADR-0007 和 owning docs 持有。

## Archive Entry Points

- Roadmap: [.docs/tech/react-modernization-roadmap.md](../react-modernization-roadmap.md)
- Project history: [.docs/PROJECT_HISTORY.md](../../PROJECT_HISTORY.md)
- Phase 7 archive entry: [.docs/specs/react-phase7-full-owner-cutover/README.md](../../specs/react-phase7-full-owner-cutover/README.md)
- ADR closeout: [.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md](../../adr/0007-react-page-islands-with-legacy-fallbacks.md)
- Compatibility owner doc: [.docs/tech/third-party-extension-compatibility.md](../third-party-extension-compatibility.md)
- Main-chat transport proof: [.docs/logic-description/main_chat_streaming_transport_bridge_processing_flow.md](../../logic-description/main_chat_streaming_transport_bridge_processing_flow.md)
- Main-chat renderer/windowing proof: [.docs/tech/main-chat-rendering-call-chain.md](../main-chat-rendering-call-chain.md)

## Intent Domains

### Domain 1: Phase 7 spec set must close the roadmap

- **User expectation:** Phase 7 的 spec 集不是局部补丁，而是 roadmap 最后一批 active implementation specs；这些 specs 全部交付后，roadmap 剩余开发工作应视为完成。
- **Current status:** delivered as the guarded-island/compatibility-closeout baseline. Its former “roadmap closing” claim is superseded for already migrated surfaces by the 2026-07-16 retirement program in [ADR-0012](../../adr/0012-react-migrated-surface-legacy-retirement.md).
- **Change history:**
  - 2026-06-23: 创建本 brief，并把“完成这些 specs 即完成 roadmap”固定为本次 spec set 的最高约束。
  - 2026-06-24: `260623-05` through `260623-14` 全部完成 delivery、review、文档同步与 roadmap closeout，进入归档入口收口。
  - 2026-07-16: 产品确认不把 compatibility facade / rollback owner 作为已迁移 React surface 的最终形态；后续删除工作由新的 React legacy-retirement brief 和 ADR-0012 承接，不重写已交付 Phase 4-6 输入。
- **Implementation traceability:** delivered through the 2026-06-23 Phase 7 dated delivery set; durable closure in `.docs/tech/react-modernization-roadmap.md`, `.docs/PROJECT_HISTORY.md`, `.docs/specs/react-phase7-full-owner-cutover/README.md`, `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`; delivery status `delivered roadmap-closing Phase 7 spec set`.

### Domain 2: Prior completed phases are fixed inputs, not redesign targets

- **User expectation:** Phase 7 不得把已完成的 Phase 4 / 5 / 6 又重新改写成前置实现阶段，也不得借 cutover 名义重新讨论 Hono/Drizzle/Phase 4 state foundation。
- **Current status:** Phase 4 archive brief、Phase 5 ADR-0008/0009/0010、Phase 6 compatibility package 都已存在，并已在 roadmap / project history 中记为 durable inputs。ADR-0008 的 Hono route-island 决策后来由 ADR-0013 superseded；本 brief 只把它作为历史输入，不把它视为当前实现。
- **Change history:** 2026-06-23 创建本 brief，并把 prior-phase outputs 固定成只读输入。
- **Implementation traceability:** source docs `.docs/tech/react-modernization-roadmap.md`, `.docs/tech/briefs/react-phase4-state-management-sequenced-specs.md`, `.docs/tech/briefs/react-phase6-extension-compat-sequenced-specs.md`, `.docs/adr/0008-hono-route-island-under-express-host.md`, `.docs/adr/0009-derived-cache-sqlite-drizzle-decision.md`, `.docs/adr/0010-express-runtime-owner-boundary.md`; delivery status `input-frozen`.

### Domain 3: JS-Slash-Runner remains the hard blocker for extension-facing cuts

- **User expectation:** 任何涉及 extension host、global exports、alias、regex、slash 或 mount-point 的删除/收窄，都必须继续以 `JS-Slash-Runner` 兼容为首要 gate。
- **Current status:** Phase 6 已把 `JS-Slash-Runner` 定为 primary compatibility gate，并把无 migration / rollback 的 breaking candidate 标记为不得进入 Phase 7 删除路径。
- **Change history:** 2026-06-23 创建本 brief，并明确 Phase 7 的 extension/global specs 必须继承这个 gate，而不是重新定义。
- **Implementation traceability:** source docs `.docs/tech/third-party-extension-compatibility.md`, `.docs/specs/react-phase6-extension-compat/README.md`, `.docs/tech/briefs/react-phase6-extension-compat-sequenced-specs.md`; delivery status `input-frozen`.

### Domain 4: Main-chat and shell/global must be narrowed into smaller spec slices

- **User expectation:** 现有 Phase 7 Sprint 5 / 6 / 7 太宽，不应继续作为单块实现说明；spec set 需要按当前 proof boundary 拆成更窄的 transport, renderer/windowing, globals, workspace-shell 子步。
- **Current status:** delivered as a narrow-owner baseline. The former freeze/support decision is no longer the destination for migrated surfaces: future work must replace the retained behavior with React-era owners and compatibility contracts under ADR-0012, rather than delete behavior or retain legacy implementation indefinitely.
- **Change history:**
  - 2026-06-23: 创建本 brief，并把 Phase 7 默认拆法固定为“保留 surface 顺序，但把最宽的 sprint 再拆细”。
  - 2026-06-24: `260623-09` through `260623-14` 全部完成交付，原宽口 Sprint 5 / 6 / 7 已由可验证的窄 spec slices 取代。
- **Implementation traceability:** delivered via code paths `public/scripts/main-chat-visible-transport-owner.js`, `public/scripts/chat-generation-lifecycle.js`, `public/scripts/chat-message-render-descriptor.js`, `app/workspace-panels.tsx`, `public/script.js`, `scripts/startup-performance-runner.mjs`; durable docs `.docs/logic-description/main_chat_streaming_transport_bridge_processing_flow.md`, `.docs/tech/main-chat-rendering-call-chain.md`, `.docs/tech/third-party-extension-compatibility.md`, `.docs/PROJECT_HISTORY.md`, `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`; proof `bun run test:unit`, `bun run test:compat`, `bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-streaming.e2e.js --workers=1`, `bun run perf:startup`, `bun run perf:interaction -- --scenario main_chat_long_load_more --pairs 1 --repeats 1`; delivery status `delivered narrow-slice main-chat and shell/global closeout`.

## Source Evidence

- `.docs/specs/react-phase7-full-owner-cutover/README.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/PROJECT_HISTORY.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/logic-description/main_chat_streaming_transport_bridge_processing_flow.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `public/script.js`
- `public/scripts/character-library-react-sync.js`
- `public/scripts/world-info.js`
- `public/scripts/backgrounds.js`
- `public/scripts/extensions.js`
- `public/scripts/main-chat-visible-transport-owner.js`
- `public/scripts/chat-generation-lifecycle.js`
- `public/scripts/chat-message-render-descriptor.js`
- `app/workspace-panels.tsx`
- `scripts/startup-performance-runner.mjs`

## Non-Goals

- 不在 brainstorming 阶段实现任何 Phase 7 代码。
- 不重新打开 Phase 0-6 的已完成方向。
- 不把 backend runtime、storage canonical model、Drizzle adoption、Phase 4 state foundation 或 Phase 6 evidence collection 混回 Phase 7。
- 不把未证实的 future-only abstraction、配置开关或扩展点写进 spec set。
