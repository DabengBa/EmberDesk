# Documentation Topology Closure Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立临时交付设计文件；wrap-up 后持久入口改为本 brief、roadmap 和 project history。

## Intent

第 9 步收束文档与拓扑：删除 stale process docs，只保留高价值 briefs、PROJECT_HISTORY、tech docs、ADR 和 semantic docs，并让 `.docs/db` 拓扑无断链、无孤岛、无过期语义。

## Constraints

- 不删除未跟踪文件。
- 不把 process docs 当 durable archive。
- 用户可见语义只由 `.docs/db` owning docs 记录。

## Implementation Traceability

Delivered status: completed on 2026-06-05.

Documentation paths:

- `.docs/tech/briefs/README.md` now indexes the retained 260605 closure briefs and clarifies that delivery-workflow briefs remain persistent intent records while they still carry roadmap, successor-decision, or traceability value.
- `.docs/tech/modernization-roadmap.md` now distinguishes durable briefs from spec-local `design.md`/`plan.md` process artifacts that are deleted during wrap-up.
- `.docs/db` semantic docs were not changed because no user-visible semantics changed.

Validation:

- `bun run docs:check`
- `git diff --check -- .docs`
- relative-time sweep across `AGENTS.md`, `.docs`, and `README.md`

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 9 步的用户意图。
- 2026-06-05: 完成 documentation topology closure；没有删除未跟踪文件，没有改 `.docs/db` 用户可见语义，后续进入 roadmap freeze / successor decision。
