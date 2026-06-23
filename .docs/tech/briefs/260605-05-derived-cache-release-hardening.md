# Derived Cache Release Hardening Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立临时交付设计文件；wrap-up 后持久入口改为本 brief、roadmap 和 project history。

## Intent

第 4 步聚焦 derived cache release hardening：确认 `src/derived-cache-sqlite.js`、character index fallback、自愈、status、reset threshold 和 schema reset 在发布前足够可观察、可降级、可验证。

## Constraints

- SQLite sidecar 与 DiskCache 仍是 derived cache。
- cache 删除、损坏或不可用不得伤害 canonical filesystem data。
- 不新增 health endpoint，除非单独设计 API 边界。

## Delivery Trace

- Status: Delivered on 2026-06-05 as an evidence-closure hardening slice.
- Code path: No implementation change was required; `src/derived-cache-sqlite.js`, `src/endpoints/character-index.js`, and `src/endpoints/character-read-service.js` already satisfied the release-hardening boundary.
- Verified boundaries: unsupported `node:sqlite`, `force_off`, startup status, cache path escape guard, PRAGMA baseline, schema-version reset, corrupt DB rebuild, reset-threshold disable, keyed dispose, dispose-then-open, character-read filesystem fallback, circuit-disabled throw behavior, and `/api/characters/get` index refresh failure handling.
- Proof: `derived-cache-sqlite.test.js` passed 13 tests, `character-read-service.test.js` passed 11 tests, and `interaction-performance-index.test.js` passed 29 tests.

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 4 步的用户意图。
- 2026-06-05: 完成 release-hardening 证据闭环，确认无需改变 operator UI、HTTP `/health`、canonical data 或 sidecar 行为。
