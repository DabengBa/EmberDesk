---
created: 2026-06-29
source: user
confirmed: true
last_updated: 2026-06-30
---

# Main Chat Bridge Contract Intent

Date: 2026-06-29

## Original Request

用户要求将架构分析中的 main-chat bridge contract deepening opportunity 写成独立开发设计文档。

## Context

main-chat React island 已经有明确 ADR 约束：标准 OpenAI visible direct-chat 子集可以由 React visible transport 拥有，非 OpenAI、group、dry-run、nested-visible、quiet/background helper、unsafe rows 和 extension-mutated rows必须留在 legacy owner。当前 owner decision、snapshot schema、fallback reason、rich-body eligibility 和 hidden controller markers 分散在 `public/script.js`、`app/workspace-panels.tsx` 和相关 helper 中。

## Intent Domains

### Domain: main-chat bridge contract consolidation

- User expectation: 让 legacy shell 和 React panel 对 main-chat owner/fallback/snapshot contract 使用同一份解释，不扩大 React main-chat ownership，也不改变 `.mes` / `.mes_text` / `#show_more_messages` 兼容结构。
- Current status: delivered.
- Change history:
  - 2026-06-29: 记录该切片只允许集中 contract 常量和 eligibility 规则，不改 transport owner 边界。
  - 2026-06-30: 新增 `public/scripts/main-chat-bridge-contract.js`，统一 visible transport status/path/reason、shared snapshot schema marker 与 rich-body fallback reason。
  - 2026-06-30: `public/script.js`、`public/scripts/main-chat-visible-transport-owner.js`、`public/scripts/chat-message-render-descriptor.js` 和 `app/workspace-panels.tsx` 改为共享使用同一份 contract 常量，focused unit/build proof 保持绿色。
- Implementation traceability:
  - Code paths: `public/scripts/main-chat-bridge-contract.js`, `public/script.js`, `public/scripts/main-chat-visible-transport-owner.js`, `public/scripts/chat-message-render-descriptor.js`, `app/workspace-panels.tsx`.
  - Tests: `tests/main-chat-bridge-contract.test.js`, `tests/main-chat-visible-transport-owner.test.js`, `tests/chat-message-render-descriptor.test.js`, `tests/react-workspace-panels-helpers.test.js`.
  - Owning docs: `.docs/tech/react-modernization-roadmap.md`, `.docs/PROJECT_HISTORY.md`.
  - Commit / PR trace: archived in the current wrap-up commit.
  - Delivery status: delivered without expanding approved React main-chat ownership.

## Constraints

- 不扩大 React main-chat ownership。
- 不改变 `.mes`、`.mes_text`、`#show_more_messages`、message action、streaming token append 或 formatter ownership。
- quiet/background helper 仍是 legacy-owned non-visible contract。
- `eventSource` / `event_types` 保持 long-term public contracts。

## Evidence Trail

- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `.docs/tech/main-chat-successor-scope.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `.docs/tech/main-chat-generation-lifecycle.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `public/script.js`
- `public/scripts/main-chat-visible-transport-owner.js`
- `public/scripts/chat-message-render-descriptor.js`
- `app/workspace-panels.tsx`
- `app/stores/main-chat-observation-store.js`
- `tests/main-chat-visible-transport-owner.test.js`
- `tests/chat-message-render-descriptor.test.js`
- `tests/react-workspace-panels-helpers.test.js`
- `tests/chat-message-streaming.e2e.js`

## Change History

- 2026-06-29: 创建 main-chat bridge contract spec 的用户意图记录。
- 2026-06-30: 追加实现追溯，记录 shared main-chat contract module 已交付。
