# Settings 工作区 Overlay 打开路径

## 意图与核心流程

让用户在 Chat Workspace（`/`）内打开 Settings / AI Config / Formatting 时，不再整页跳到 `/settings`，而是以工作区内大面板 overlay 使用**同一 React Settings owner**；完整页 `/settings` 仅作为深链、刷新与分享入口。

主要参与者：已认证用户；触发入口为 React workspace shell 导航按钮 Settings、AI Config、Formatting，以及兼容层仍可点击的 legacy drawer toggle（若仍存在）。

主路径：

1. 用户在 `/` workspace 中点击 **Settings**（或 AI Config / Formatting）。
2. 页面 URL 保持在 workspace（不离开 `/`）；出现 Settings overlay，背后聊天上下文仍在。
3. Overlay 展示与完整页相同的 Settings 内容：tabs、字段、save、secret、revision 冲突处理。
4. AI Config 打开时初始 tab 为 `providers`；Formatting 初始 tab 为 `advanced`；Settings 默认 `general`（或路由/参数指定的合法 tab）。
5. 用户关闭 overlay（关闭按钮、Esc、或再次点击同一 shell 入口）后回到当前聊天上下文，shell 对应入口 active 清除。
6. 用户直接访问 `/settings` 或 `/settings?tab=providers|advanced|...` 时，仍进入完整 Settings 页；缺 React build 时仍 HTTP 503，不回退 legacy drawer。

## 范围 / 不做范围

### 本次要做

- 将 shell `openSettings` / `openAIConfig` / `openFormatting` 从 `window.location.assign('/settings...')` 改为 in-workspace Settings overlay 打开路径。
- 复用现有 React Settings 表单/owner 逻辑（字段、tabs、save、secret、revision conflict），避免第二套设置 UI。
- Overlay 的 open/close、初始 tab、shell `aria-pressed` / dock active 态。
- 兼容入口（若仍捕获 legacy drawer toggle）同步改为打开 overlay（或等价同页路径），而不是整页跳转；不得重新启用 legacy settings 表单 owner。
- 更新 unit / e2e 与语义文档：`page.settings`、`page.chat_workspace`、`feature.next_workspace_shell`；必要时 ledger/history 一句记录打开路径变化。
- 保留 `/settings` 完整页与 `?tab=` 深链行为。

### 明确不做

- 不重写 settings 字段覆盖、schema、`/api/settings/*` 语义、secret storage、connection-profile 应用业务。
- 不恢复 legacy User Settings / AI Config / Advanced Formatting drawer 作为产品 owner。
- 不新建 `/workspace-next` 或把整站改成 SPA。
- 不在本切片强制实现“未保存关闭确认/自动草稿保留跨会话”的高级策略（关闭即丢弃未保存本地草稿即可；完整页既有行为保持）。
- 不合并 World Info / Extensions / Persona 等到 Settings。
- 不把本会话已有的 welcome/shell 文案清理当作本 feature 的交付前提；实现时保留无关脏工作区。

## 边界规则 / 验收

R1: 在 `/` workspace 点击 shell **Settings**，URL 仍为 workspace 入口（不导航到 `/settings`），可见 Settings overlay（稳定选择器如 `[data-settings-overlay="true"]` 或等价 `role="dialog"` + Settings 内容），且 `main.settings-page` 内容可操作；不得出现 `#user-settings-block.openDrawer` 作为产品表面。

R2: 在 `/` 点击 **AI Config**，overlay 打开且初始 active tab 为 Providers；点击 **Formatting**，初始 active tab 为 Advanced；均不得整页离开 workspace。

R3: Overlay 关闭路径至少包括：显式关闭控件、`Escape`、以及再次点击当前 active 的 Settings/AI Config/Formatting shell 入口（与其它 panel toggle 语义一致）。关闭后 overlay 不可见，对应 shell 入口 `aria-pressed` 为 false，聊天 composer（如 `#send_textarea`）仍可达。

R4: Overlay 与完整页共用同一 Settings owner 行为：加载 `/api/settings/get`、按现有绑定保存 `/api/settings/save`、secret 不进 settings JSON、`settings_revision` 冲突时保留本地草稿并要求显式 reload（与现有完整页一致）。本切片不引入第二保存 API 或第二字段映射表。

R5: 直接访问 `/settings` 与 `/settings?tab=providers|advanced|general|ui`（合法 tab）仍进入完整 Settings 页；header 仍可返回 Workspace；缺 React page build 时仍 HTTP 503 重建说明，不回退 legacy drawer。

