---
created: 2026-06-30
source: user
confirmed: true
---

# Derived Cache Observability Intent

## Original Request

用户要求针对“最值得推进的现代化切口”进一步细分步骤，并使用 `$brainstorming` 编写多份开发设计规格。本 brief 对应切口四：“保留文件正本，扩大 derived cache 性能现代化”。

## Context

EmberDesk 当前只把 SQLite 用作 character index derived sidecar，且 ADR-0009 明确拒绝把 Drizzle 引入当前 slice。下一步可行收益是让现有 performance runner 和 artifact 更清楚记录 sidecar status/fallback reason，帮助判断热路径收益，而不是扩大存储模型。

## Intent Domains

### Domain: derived cache observability in interaction performance reports

- User expectation: 性能报告能说明本次跑的是 SQLite fast path、filesystem fallback、force_off、unsupported 还是 reset-threshold disabled，从而让性能结论可审计。
- Recommended first slice: 将现有 character-index sidecar read-only status 纳入 `scripts/interaction-performance-runner.mjs` 输出和 `src/interaction-performance-report.js` 汇总。
- Current status: spec drafted, awaiting approval.
- Change history:
  - 2026-06-30: 记录用户要求的 5 个现代化 successor specs，并选择本切口的最小可交付边界。
  - 2026-06-30: `$grill-with-docs` 复核后确认无需 health endpoint / ORM / 新 sidecar；只复用 read-only status、interaction headers 和 performance artifact，并补充 Node `node:sqlite` 与 Server-Timing 官方证据。

## Constraints

- 不新增 canonical database。
- 不引入 Drizzle。
- 不新增 HTTP health endpoint。
- 不改变 `_cache/character-index.sqlite` 的 derived-only、可删除重建、失败降级规则。

## Evidence Trail

- `.docs/adr/0009-derived-cache-sqlite-drizzle-decision.md`
- `.docs/tech/derived-cache-sqlite.md`
- `.docs/tech/interaction-performance-indexing.md`
- `.docs/tech/briefs/260605-05-derived-cache-release-hardening.md`
- `src/derived-cache-sqlite.js`
- `src/endpoints/character-index.js`
- `src/interaction-performance-report.js`
- `scripts/interaction-performance-runner.mjs`
- `tests/derived-cache-sqlite.test.js`
- `tests/interaction-performance-report.test.js`
