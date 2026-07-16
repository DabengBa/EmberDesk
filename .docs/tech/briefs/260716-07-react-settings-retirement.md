---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-16
feature_slug: react-settings-retirement
status: delivered
---

# React Settings Retirement Intent

## 原始请求

用户要求 Settings 不再只是 coverage slice，而是在行为完整后删除 legacy settings drawers 和 fallback。

## 目标结果

`/settings` 成为认证用户全部通用设置、API/provider 配置和 formatting/power-user settings 的唯一 owner；保留完整保存、secret、revision conflict 与 startup application 行为。

## Checkpoint A

- **目标结果**：用户不再需要回到 workspace drawer 补充设置，且旧 drawer 不再作为产品入口。
- **当前状态**：已交付。React `/settings` 为 sole owner；product flag 退休；shell Settings / AI Config / Formatting 路由到该页；缺 build 时 HTTP 503。
- **假设**：World Info、Backgrounds、Extensions、Persona 管理继续由各自 surface 拥有，不因字段存于 settings document 自动并入本页。
- **硬约束**：完整 settings JSON、unknown fields、`settings_revision`、secret manager、provider-specific values、startup application 保持。
- **风险边界**：全量表单可能错误归一化未知/legacy values，或保存时覆盖并发 revision。
- **未决问题**：无。
- **推荐默认**：以 coverage binding 建立完整 owner inventory，按 General/Provider/UI/Advanced 分组补齐，不新增 settings schema 或第二保存 API。

## 范围边界

- 包含通用 settings、API configuration、formatting/power-user controls、connection profiles 与 secrets 入口。
- 排除由 World Info、Backgrounds、Extensions、Persona 专属 surface 管理的工作流。
- 不改变 canonical settings authority 或 secret storage。

## 变更历史

- 2026-07-16：创建 Settings full coverage 与 legacy drawer 退休包。
- 2026-07-16：交付完成；移除 active_process_dir；稳定追溯见 settings / api-configuration / chat-workspace 与 PROJECT_HISTORY。

## 稳定追溯

- Code: `app/routes/settings.tsx`, `app/lib/settings-helpers.js`, `app/components/settings/`, `src/users.js`, `src/react-settings-feature.js`, `public/script.js`, `public/scripts/provider-secret-field-state.js`
- Docs: `.docs/db/pages/settings.md`, `.docs/db/pages/api-configuration.md`, `.docs/db/pages/chat-workspace.md`, `.docs/tech/legacy-cutover-ledger.md`, `.docs/PROJECT_HISTORY.md`, ADR-0012
- Tests: `tests/settings-react-route.test.js`, `tests/settings.e2e.js`, `tests/provider-secret-field-state.test.js`, `tests/react-workspace-panels-helpers.test.js`

## 参考资料

- `app/routes/settings.tsx`
- `app/lib/settings-helpers.js`
- `app/components/settings/`
- `src/users.js`
- `public/script.js`
- `public/scripts/power-user.js`
- `tests/settings-react-route.test.js`
- `.docs/db/pages/settings.md`
