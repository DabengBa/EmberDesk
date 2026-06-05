# Compatibility Hardening Pass Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立 `.docs/specs/.../design.md`。

## Intent

第 6 步把 extension、regex、slash command、`@sillytavern/*`、`public/lib.js` 与 character-list DOM identity 的测试边界刷新为 release boundary。

## Constraints

- 不删除 public compatibility surface。
- 不重命名 protected exports、selectors、aliases 或 regex placement values。
- 任何 public surface removal 必须另开 migration design。

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 6 步的用户意图。
