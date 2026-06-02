---
created: 2026-06-02
source: "User asked what the next chat import converter slice means, then invoked $brainstorming to write the design."
confirmed: true
last_updated: 2026-06-02
---

# Brief: 260602-02 Chat Import Converter Helper Extraction

## User Original Request

- "所以这是干嘛的? 导入其他聊天工具的聊天?"
- "$brainstorming 好吧, 写设计方案吧"

Working interpretation before approval: the requested design target is the confirmed next roadmap slice, namely extracting pure chat import converter helpers from `src/endpoints/chats.js` before any broader chat route split.

## Background & Motivation

The previous modernization slice delivered a pure character-card helper boundary. The roadmap now identifies `src/endpoints/chats.js` as the next backend modernization target, but the user clarified that the slice is about importing chat history exported by other tools. The goal is to preserve existing external chat import compatibility while making converter behavior directly testable before future route/service extraction.

## Intent Domains

| Intent Domain | User Expectation | Current Status | Change History | Implementation Traceability |
|---|---|---|---|---|
| Chat import compatibility | Preserve importing chat histories from external tools while improving maintainability | Delivered | 2026-06-02: user confirmed the feature meaning as importing other chat tools' chats; 2026-06-02: user invoked `$brainstorming` to write the design; 2026-06-02: implementation extracted the converters without changing the import route contract | Code paths: `src/endpoints/chats.js`, `src/endpoints/chat-import-converters.js`; proof: `tests/chat-import-converters.test.js`; delivery status: delivered |
| First shippable slice | Extract only pure converter logic before touching route/file side effects | Delivered | 2026-06-02: roadmap narrowed next work to chat import converters, with backup helpers deferred; 2026-06-02: backup helpers remain the next separate chat slice | Delivered scope: Ooba, Agnai, CAI Tools, Kobold Lite, Chub JSONL flattening, RisuAI converters, and JSON converter selection |
| Behavior preservation | Keep `/api/chats/import` behavior unchanged while adding direct regression proof | Delivered | 2026-06-02: route-owned behavior identified as upload cleanup, file naming, JSON/JSONL branching, Chub fallback, and chat-stat dirty marking; 2026-06-02: final review confirmed those side effects remain in `src/endpoints/chats.js` | Proof: `bun run --cwd tests test:unit -- chat-import-converters.test.js --runInBand`, `bun run lint`, `git diff --check`; no `.docs/db` change because user-visible import semantics did not change |

## Non-Goals

- Do not change `/api/chats/import` request or response shape.
- Do not change JSONL serialization format.
- Do not change chat save/load, integrity checks, group chat import, search/recent routes, or chat backup throttling.
- Do not change character-index dirty marking semantics.
- Do not update `.docs/db/` unless implementation later changes user-visible import behavior, which is not expected for this slice.