R6: Settings overlay 打开时，与其它 registry 面板的互斥策略明确且可测：打开 Settings 时不得把 shell 卡死；若实现为“Settings 为独立 overlay 层”，其它已打开 child slot 可不强制关闭，但必须有单一焦点陷阱与可关闭路径；若实现为“与 dock 互斥”，则打开 Settings 时清除其它 active panel 且不破坏其内部未提交表单的最小预期需在实现中固定一种并测试。**默认推荐**：Settings 使用独立 overlay 层，不占用 child-slot pin；打开时将 dock active 标到 settings 相关 panelKind，关闭时清除；不强制 unmount 其它 drawer 内容。

R7: 加载中 / 错误 / 空数据 / 成功保存状态在 overlay 内可见，失败不得清空整个 workspace chrome 或主聊天列表。

R8: 窄屏下 overlay 近似全屏可用；宽屏下为居中大面板或右侧大抽屉，均不产生顶栏水平滚动条回归，不遮死 shell 关闭路径。

R9: 相关 proof 与文档更新后，`page.settings` 描述“完整页 + workspace overlay 双挂载、单一 owner”；`page.chat_workspace` / `feature.next_workspace_shell` 描述 shell Settings/AI Config/Formatting 打开 overlay 而非整页跳转；`bun run docs:check` 通过。

## 架构 / 约束

- **同一 owner，两种 mount**：完整页继续由 `app/routes/settings.tsx` + React page app（`bun run build:react`）服务；workspace 内通过可复用 Settings surface（从现有 page 抽离或共享组件根）挂到 `workspace-panels` / shell 宿主。优先抽取共享 `SettingsSurface`（或等价）而不是复制 3000+ 行路由文件。
- **打开路径 owner**：`public/script.js` 的 shell chrome bridge（`openSettings` / `openAIConfig` / `openFormatting`）与 `app/workspace-panels.tsx` registry 协调；禁止重新 `location.assign` 到 `/settings` 作为日常 shell 主路径。
- **Dock 语义**：`panelKind` `settings` / `aiConfig` / `advancedFormatting` 可标记 active，但不恢复 legacy drawer content owner；pin 对 Settings 非必须（本切片可不提供 pin）。
- **样式**：复用 `app/styles/globals.css` 中 `.settings-page` 体系；overlay 容器需在 workspace 全局 z-index 下可用，遵循 `DESIGN.md` 的 surface/accent，不引入新设计语言。
- **兼容**：不得把 Settings 字段所有权交回 jQuery drawer；legacy toggle 若仍被点击，必须进入同一 overlay/route 策略。
- **边界**：不改变 Express 中间件顺序、CSRF、SecretManager、canonical settings document authority。
- **脏工作区**：实现不得回滚本会话无关的 welcome/shell 文案修改。

### UI 流程与 CTA

1. 主 CTA：shell 导航打开 overlay。
2. Overlay 内主 CTA：保存设置（沿用完整页 dirty/busy 规则）。
3. 次 CTA：关闭 overlay / 返回聊天；完整页保留“返回 Workspace”链接。
4. 状态：loading → ready；save success；validation/API error；revision conflict + reload。

### UI / 视觉约束

来源：同目录 `design-guidance.md`（Claude Code 指导性设计，2026-07-20）。实现须遵守设计者偏好：精简、优雅、统一；少字；结构引导优先于说明文案。

1. Overlay 形态为居中大面板（`<dialog>` 或等价 `role="dialog"`），宽屏 `min(92vw, 1180px)` × `min(92dvh, 880px)`；窄屏（< 640px）近似全屏，上偏移 `var(--topBarBlockSize)`，保证 shell 关闭路径可达。
2. Backdrop 使用 `--SmartThemeBlurTintColor` 约 72% 透明度 + 双倍 `--SmartThemeBlurStrength` 模糊（对齐现有 `#shadow_popup` 思路）；建议 z-index backdrop 4150、dialog 4200，高于 child-slot panels、低于 toast。
3. Overlay 内不渲染 `.settings-page-summary`；`.settings-workspace-link` 替换为关闭按钮（`×`，`aria-label="Close settings"`）。
4. Overlay header 展示当前 tab 名称（title 级约 1.05rem）而非重复 display 级 “Settings” 大标题。
5. `.settings-tabs-description` 在 overlay 内降为 aria-only 或不可见；active tab 仅靠既有 amber 边框/背景态表达。
6. Save bar 状态文案极短（如 Saved / Saving… / Error）；无状态徽章、无顶部 banner；次按钮弱化，Save 为主 CTA。
7. 入场约 200ms（opacity + 轻微 scale/translate），退场约 150ms；backdrop 仅 opacity；必须 `prefers-reduced-motion: reduce` 无动画。
8. Overlay 打开期间对应 shell nav `aria-pressed="true"` 与 `data-workspace-shell-panel-active="true"`；关闭清除，与其它 panel toggle 一致。
9. 表面处理遵循 DESIGN.md：`border-radius: 10px`、语义边框；避免 border + 超大软阴影的 ghost-card 堆叠，以及 ready 类状态徽章噪音。

