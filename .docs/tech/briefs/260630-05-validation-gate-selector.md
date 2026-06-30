---
created: 2026-06-30
source: user
confirmed: true
---

# Validation Gate Selector Intent

## Original Request

用户要求针对“最值得推进的现代化切口”进一步细分步骤，并使用 `$brainstorming` 编写多份开发设计规格。本 brief 对应切口五：“测试和文档作为重构门禁”。

## Context

EmberDesk 已有大量 focused validation gates，但选择命令仍依赖开发者手动读多个 tech docs。下一步可行收益是把 touched surface 到 focused commands 的映射固化成一个轻量选择器或清单，辅助 spec 和实现阶段选择验证，而不是替换 Jest、Playwright 或 docs compiler。

## Intent Domains

### Domain: validation gate selector

- User expectation: 未来实现 agent 能根据触碰面快速选择最低验证命令，并知道何时必须追加 `bun run test:compat`、`docs:check` 或 Playwright。
- Recommended first slice: 新增轻量 validation gate selector 文档/脚本，复用现有 package scripts 和 tech docs，不引入新测试框架。
- Current status: spec drafted, awaiting approval.
- Change history:
  - 2026-06-30: 记录用户要求的 5 个现代化 successor specs，并选择本切口的最小可交付边界。
  - 2026-06-30: `$grill-with-docs` 复核后确认 selector 必须 advisory-only，不自动运行、不替换 Jest/Playwright/docs compiler，也不把 focused Jest gates 改成 Bun test。

## Constraints

- 不替换 Jest、Playwright、docs compiler、Bun workflow。
- 不让 selector 成为唯一发布门禁；它只辅助选择 focused validation。
- 不改变 package scripts 语义，除非 spec 明确批准新增只读 helper script。
- 不删除现有 docs 或 process archive。

## Evidence Trail

- `.docs/tech/bun-workflow.md`
- `.docs/tech/frontend-structure-contracts.md`
- `.docs/tech/modernization-roadmap.md`
- `.docs/tech/briefs/260605-09-node26-release-validation-sweep.md`
- `.docs/tech/briefs/260605-10-documentation-topology-closure.md`
- `package.json`
- `tests/helpers/frontend-structure-contract.js`
- `.docs/db/scripts/doc-compiler.js`
