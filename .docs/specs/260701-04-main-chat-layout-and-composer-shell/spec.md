# Main Chat Layout And Composer Shell

## 意图与核心流程

本规格让 React shell 统一当前 `/` 的主聊天布局、composer/action rail 和局部 generation/recovery status placement。它不重写 provider transport 或 slash executor，而是把已有 React main-chat owner surface 放进同一个现代化 shell 布局。

主路径：

1. React workspace chrome 和 panel dock 已可用。
2. React shell 认领 chat canvas 外层布局：消息区域、load-more 区域、composer/action rail、generation/recovery status。
3. 已由 React owner 的 visible composer、slash UI、safe row/action/rich-body surfaces 保持现有 owner。
4. Excluded rows、editing/streaming/extension-mutated rows、non-OpenAI/group/dry-run/nested/quiet/background paths 继续 fail-closed 到 documented legacy facades。
5. 挂载失败时回退现有 main-chat legacy/open result。

## 范围 / 不做范围

本次改变：

- React shell 接管 chat canvas 的外层空间组织。
- Composer/action rail 在 desktop/mobile 下位置稳定，不被 panel dock 遮挡。
- Generation status、auto recovery、manual retry、stop/continue 等可见状态集中到局部 status 区。
- Long-chat load-more、reading-position restore 和 row lifecycle markers 保持可诊断。

不做：

- 不重写 `Generate()` 的 excluded compatibility routing。
- 不重写 `StreamingProcessor` 或全部 provider transport。
- 不改变 slash parser/registry/executor exports。
- 不改变 `.mes[mesid]`、`.mes_text`、`.mes_buttons` protected row contract。
- 不新增第二套 Markdown/rich-body renderer。

## 边界规则 / 验收

- Desktop 下 chat canvas 与 composer 是主视觉焦点，panel dock 不遮挡正文或输入。
- Mobile 下 composer、stop/retry、message actions、load-more 可达，不依赖 hover。
- Safe finalized rows 继续可由 React rich-body/action/composer surfaces 拥有。
- Editing、streaming、unsafe、extension-mutated rows 继续显式 fallback，不被 shell layout 强行包裹导致结构变化。
- Non-OpenAI/group/dry-run/nested/quiet/background generation paths 不被误标为 React visible transport owner。
- `#chat > .mes` direct child contract 和 `#show_more_messages` 顺序不回归。

状态覆盖：

- `loading`: chat opening 或 row snapshots 未就绪时显示局部状态。
- `empty`: 无聊天时显示打开角色/开始聊天 CTA。
- `success`: rows/composer/status 稳定展示。
- `error`: generation failure 显示局部恢复动作。

## 架构 / 约束

- 复用 `features.react.panels.mainChatMessageList` 和 `app/workspace-panels.tsx` 现有 main-chat schemas/actions。
- 若新增 shell layout wrapper，必须保持 protected row direct-child contract 或通过测试证明 wrapper 不改变 selector 语义。
- Composer shell 可复用现有 TanStack Form + Zod owner，不再新建表单 owner。
- Status placement 应复用现有 generation-control / visible-transport markers。

Checkpoint A:

- **目标结果**：聊天区从视觉和布局上进入 React shell 统一组织。
- **当前状态**：main-chat 多个内部 surface 已 React-owned，但外层布局仍 legacy。
- **假设**：外层布局可先接管，excluded behavior 继续 fallback。
- **硬约束**：message row DOM 和 extension mutation fail-closed 不破坏。
- **风险**：layout wrapper 破坏 selectors；status 双显示；mobile controls 不可达。
- **推荐默认方案**：React owns layout/status placement; existing main-chat owners keep behavior.

## 数据 / 集成

- 输入：main-chat observation store、message row snapshots、composer state、generation control state、visible transport decision。
- 输出：chat canvas layout、composer/action rail placement、status/recovery region。
- 存储：不新增存储。
- API：不新增 endpoint。

## 验证

```bash
bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js chat-workspace-structure.test.js main-chat-visible-transport-owner.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-streaming.e2e.js --workers=1
bun run test:compat
bun run build:react:workspace-panels
```

预期证据：

- row structure 未改变。
- composer/action rail desktop/mobile 可达。
- supported visible transport 仍由 React owner 接管。
- excluded paths 仍发布 legacy/fallback decision。

## Doc ID 契约

- `page.chat_workspace`
- `feature.chat_message_rendering`
- `feature.chat_message_actions`
- `feature.chat_generation_auto_recovery`
- `feature.next_workspace_shell`

实现后需更新主聊天 shell owner state、composer/status placement 和 fallback 说明，并运行 `bun run docs:check`。

## 参考资料

- `.docs/tech/briefs/next-workspace-shell.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/tech/main-chat-generation-lifecycle.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `app/workspace-panels.tsx`
- `public/script.js`
- `public/scripts/main-chat-visible-transport-owner.js`
- `tests/chat-message-rendering.e2e.js`
- Inference: main-chat layout 应晚于 chrome/panel dock，因为它碰到最高风险 message row 和 transport compatibility。
