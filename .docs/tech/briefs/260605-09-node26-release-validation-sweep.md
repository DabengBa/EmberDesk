# Node 26 Release Validation Sweep Intent

Date: 2026-06-05

## Original Request

用户要求把 modernization roadmap 的“大梦”拆成 10 个可交付步骤，并为每一步分别创建独立 `.docs/specs/.../design.md`。

## Intent

第 8 步在 Node.js 26.3.0 下做 release validation sweep，集中证明 lint、tests lint、docs、compat、startup/config、route-order、shared-library、user/auth/setup/login、full unit suite 和必要 E2E。

## Constraints

- 不把非 Node 26.3 的本地结果当 release proof。
- Full Playwright E2E 只在 release 或 visible UI slice 需要时作为 gate。
- 发现 failure 时按 failure surface 修复，不扩大为无边界重构。

## Change History

- 2026-06-05: 记录 10-step roadmap closure program 中第 8 步的用户意图。
