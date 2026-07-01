# React Workspace Chrome

## 意图与核心流程

本规格让 React 在当前 `/` 工作区内接管外层 workspace chrome：全局顶部状态、当前角色/聊天上下文摘要、主要导航入口和 shell-level recovery/status 区域。用户仍使用同一个 `/`，但开始看到统一的新工作区外壳。

主路径：

1. Same-entry shell takeover foundation 判断 React chrome 可挂载。
2. React chrome host 挂载到当前工作区外层安全容器，不清空 protected message、extension、character-list DOM。
3. React chrome 展示当前角色/聊天摘要、主要 panel entry points、settings 入口和局部状态区。
4. Chrome actions 通过现有 facades 或现有 DOM/action bridge 触发，不直接重写高风险业务逻辑。
5. 挂载失败时回退到当前 legacy chrome。

## 范围 / 不做范围

本次改变：

- React 接管 workspace 外层 chrome 的可见呈现。
- 统一主导航入口：Character Library、World Info、Backgrounds、Extensions、Settings。
- 增加 shell-level loading/error/status area，但 secondary panel loading 不阻塞整个 workspace。
- 遵循 `DESIGN.md` 的暗色、紧凑、功能密度和 blur/tint 规则。

不做：

- 不移动 `#chat > .mes` row 结构。
- 不替换 `#send_textarea` / `#send_but` 之外已经由 main-chat React owner 管理的 composer 行为。
- 不删除 legacy top bar DOM，除非该 DOM 已被证明只剩 rollback/compat 价值并保留 fallback。
- 不更改扩展 mount points。

## 边界规则 / 验收

- 用户打开 `/` 后看到新的 React chrome，而不是旧 chrome 与新 chrome 同时竞争主导航。
- 当前角色/聊天摘要在无角色、临时聊天、普通角色聊天下都有可解释状态。
- Settings、角色库、World Info、Backgrounds、Extensions 入口可通过 role/name 测试定位。
- React chrome 不遮挡聊天正文或 composer。
- Feature flag 关闭或 mount failed 时 legacy chrome 可用。

状态覆盖：

- `loading`: chrome 可显示局部加载，但不得延迟 startup overlay 到 secondary panels 全部完成。
- `empty`: 无当前角色/聊天时显示打开角色库或继续聊天的明确入口。
- `success`: 显示稳定导航和上下文摘要。
- `error`: 显示局部错误并保留 legacy fallback。

## 架构 / 约束

- React chrome 应在 `app/workspace-panels.tsx` 或新的 workspace shell bundle 中复用现有 QueryClient / store 模式。实现可选择拆出 `app/components/workspace-shell/*`。
- 不新增 UI library；样式使用现有 CSS variables、`app/styles/tokens.css`、`app/styles/globals.css` 或局部 CSS。
- 与 legacy action 的桥接必须显式封装，不能在 React 组件中散落 raw jQuery selectors。
- Chrome 只接管外层组织，不接管 slash parser、regex engine、provider transport。

Checkpoint A:

- **目标结果**：用户在 `/` 看到统一的新 React workspace chrome。
- **当前状态**：内部 React panels 已存在，外层 chrome 仍 legacy。
- **假设**：主导航可先接管，业务动作仍走 facades。
- **硬约束**：不破坏 protected DOM 和扩展挂载。
- **风险**：双 chrome 同屏、入口重复、状态不同步。
- **推荐默认方案**：React chrome owning display，legacy chrome hidden/rollback。

## 数据 / 集成

- 输入：当前角色、聊天标题、panel readiness、feature flags、settings route availability。
- 输出：React chrome DOM、上下文摘要、导航 action dispatch。
- 存储：不新增用户偏好。
- API：不新增 API；复用已有 workspace state 和 bridge。

## 验证

```bash
bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js chat-workspace-structure.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-layout.e2e.js --workers=1
bun run test:compat
bun run build:react:workspace-panels
```

新增/扩展测试应证明：

- React chrome flag on 时只有一个主导航 owner。
- flag off / mount failed 时 legacy chrome 仍可见。
- desktop/mobile 不遮挡 chat/composer。
- 主要入口 role/name 可达。

## Doc ID 契约

- `page.chat_workspace`
  - Owner: `.docs/db/pages/chat-workspace.md`
  - 绑定点：workspace chrome owner state、导航结构、fallback。
  - 验证：`bun run docs:check`

- `feature.next_workspace_shell`
  - Owner: 需要新增 `.docs/db/features/next-workspace-shell.md`
  - 绑定点：同入口 React chrome takeover。
  - 验证：`bun run docs:check`

## 参考资料

- `.docs/tech/briefs/next-workspace-shell.md`
- `DESIGN.md`
- `.docs/db/pages/chat-workspace.md`
- `app/workspace-panels.tsx`
- `app/styles/tokens.css`
- `public/script.js`
- `tests/chat-workspace-structure.test.js`
- Inference: chrome 是第一个可见 takeover 面，因为它能统一体验但不需要先移动高风险 message/extension DOM。
