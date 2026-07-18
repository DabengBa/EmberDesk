# React Workspace Shell Legacy 退休

## 意图与核心流程

让当前 `/` workspace 的 chrome、navigation、panel lifecycle、dock/pin、layout 与 local status 全部由 React 独立拥有。用户进入 `/`，选择 Character Library、World Info、Backgrounds、Extensions、Settings、Group/Character Authoring 与 Main Chat，React shell 直接路由对应 owner，不再调用 legacy drawer adapter。

前置依赖：本 retirement program 的页面、panel、Extensions Host、Main Chat transport 与 renderer specs 已交付。

## 范围 / 不做范围

包括 root React shell sole owner、navigation registry、panel open/close/refocus/pin、layout/status/startup、legacy chrome/adapters/flags/bridge fallback 删除。

不建立 `/workspace-next`，不重写未迁移 child feature 内部行为，不改变 backend routes/storage/security 或用户工作流。

## 边界规则 / 验收

R1: `/` 必须始终启动 React shell；current context、primary navigation、chat canvas、composer/action rail、panel region 和 local status 由 React layout 管理，保持 desktop/mobile 可达。

R2: 所有已迁移 entries 必须直接打开对应 React page/panel owner；active/open/close/refocus/pinned/locked 与 keyboard/`aria-pressed` 语义保持，不调用 `openWorkspaceShellDrawer()`、`closeWorkspaceShellPanel()` 或 legacy DOM classes 作为事实来源。

R3: Settings 导航进入 `/settings`；Character Library、Authoring、World Info、Backgrounds、Extensions 与 Main Chat 使用直接 React registry/component lifecycle；first-open 不冻结 workspace。

R4: 仍未迁移且不在 ADR-0012 scope 的 child content 若必须保留，只能通过明确、受限、可访问的 React shell slot 挂载；它不得复制 navigation、drawer chrome、dock state 或 same-version shell fallback。

R5: extension mount slots、message/character selectors、events、aliases、slash/regex 与 internal bridge 非公开边界必须继续通过 compatibility baseline。Shell 删除不得让扩展入口不可达。

R6: startup loading/error/empty/local recovery、route auth redirects、panel failure isolation 和 mobile status/composer reachability保持；单个 panel 失败不得清空 shell 或 chat。

R7: `features.react.shell.takeover`、`strict`、remaining retired panel flags、`src/workspace-react-features.js` legacy payload、workspace panel dock compatibility snapshot、legacy shell chrome/markup/CSS、drawer adapters、flag/build/mount fallback 必须删除。

R8: React shell build 缺失由 release gate 阻止；发布版本不保留 legacy chrome。运行回滚只通过上一版本部署。

R9: startup/interaction performance 不得显著劣化；E2E 必须覆盖 navigation matrix、open-close-reopen/pin、mobile、panel failure、extension reachability、chat send/scroll 和 refresh persistence。

R10: `feature.next_workspace_shell`、`page.chat_workspace`、项目架构/roadmap/ledger/history 必须更新为 completed sole owner，docs check 通过。

## 架构 / 约束

- 复用现有 React registry、Zustand ephemeral panel store、TanStack Router/Query；删除 compatibility snapshots 后不新增第二 registry。
- panel lifecycle 由 React component/router state 驱动；DOM class 只作为呈现，不是 authority。
- child slot 只用于明确不在本 program 的内容，且必须有 owner 文档。
- `globalThis.SillyTavern` 等 public contracts 由 replacement providers 提供，不由 internal bridge 替代。
- server 仍以 `public/index.html`/React assets 提供同一 `/` entry；不引入 SSR/新 framework。

## 数据 / 集成

- dock/open/pin state 继续只在当前 page session，除非已有用户 preference 明确持久化。
- 不改变 chat/settings/character/world/background/extension data authority。
- shell registry entries 使用 stable keys，与 semantic docs 和 tests 对齐。

## 验证

```bash
bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js react-state-stores.test.js global-compatibility-bridge.test.js workspace-react-panel-flags.test.js chat-workspace-structure.test.js --runInBand
bun run test:compat
bun run build:react:workspace-panels
bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js chat-message-list-walkthrough.e2e.js third-party-extension-runtime.e2e.js --workers=1
bun run perf:interaction
bun run docs:check
```

## Doc ID 契约

- `feature.next_workspace_shell`：root shell/chrome/navigation/panel lifecycle sole owner。
- `page.chat_workspace`：same `/` entry、chat/panel integration、states 与 recovery。
- 各 panel/page Doc ID：只更新 shell entry binding，不改变其内部 owner contract。

## 参考资料

- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `.docs/tech/workspace-shell-panel-dock-coordination.md`
- `src/workspace-react-features.js`
- `public/script.js`
- `app/workspace-panels.tsx`
- `app/stores/workspace-panel-store.js`
- `tests/workspace-shell-panel-navigation.e2e.js`
- Inference：受限 child slot 可避免把未迁移 feature 强行纳入本 program，同时允许删除 legacy shell/chrome owner。
