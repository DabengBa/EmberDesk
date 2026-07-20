---
created: 2026-07-20
source: user
confirmed: true
last_updated: 2026-07-20
feature_slug: settings-workspace-overlay
status: delivered
---

# Settings Workspace Overlay Intent

## 原始请求

用户确认当前 Settings 是独立页面，和既有左侧边栏 / 中央浮动面板工作区模式差距大，整页跳转影响使用体验。用户要求结合 2026 年同类 AI 工作台与竞品给出调整方向后，明确授权 `$brainstorming` 编写开发文档（实现 `spec.md` + 执行 `plan.md`）。

相关上下文（同会话已完成或正在进行的 shell/welcome 清理）：

- Welcome 去掉 Docs / Discord / GitHub / Temporary Chat
- 去掉 Workspace ready、Character Library ready 等无意义状态文案
- Character Authoring 不再作为顶栏独立入口，创建/编辑从 Character Library 进入
- 本地 dev `http://127.0.0.1:8000/` 需可访问

用户随后要求对 Settings 打开路径做丝滑化调整的开发文档，而非继续讨论。

## 目标结果

用户在 `/` Chat Workspace 中点击 Settings / AI Config / Formatting 时，不离开当前聊天上下文，而在工作区内打开同一 React Settings 内容；`/settings` 与 `/settings?tab=...` 仍可作为深链、刷新与分享入口。

## Checkpoint A

- **目标结果**：Settings 日常主路径改为 in-workspace overlay/drawer；完整页路由保留为二级入口；同一 React Settings owner。
- **当前状态**：
  - React `/settings` 已是通用设置、provider、UI、advanced 的 sole owner（见 `page.settings` 与 retirement 交付）。
  - Workspace shell 中 Settings / AI Config / Formatting 仍通过 `window.location.assign('/settings...')` 整页跳转。
  - 其它 registry 面板（Character Library、World Info、Backgrounds、Extensions、Group Chats）为同页 open/close。
  - 本会话已有未提交 shell/welcome/authoring 导航清理，不得回滚无关脏工作区。
- **假设**：
  - 首切片只改打开路径与挂载形态，不重写 settings 字段、保存 API、secret 流或 revision 冲突逻辑。
  - 不恢复 legacy jQuery Settings/API/Formatting drawers 作为产品 owner。
  - overlay 默认关闭未保存草稿即可；复杂 dirty-close confirm 可后续切片。
- **硬约束**：
  - same-entry `/`，不建 `/workspace-next`。
  - 保留 `/settings` 认证路由与缺 build HTTP 503 语义。
  - 不扩展 React SPA 边界到整站；可在 workspace-panels 中挂载 Settings 表面。
  - 扩展兼容、protected DOM、CSRF/secret 边界不变。
- **风险边界**：
  - Settings 当前在 React page app（`build:react` / `app/routes/settings.tsx`），workspace chrome 在 `workspace-panels` 独立 bundle；需要可复用的 Settings surface 挂载，而不是把整页路由硬嵌进 shell。
  - 与其它 shell 面板的互斥 / focus / scroll-lock。
  - 现有 E2E 断言整页跳到 `/settings`，需改为 overlay 期望并保留深链覆盖。
- **未决问题**：无阻塞问题。默认采用“大面板 overlay + 保留完整路由”。
- **推荐默认**：最小可交付切片 = 改 shell 打开路径到 in-workspace Settings overlay；AI Config → providers tab，Formatting → advanced tab；`/settings` 完整页继续工作。

## 范围边界

- 包含：shell Settings / AI Config / Formatting 打开路径、overlay 挂载/关闭/active 态、tab 初始选择、`/settings` 深链保留、相关单测/E2E/语义文档。
- 排除：settings 字段覆盖扩面、schema/API 变更、legacy drawer 恢复、未保存关闭确认高级策略、connection-profile 应用流程重写、账户/计费类新设置域。

## 变更历史

- 2026-07-20：用户咨询 Settings 独立页体验断层；给出 in-workspace overlay 推荐。
- 2026-07-20：用户授权 `$brainstorming 编写开发文档`；创建本 brief 与过程包。

## 参考资料

- `public/script.js`（`openSettings` / `openAIConfig` / `openFormatting` / legacy drawer route handoff）
- `app/workspace-panels.tsx`（shell navigation registry / dock）
- `app/routes/settings.tsx`、`app/components/settings/*`、`app/lib/settings-helpers.js`
- `.docs/db/pages/settings.md`、`.docs/db/pages/chat-workspace.md`、`.docs/db/features/next-workspace-shell.md`
- `.docs/tech/legacy-cutover-ledger.md`、`.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `tests/workspace-shell-panel-navigation.e2e.js`、`tests/react-workspace-panels-helpers.test.js`、`tests/settings.e2e.js`

## 交付追溯

- Code: `app/components/settings/SettingsSurface.tsx`, `app/workspace-panels.tsx`, `public/script.js`, `public/scripts/workspace-panels-react-bridge.js`, `app/routes/settings.tsx`, `app/styles/settings-surface.css`
- Docs: `.docs/db/pages/settings.md`, `.docs/db/pages/chat-workspace.md`, `.docs/db/features/next-workspace-shell.md`, `.docs/db/pages/api-configuration.md`, `.docs/PROJECT_HISTORY.md`, `.docs/tech/legacy-cutover-ledger.md`
- Tests: `tests/react-workspace-panels-helpers.test.js`, `tests/workspace-shell-panel-navigation.e2e.js`, `tests/settings.e2e.js`, `tests/settings-react-route.test.js`
