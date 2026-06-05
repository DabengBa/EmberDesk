# Documentation Topology Closure Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立 `.docs/specs/.../design.md`。

## Intent

第 9 步收束文档与拓扑：删除 stale process docs，只保留高价值 briefs、PROJECT_HISTORY、tech docs、ADR 和 semantic docs，并让 `.docs/db` 拓扑无断链、无孤岛、无过期语义。

## Constraints

- 不删除未跟踪文件。
- 不把 process docs 当 durable archive。
- 用户可见语义只由 `.docs/db` owning docs 记录。

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 9 步的用户意图。