## 数据 / 集成

- 输入：用户点击 shell 入口或访问 `/settings?tab=`；可选初始 tab id。
- 输出：overlay 可见状态、active tab、settings 文档读写（既有 API）。
- 存储：仍为既有 settings document / SecretManager；overlay open 状态仅当前 page session，不新增持久化 preference。
- 构建：若 Settings surface 进入 `workspace-panels` bundle，需保证 CSS/依赖可用；完整页 build 与 workspace-panels build 各自可证明。
- 向后兼容：书签 `/settings` 继续有效；扩展与其它 surface 不依赖 Settings 整页跳转。

## 验证

```bash
# 单元：打开路径与 registry 契约
bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js settings-react-route.test.js --runInBand

# 构建：完整页 + workspace panels（若 surface 进入 panels bundle）
bun run build:react
bun run build:react:workspace-panels

# E2E：shell 打开 overlay；完整页深链仍可用
bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js settings.e2e.js --workers=1

# 语义文档
bun run docs:check
```

手动检查（实现后）：

1. 登录后在 `/` 打开 Settings → 不换 URL 到 `/settings`，overlay 可编辑并关闭回聊天。
2. AI Config / Formatting 打开对应 tab。
3. 浏览器直达 `/settings?tab=providers` 仍是完整页。
4. 保存一条无害 UI 字段后关闭 overlay，workspace 仍可用。

完成证明：R1–R9 有对应 proof；shell 主路径无 `location.assign('/settings')`；docs check 绿。

## Doc ID 契约

| Doc ID | Owner 路径 | 代码绑定点 | 验证期望 |
|---|---|---|---|
| `page.settings` | `.docs/db/pages/settings.md` | `app/routes/settings.tsx`；共享 Settings surface；overlay host | 描述 sole owner + 完整页与 workspace overlay 双挂载；深链与 503 保留 |
| `page.chat_workspace` | `.docs/db/pages/chat-workspace.md` | `app/workspace-panels.tsx`、`public/script.js` shell bridge | shell Settings/AI Config/Formatting 打开 overlay，不整页跳转 |
| `feature.next_workspace_shell` | `.docs/db/features/next-workspace-shell.md` | shell navigation registry / dock | registry 条目打开 Settings overlay；active/close 语义 |
| `page.api_configuration` | `.docs/db/pages/api-configuration.md` | AI Config → providers tab | 历史 drawer 页说明改为 overlay/providers 入口（若文档仍写整页跳转则更新） |

既有 provider 相关 feature IDs（`feature.chat_completion_select`、`feature.custom_base_url`、`feature.fallback_provider`）字段行为不变；仅打开路径文档交叉引用更新，无需新 ID。

本切片不新增 Doc ID；以更新上述绑定为准。

## 参考资料

- `public/script.js`：`LEGACY_SETTINGS_DRAWER_ROUTE_TARGETS`、`getWorkspaceShellChromeBridge` 中 `openSettings` / `openAIConfig` / `openFormatting` 当前 `window.location.assign`
- `app/workspace-panels.tsx`：`workspaceShellNavigationEntries`、dock active/close
- `app/routes/settings.tsx`、`app/components/settings/*`、`app/lib/settings-helpers.js`、`app/styles/globals.css`
- `vite.config.ts`：login/settings page app vs `workspace-panels` lib build
- `.docs/db/pages/settings.md`、`.docs/db/pages/chat-workspace.md`、`.docs/db/features/next-workspace-shell.md`
- `.docs/tech/legacy-cutover-ledger.md`（Settings sole-owner 已退休 legacy product entries）
- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `.docs/specs/260716-07-react-settings-retirement/`、`.docs/specs/260716-13-react-workspace-shell-retirement/`
- `tests/workspace-shell-panel-navigation.e2e.js`（当前断言整页 `/settings`）
- `tests/react-workspace-panels-helpers.test.js`（源码契约含 `location.assign`）
- `tests/settings.e2e.js`（完整页 sole-owner）
- `DESIGN.md`：surface / accent / power-user dense UI
- `.docs/specs/260720-01-settings-workspace-overlay/design-guidance.md`：Settings overlay 指导性设计（形态、文案蒸馏、视觉与 shell 对齐）
- Inference：独立 overlay 层比恢复 legacy drawer 或强制把 Settings 塞进现有 right-drawer child slot 更贴合字段密度与 sole-owner 约束；完整页保留满足深链与 503 契约。
