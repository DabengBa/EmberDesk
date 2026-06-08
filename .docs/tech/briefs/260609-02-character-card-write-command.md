# Character Card Write Command Intent

---
created: 2026-06-09
source: reconstructed from delivered implementation `f337e5ffe` and the approved architecture-deepening intent brief
confirmed: implementation-delivered
last_updated: 2026-06-09
---

## User Original Request

The original brainstorming turn is not available in this session. The approved spec records the intended request as: extract the character-card create/edit write path into a route-adjacent write command module while preserving canonical PNG card writes, thumbnail side effects, character-index refresh/delete ordering, and legacy HTTP response shapes.

## Background & Motivation

`src/endpoints/characters.js` still mixes Express adapter work, card formatting, PNG writes, upload cleanup, thumbnail policy, and derived character-index side effects. The project already extracted a read-side route service, so the next safe backend modernization step is to move single-card write orchestration behind a focused command boundary without changing file-backed canonical storage or browser callers.

## Intent Domains

### Character Card Write Boundary

- User expectation: create/edit character-card writes should become easier to test and reason about without broad endpoint rewrites.
- Current status: delivered on 2026-06-09.
- Change history:
  - 2026-06-09: Added `src/endpoints/character-write-service.js` with create/edit/rename single-card command orchestration and explicit filesystem, write, cache, and index dependencies.
  - 2026-06-09: Updated `src/endpoints/characters.js` so `/create`, `/edit`, and the related single-card `/rename` path delegate write orchestration while keeping route validation and response mapping in the route layer.
- Implementation traceability:
  - Code paths: `src/endpoints/character-write-service.js`, `src/endpoints/characters.js`.
  - Tests: `tests/character-write-service.test.js`, `tests/thumbnail-write-time-pregeneration.test.js`, `tests/interaction-performance-index.test.js`, `tests/express5-route-compatibility.test.js`.
  - Delivery status: implementation and review complete; wrap-up pending at time of brief creation.

## Grill Review Addendum: 2026-06-09

用户要求不要追问，而是联网搜索、自问自答，并结合 Claude Code 只读复核综合修改文档。本切片已经在当前 HEAD `f337e5ffe` 交付，所以本 addendum 记录后续维护约束，而不是重建已归档的 process `spec.md`/`plan.md`。

Self-Q&A 结论：

- Q: 角色卡写命令是否受 OpenAI streaming、OWASP SSRF、Testing Library 或 workspace/RAG/tools 趋势直接影响？A: 不直接影响。外部证据不改变本切片范围；它只支持“不要借架构深化扩大产品能力”的总约束。
- Q: create/edit/rename 是否可以共用一套无差别写入参数？A: 不可以。`createCharacterCard`、`editCharacterCard` 和 `renameCharacterCard` 必须保留不同的 avatar naming、chats-directory creation、upload cleanup、cache bust、thumbnail policy、old index delete 和 new index refresh 顺序。
- Q: 这个已交付切片还需要过程 spec/plan 文件吗？A: 不需要。当前 durable traceability 是本 brief、`.docs/PROJECT_HISTORY.md`、`.docs/tech/interaction-performance-indexing.md`、实现文件和 focused tests。

Claude Code 综合取舍：

- 接受：命令模块不能假设 create/edit 当前 `writeCharacterData()` 调用完全一致；已通过 `createCharacterCard` 与 `editCharacterCard` 的差异化依赖和测试表达。
- 接受：side-effect order 是本切片的核心验收，不应只测试 HTTP response shape。
- 拒绝：把 `/api/characters/import` 或 `/api/characters/merge-attributes` 顺手迁入本切片；这些路径包含格式转换、导入 prompts 和兼容行为，需要单独 spec。

上线风险分类：

- Tiger: 副作用顺序错误可能留下 stale thumbnail、stale `DiskCache` payload、旧 `_cache/character-index.sqlite` row 或孤立旧 PNG。维护者修改命令时必须保留 focused order assertions。
- Paper Tiger: create write 失败后可能留下空 chats directory；当前行为与既有 file-backed route 容忍度一致，不在本切片回滚，只有当它造成可见列表或导入失败时才升级为 bug/spec。
- Elephant: 角色卡写路径和读路径现在各有 service boundary。后续若继续拆 import/merge/duplicate，必须先决定这些路径是进入同一 write command service，还是成为单独 import command；不能在 route 内重新散落 canonical write 副作用。

## Non-Goals

- Do not migrate `/api/characters/import` or `/api/characters/merge-attributes` in this slice.
- Do not change the character card schema, TavernCard V2 conversion, tag import, world-book import prompts, or character editor UI.
- Do not make `DiskCache`, thumbnails, or `_cache/character-index.sqlite` canonical storage.
- Do not introduce new frontend request payloads or response shapes for existing browser callers.

## Change History

- 2026-06-09: Created durable intent brief from the delivered character card write command boundary.
- 2026-06-09: Added no-question grill review addendum; recorded create/edit/rename difference, side-effect order as hard maintenance proof, and process spec/plan omission as expected after delivered traceability moved to durable docs.
