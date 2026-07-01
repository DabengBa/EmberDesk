# Panel Dock And Drawer Coordination

## 意图与核心流程

本规格让 React shell 统一调度当前 `/` 工作区的面板入口、dock/drawer 状态和 fallback，覆盖 Character Library、World Info、Background Library、Extensions Host。目标是让这些已 React 化或半 React 化的区域不再像分散 islands，而是被同一个 shell 组织。

主路径：

1. React workspace chrome 已成为外层导航 owner。
2. 用户点击角色库、World Info、Backgrounds 或 Extensions 入口。
3. React shell 记录 active panel/dock state，并通过现有 panel bridge/facade 打开或刷新对应 panel。
4. 已 React owner 的 panel surface 正常显示；未满足条件或失败时回退到现有 legacy panel/facade。
5. 锁定/固定/移动端 drawer 状态保持可预测，不互相挤掉。

## 范围 / 不做范围

本次改变：

- React shell 拥有 panel entry priority、active panel state、dock/drawer open/close state。
- 复用 `mountWorkspacePanelHost`、panel action bridge 和现有 facades。
- 统一 panel loading/empty/error/success 状态显示规则。
- 覆盖 pinned/locked panel 同时存在时的布局规则。

不做：

- 不重写 World Info prompt activation、regex placement、converter/import/delete semantics。
- 不重写 Background file API、thumbnail lifecycle、slash background commands。
- 不替换 Extensions protected mount points 或 third-party protocol。
- 不改 character row identity selectors。

## 边界规则 / 验收

- 打开某个 panel 不得关闭用户已 pin/lock 的另一个 panel，除非当前产品语义明确要求。
- Flag off 或 bundle failed 时，面板入口仍能打开 legacy/facade path。
- Panel loading/error 显示在 panel 区域，不让整个工作区回到 global loading。
- Mobile/narrow viewport 下 panel 进入 sheet/bottom drawer 或单栏模式，不遮挡 composer。
- Character Library、World Info、Backgrounds、Extensions 每个入口都有 role/name 可达性。

状态覆盖：

- `disabled`: 对应 panel flag off 时走 legacy/fallback。
- `loading`: panel 本地 loading。
- `empty`: 无世界书、无背景、无 extension data 时显示下一步。
- `success`: active panel 与 shell 状态一致。
- `error`: panel action failed 时保留重试/返回。

## 架构 / 约束

- 复用 `public/scripts/workspace-panel-host-controller.js` 的 lifecycle helper。
- React shell 可新增 panel dock state helper，但必须与 `app/stores/workspace-panel-store.js` 对齐。
- Panel action dispatch 继续通过 `public/scripts/world-info.js`、`public/scripts/backgrounds.js`、`public/scripts/extensions.js` 等 compatibility facades。
- 不允许 React 组件直接清空 protected extension containers。

Checkpoint A:

- **目标结果**：React shell 统一组织已迁移 panel。
- **当前状态**：panel islands/facades 已存在，但入口和壳层组织仍分散。
- **假设**：action semantics 继续由 facades 拥有。
- **硬约束**：protected mount points 和 pinned 行为不回归。
- **风险**：panel 互相挤占、fallback 空 host、mobile 遮挡 composer。
- **推荐默认方案**：React owns dock state; facades own behavior.

## 数据 / 集成

- 输入：panel feature flags、panel readiness、legacy facade state、active drawer state。
- 输出：active panel state、dock visibility、panel local status。
- 存储：不新增持久状态；pin/lock 若已有存储则沿用。
- API：不新增 endpoint。

## 验证

```bash
bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js world-info-card-rendering.test.js character-list-structure.test.js --runInBand
bun run test:compat
bun run build:react:workspace-panels
```

需要新增或扩展浏览器验证：

```bash
bun run --cwd tests test:e2e -- chat-message-layout.e2e.js --workers=1
```

预期证据：

- 四类 panel entry 可达。
- pinned/locked panel 不被误关。
- panel fallback 不产生空 host。
- mobile 下 panel 不遮挡 composer。

## Doc ID 契约

- `page.chat_workspace`
- `feature.character_library_panel`
- `feature.world_info_panel`
- `feature.background_library_panel`
- `feature.extension_panel_open`
- `feature.next_workspace_shell`

Owner 分别为 `.docs/db/pages/chat-workspace.md` 和对应 `.docs/db/features/*.md`。实现后需更新 React shell dock owner state，并运行 `bun run docs:check`。

## 参考资料

- `.docs/tech/briefs/next-workspace-shell.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `public/scripts/workspace-panel-host-controller.js`
- `public/scripts/world-info.js`
- `public/scripts/backgrounds.js`
- `public/scripts/extensions.js`
- `tests/react-workspace-panels-helpers.test.js`
- Inference: panel dock 是第二个可见 takeover 面，因为这些 panels 已有 React/facade 基础，适合被 shell 统一调度。
