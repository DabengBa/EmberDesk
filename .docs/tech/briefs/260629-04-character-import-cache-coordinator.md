---
created: 2026-06-29
source: user
confirmed: true
last_updated: 2026-06-30
---

# Character Import Cache Coordinator Intent

Date: 2026-06-29

## Original Request

用户要求将架构分析中的 character route/import/cache deepening opportunity 写成独立开发设计文档。

## Context

`src/endpoints/characters.js` 已经有 `character-read-service.js`、`character-write-service.js` 和 card helpers，但 route 文件仍包含 DiskCache、thumbnail pregeneration、index refresh、多格式导入、TavernCard 转换和 HTTP response shaping。2026-06-09 的 character write command 已交付 create/edit/rename 单卡写路径，本轮不应重复该已完成切片，而应聚焦尚留在 route 文件中的 import/cache 协调。

## Intent Domains

### Domain: character import coordination boundary

- User expectation: 让 `/api/characters/import` 的格式分派和 derived side effects 更集中、更可测试，同时保持 file-backed canonical card ownership 和原有 HTTP response shape。
- Current status: delivered.
- Change history:
  - 2026-06-29: 记录 `/api/characters/import` 应作为独立 import/cache deepening 切片，不混入已交付的 single-card write command。
  - 2026-06-30: 新增 `src/endpoints/character-import-service.js`，把格式分派、空结果规范化和导入后 `refreshCharacterIndexEntrySafe(..., 'import')` 集中到 route-adjacent coordinator。
  - 2026-06-30: `src/endpoints/characters.js` 的 `/import` route 收缩为请求校验、上传清理和 HTTP response mapping；focused tests 固定支持格式、unsupported format 和成功后 side-effect ordering。
- Implementation traceability:
  - Code paths: `src/endpoints/character-import-service.js`, `src/endpoints/characters.js`.
  - Tests: `tests/character-import-service.test.js`, `tests/character-write-service.test.js`, `tests/character-read-service.test.js`, `tests/interaction-performance-index.test.js`, `tests/express5-route-compatibility.test.js`.
  - Owning docs: `.docs/tech/interaction-performance-indexing.md`, `.docs/PROJECT_HISTORY.md`.
  - Commit / PR trace: archived in the current wrap-up commit.
  - Delivery status: delivered without changing canonical card storage or `/api/characters/import` response shape.

## Constraints

- canonical character data 仍是 file-backed PNG/JSON card。
- `DiskCache`、thumbnail 和 `_cache/character-index.sqlite` 仍是 derived cache 或派生副作用。
- 不改变 `/api/characters/import` response shape。
- 不重写 create/edit/rename 已有 `character-write-service.js` 边界。

## Evidence Trail

- `.docs/adr/0009-derived-cache-sqlite-drizzle-decision.md`
- `.docs/tech/interaction-performance-indexing.md`
- `.docs/tech/derived-cache-sqlite.md`
- `.docs/tech/briefs/260609-02-character-card-write-command.md`
- `src/endpoints/characters.js`
- `src/endpoints/character-write-service.js`
- `src/endpoints/character-read-service.js`
- `src/endpoints/character-index.js`
- `tests/character-write-service.test.js`
- `tests/character-read-service.test.js`
- `tests/interaction-performance-index.test.js`
- `tests/express5-route-compatibility.test.js`

## Change History

- 2026-06-29: 创建 character import/cache coordinator spec 的用户意图记录。
- 2026-06-30: 追加实现追溯，记录 route-adjacent import coordinator 已交付。
