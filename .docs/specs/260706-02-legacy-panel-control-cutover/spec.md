# Legacy Panel Control Cutover

## 意图与核心流程

本规格把仍由 legacy button 独立控制的 workspace 面板纳入 React shell/dock 控制面，使它们先成为新架构中的一等 panel entry，再保留内部 legacy 内容。

主路径是：用户从 React shell 打开 `AI Config`、`Advanced Formatting`、`User Settings`、`Group Chats` 或其他 legacy drawer；shell 通过 registry adapter 控制打开/关闭/active 状态；legacy 内容仍在原 DOM 内运行。

## 范围 / 不做范围

本次做：

- 将 `AI Config`、`Advanced Formatting`、`User Settings`、`Group Chats` 纳入 registry/dock active 状态。
- 为这些 legacy-hosted panels 提供一致的 open/close/toggle、active marker、status copy 和 failure handling。
- 保留原 drawer 内容和 jQuery handlers，只把“谁控制打开和状态”迁移到 registry。
- Settings 在 React route 可用时继续走 `/settings`；不可用时作为 `User Settings` legacy drawer panel 进入 registry fallback。
- 增加 E2E 覆盖：每个新纳入面板打开、关闭、再打开、与已有 panels 交叉切换。

本次不做：

- 不重写 AI provider form、formatting controls、user settings 内容。
- 不迁移 Settings route 内部字段。
- 不改变 provider secret、CSRF、安全设置或 API endpoint 行为。

## 边界规则 / 验收

- 每个 legacy-hosted panel 从 shell 打开后，React shell 必须显示 active panel 和 local status。
- 点击同一个 legacy-hosted panel 必须关闭；再次点击必须重新打开。
- 打开 legacy-hosted panel 不得关闭 pinned protected drawer，除非 legacy 原行为本来允许。
- Settings route flag on/off 都必须可用：flag on 打开 route，flag off 打开 user settings drawer。
- 打开 AI Config 不得改变当前 provider secret value、custom base URL、connection profile 或 API key placeholder。
- 打开 Advanced Formatting 不得改变 prompt、formatting 或 token settings。
- 打开 Group Chats 不得改变 selected group、group member list 或 character list selector contracts。

## 架构 / 约束

- 本规格依赖 `260706-01-workspace-panel-owner-registry` 完成。
- `public/script.js` 中原 legacy button handlers 保留为 fallback 和直接用户路径，但 shell path 不再通过 `.trigger('click')` 作为 primary 控制方式。
- 不得重排 Express/private endpoints 或 settings storage。
- 不得修改 protected extension surfaces。
- 所有 user-facing 文案和 role/name 入口必须从 React shell 可达。

## 数据 / 集成

- 不新增 API。
- 不新增持久 schema。
- 读取现有 DOM/drawer 状态作为 compatibility snapshot。
- 允许为 registry adapter 增加纯 helper，但不得把 legacy form data 复制到第二套 React state。

## 验证

- `bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js chat-workspace-structure.test.js --runInBand`
- `bun run build:react:workspace-panels`
- `bun run test:compat`
- 新增或扩展 Playwright E2E：覆盖 AI Config、Advanced Formatting、User Settings fallback、Group Chats 的 open/close/reopen/cross-panel switching。
- 手动验证 provider/settings fields 在打开/关闭过程中不丢值。

## Doc ID 契约

- `feature.next_workspace_shell.primary_navigation`：补充 legacy-hosted panel control 规则。
- `page.api_configuration`：如果 AI Config 的用户可见入口/状态说明改变，需要更新 owner `.docs/db/pages/api-configuration.md`。
- `page.settings`：如果 Settings fallback 行为说明改变，需要更新 owner `.docs/db/pages/settings.md`。
- `page.chat_workspace`：记录 legacy-hosted panel control state。

## 参考资料

- `.docs/db/features/next-workspace-shell.md`
- `.docs/db/pages/api-configuration.md`
- `.docs/db/pages/settings.md`
- `.docs/db/pages/chat-workspace.md`
- `public/script.js`
- `app/workspace-panels.tsx`
- `.docs/tech/frontend-jquery-slice-migration.md`
- Inference: 先迁移控制面可减少状态机问题，同时避免一次性重写高风险表单。
