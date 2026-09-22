# U-12 Dossier：login/setup 页

> U-loop 面：`U-12 | login/setup 页 | 基础设施 | React | 低优先级收尾`
> U0 盘点日期：2026-09-22

## U0 面盘点

### 现状定性：**已迁移**（ADR-0012 既定交付物）

- `/login`：`app/routes/login.tsx` + `components/login/`（LoginForm/RecoveryForm/PasswordInput）+ `styles/login.styles.ts`
- `/setup`：`app/routes/setup.tsx` + `components/setup/` + Zod 校验（`setupMessages`/`buildSetupRequestBody`）
- 无 legacy `public/login.html`/`setup.html` 控制器（ADR-0012 明确禁止重引入）；`login-shared.js`/`setup-shared.js` 为既定共享 helper 边界

## U5 台账

- 结论：已迁移确认，无实施提交
- 文档：本档案

---

# U-loop 收尾总账（U-1 ~ U-12）

| 面 | 结论 |
|---|---|
| U-1 主聊天消息操作 | 已实施验收（浮层菜单） |
| U-2 右导航 | 已实施验收 |
| U-3 OptionsMenu+SelectChatPopup | 已实施验收（列表 React 化） |
| U-4 AI Config | 已实施验收（preset ⋮菜单+分节） |
| U-5 AdvancedFormattingPanel | 已实施验收（两行 preset ⋮菜单） |
| U-6 Settings | 已迁移（ADR-0012 交付） |
| U-7 World Info | 已实施验收（三缺口补齐） |
| U-8 CharacterLibraryPanel | 已迁移验证 |
| U-9 PersonaManagementPanel | 已实施验收（头像列表+分页 React 化） |
| U-10 Extensions host | 已迁移 + 死槽清理 25 个 |
| U-11 弹层族 | 已迁移验证（Popup 骨架=契约边界） |
| U-12 login/setup | 已迁移确认 |
