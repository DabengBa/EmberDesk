---
created: 2026-06-29
source: user
confirmed: true
last_updated: 2026-06-30
---

# Util Domain Module Clustering Intent

Date: 2026-06-29

## Original Request

用户要求将架构分析中的 `src/util.js` domain clustering deepening opportunity 写成独立开发设计文档。

## Context

`src/util.js` 约 1577 行，包含 config、zip/archive、date、URL/IP、cache、filesystem safety、schema flattening、HTTP2、permissions、Firefox cache invalidation 等不同关注点。机械拆文件会制造新浅模块；更安全的第一步是按调用簇抽出一个已有行为清晰、测试可覆盖、向后兼容 re-export 的 domain module。

## Intent Domains

### Domain: archive helper domain extraction

- User expectation: 为 `src/util.js` 的长期瘦身建立一个按调用簇拆分的安全模板，先抽出 archive/zip helper，而不是机械切分整文件或触碰 config/path/security helpers。
- Current status: delivered.
- Change history:
  - 2026-06-29: 记录 archive/zip helper 是 `src/util.js` 中最适合作为第一步深模块拆分的调用簇。
  - 2026-06-30: 新增 `src/archive-utils.js` 承载 `extractFileFromZipBuffer()`、`normalizeZipEntryPath()`、`extractFilesFromZipBuffer()` 和 `getImageBuffers()` 的实现。
  - 2026-06-30: `src/util.js` 保留 re-export 兼容表面，focused archive proof 与既有 util/import tests 保持通过。
- Implementation traceability:
  - Code paths: `src/archive-utils.js`, `src/util.js`.
  - Tests: `tests/archive-utils.test.js`, `tests/util.test.js`, `tests/util-pure.test.js`, `tests/chat-import-converters.test.js`, `tests/character-card-helpers.test.js`, `tests/express5-route-compatibility.test.js`.
  - Owning docs: `.docs/tech/config-resolution.md`, `.docs/PROJECT_HISTORY.md`.
  - Commit / PR trace: archived in the current wrap-up commit.
  - Delivery status: delivered with `src/util.js` re-export compatibility retained.

## Constraints

- 不改变 config singleton、`getConfigValue()` 或 command-line 初始化顺序。
- 不改变 path safety、SSRF/IP resolution 或 permission 行为。
- 不做 `src/util.js` 全量拆分。
- 不要求所有 importers 立即改用新 module；先保持 re-export 兼容。

## Evidence Trail

- `.docs/adr/0002-config-resolution-three-phase-split.md`
- `.docs/tech/config-resolution.md`
- `src/util.js`
- `tests/util.test.js`
- `tests/util-pure.test.js`
- `tests/chat-import-converters.test.js`
- `tests/character-card-helpers.test.js`
- `tests/express5-route-compatibility.test.js`

## Change History

- 2026-06-29: 创建 util domain module clustering spec 的用户意图记录。
- 2026-06-30: 追加实现追溯，记录 archive helper domain extraction 已交付。
