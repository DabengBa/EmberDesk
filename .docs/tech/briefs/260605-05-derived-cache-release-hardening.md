# Derived Cache Release Hardening Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立 `.docs/specs/.../design.md`。

## Intent

第 4 步聚焦 derived cache release hardening：确认 `src/derived-cache-sqlite.js`、character index fallback、自愈、status、reset threshold 和 schema reset 在发布前足够可观察、可降级、可验证。

## Constraints

- SQLite sidecar 与 DiskCache 仍是 derived cache。
- cache 删除、损坏或不可用不得伤害 canonical filesystem data。
- 不新增 health endpoint，除非单独设计 API 边界。

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 4 步的用户意图。
