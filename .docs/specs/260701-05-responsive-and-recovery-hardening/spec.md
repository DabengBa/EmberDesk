# Responsive And Recovery Hardening

## 意图与核心流程

本规格在 React shell 已接管 chrome、panel dock 和 main-chat shell 后，集中补齐 desktop/mobile 响应式行为、局部 loading/empty/error 状态、恢复 CTA 和 fallback 体验，确保用户看到的是稳定的新工作区，而不是多个已接管区域的拼接。

主路径：

1. 用户在 desktop、tablet、phone viewport 打开当前 `/`。
2. React shell 根据 viewport 和手动操作决定 panel dock、drawer、composer、chat canvas 的布局。
3. 任一 panel/chat/chrome 局部失败时，仅该区域显示恢复，不让整个 workspace 失效。
4. 用户手动打开/关闭/pin 的状态在同一页面会话内被尊重。

## 范围 / 不做范围

本次改变：

- 统一 desktop/mobile breakpoints 下 panel dock、drawer、composer 和 chat canvas 的行为。
- 统一 loading/empty/error/success UI vocabulary。
- 统一 fallback CTA 文案和恢复路径。
- 增加 browser proof，覆盖窄屏、宽屏、失败和恢复。

不做：

- 不新增长期偏好存储，除非已有设置可复用。
- 不默认启用 React shell owner。
- 不删除 legacy fallback。
- 不扩大 provider/extension/slash/regex 行为范围。

## 边界规则 / 验收

- Desktop 默认可同时阅读 chat、使用 composer、查看必要 panel status；dock 不遮挡内容。
- Mobile 默认 chat/composer 优先，panel 以折叠/sheet/drawer 方式进入，不默认占满主区域。
- 用户手动打开 panel 后，导航或状态刷新不得立即关闭它。
- 每个局部 error 都有 retry、close、return-to-legacy 或 equivalent recovery。
- Loading skeleton/placeholder 不造成布局大跳动。
- 无当前角色、无聊天、无 panel data 的 empty states 都有下一步入口。

## 架构 / 约束

- 响应式逻辑优先在 React shell 层实现，不在多个 panel 内重复各自判断。
- CSS 必须遵循 `DESIGN.md`：紧凑 spacing、可缩放字号、用户可配置 blur/shadow。
- Browser tests 应覆盖至少一个 desktop 和一个 mobile viewport。
- 任何 layout wrapper 不得破坏 protected selectors。

Checkpoint A:

- **目标结果**：接管后的工作区在不同 viewport 和失败状态下稳定。
- **当前状态**：多个 owner surface 已可工作，但整体响应式/恢复体验需要统一。
- **假设**：状态统一不需要新业务 API。
- **硬约束**：不遮挡 composer，不破坏 protected DOM。
- **风险**：移动端默认展开太多；loading/error 变成全局阻塞。
- **推荐默认方案**：chat-first mobile, dock-aware desktop, local recovery.

## 数据 / 集成

- 输入：viewport、manual open/close state、panel/chat/chrome local statuses。
- 输出：responsive layout state、local recovery UI。
- 存储：仅同页面 session state；不新增持久 preference。
- API：不新增 endpoint。

## 验证

```bash
bun run --cwd tests test:e2e -- chat-message-layout.e2e.js chat-message-rendering.e2e.js --workers=1
bun run --cwd tests test:unit -- chat-workspace-structure.test.js react-workspace-panels-helpers.test.js --runInBand
bun run test:compat
bun run build:react:workspace-panels
```

预期证据：

- Desktop/mobile 截图或 Playwright assertions 覆盖 chat/composer/panel reachability。
- 局部 error/fallback 不阻塞整个 workspace。
- 手动展开/折叠状态在一次交互后被尊重。

## Doc ID 契约

- `page.chat_workspace`
- `feature.startup_bootstrap`
- `feature.next_workspace_shell`
- `feature.chat_message_actions`

实现后需更新响应式、局部恢复和 fallback 状态语义，并运行 `bun run docs:check`。

## 参考资料

- `.docs/tech/briefs/next-workspace-shell.md`
- `DESIGN.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/startup-bootstrap.md`
- `tests/chat-message-layout.e2e.js`
- `tests/chat-message-rendering.e2e.js`
- Inference: 响应式和恢复应作为独立 hardening 阶段，避免在每个 takeover step 内重复做半套规则。
