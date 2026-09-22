# U-6 档案：Settings 面（/settings 四 tab + #user-settings-block）

> U-loop 面盘点。日期 2026-09-21。**结论：迁移目标已达成，本轮关闭。**

## U0 结论

- **`/settings` 页（四 tab）**：ADR-0012 已交付的完整 React 应用——`SettingsSurface.tsx`（2569 行，TanStack Form + Zod schema + React Query）+ `SettingsTabs`/`SettingField`/`SettingsSection`。General/Providers/UserInterface/Advanced + Payload Summary/Diagnostics 侧卡。浏览器实测：现代形态，无 legacy 交互。
- **`#user-settings-block`（PowerUserPanel，695 行）**：React 标记 + `power_user` 契约绑定（power-user.js 按 ID `.prop()`/body class 切换）；`#settingsSearch` 由 setting-search.js 驱动（读渲染后 DOM，非 DOM 构建）。**无老式弹层、无模板克隆、无 jQuery DOM 构建**——残余仅为字段绑定，即既定契约边界。
- 侧证：`settings-react-route.test.js`/`settingsOwnerInventory` 钉点全在位。

## 决议

用户拍板"跳过，直接进 U-7"。U-6 记为已迁移关闭——无 U2 实施、无提交。`.docs/db` 无需更新（零行为变化）。
