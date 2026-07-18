# React Workspace Shell Legacy 退休

## 意图与核心流程

让当前 `/` workspace 的 chrome、navigation、panel lifecycle、dock/pin、layout 与 local status 全部由 React 独立拥有。用户进入 `/`，选择 Character Library、World Info、Backgrounds、Extensions、Settings、Group/Character Authoring 与 Main Chat，React shell 直接路由对应 owner，不再以 legacy drawer adapter 或 legacy DOM class 作为 shell 状态事实来源。

当前 migration boundary 已确认：部分已迁移 panel 的可见 React owner 仍依赖旧 DOM 作为内容、selector 或 extension mount 容器。该 DOM 可以作为受限 child slot 保留，但不得重新取得 shell navigation、open/close/refocus、dock/pin、layout 或 local-status ownership。

前置依赖：本 retirement program 的页面、panel、Extensions Host、Main Chat transport 与 renderer specs 已交付。

## 范围 / 不做范围

包括 root React shell sole owner、navigation registry、panel open/close/refocus/pin、layout/status/startup、受限 child slot contract，以及完成 slot proof 后的 legacy chrome/adapters/flags/bridge fallback 删除。

不建立 `/workspace-next`，不重写未迁移 child feature 内部行为，不改变 backend routes/storage/security 或用户工作流。未通过 child-slot contract 的 legacy drawer / hidden host 不得作为本 feature 的完成前提被删除。

## 边界规则 / 验收

R1: `/` 必须始终启动 React shell；current context、primary navigation、chat canvas、composer/action rail、panel region 和 local status 由 React layout 管理，保持 desktop/mobile 可达。

R2: 所有已迁移 entries 必须由 React registry 直接选择对应 React page/panel owner 或显式 child slot；active/open/close/refocus/pinned/locked 与 keyboard/`aria-pressed` 语义保持。`openWorkspaceShellDrawer()`、`closeWorkspaceShellPanel()` 及 legacy DOM classes 不得作为 shell state 的事实来源；它们仅可在已声明 slot 内作为 feature-local compatibility capability 使用。

R3: Settings 导航进入 `/settings`；Character Library、Authoring、World Info、Backgrounds、Extensions 与 Main Chat 使用直接 React registry/component lifecycle；first-open 不冻结 workspace。

R4: 仍需 legacy DOM 的 child content 必须通过 registry 中明确、受限、可访问的 React shell slot 挂载，并记录稳定 key、mount target、可访问名称、content owner、允许的 compatibility capability 与验收 test。允许的初始 slots 为 Character Library、World Info、Backgrounds、Extensions、Group Authoring、Character Authoring，以及 Main Chat 的 `#chat`、`#send_form`、`#nonQRFormItems` content regions；Settings 继续使用 `/settings` 路由。slot 不得复制 navigation、drawer chrome、dock state、same-version shell fallback，亦不得以 drawer open/pinned classes 向 shell 回写 authority。

R5: extension mount slots、message/character selectors、events、aliases、slash/regex 与 internal bridge 非公开边界必须继续通过 compatibility baseline。Shell 删除不得让扩展入口不可达。

R6: startup loading/error/empty/local recovery、route auth redirects、panel failure isolation 和 mobile status/composer reachability保持；单个 panel 失败不得清空 shell 或 chat。

R7: `features.react.shell.takeover`、`strict`、legacy workspace-feature bootstrap payload、workspace-panel dock compatibility snapshot、legacy shell chrome/markup/CSS、shell drawer adapters与 flag/build/mount fallback 必须在所有 R4 slot 已通过独立 mount、open/close/reopen/pin、mobile、failure-isolation 与 extension-reachability proof 后删除。feature-local compatibility capability 和受保护 extension mount DOM 不属于该删除项，除非其 own feature 已有已批准 replacement。

R8: React shell build 缺失由 release gate 阻止；在 R7 deletion gate 满足后，发布版本不保留 legacy chrome。运行回滚只通过上一版本部署，不通过 flag-off、mount failure 或 legacy shell fallback。

R9: startup/interaction performance 不得显著劣化；E2E 必须覆盖 navigation matrix、open-close-reopen/pin、mobile、panel failure、extension reachability、chat send/scroll 和 refresh persistence。

R10: `feature.next_workspace_shell`、`page.chat_workspace`、项目架构/roadmap/ledger/history 必须更新为 completed sole owner，docs check 通过。

## 架构 / 约束

- 复用现有 React registry、Zustand ephemeral panel store、TanStack Router/Query；删除 compatibility snapshots 后不新增第二 registry。
- panel lifecycle 由 React component/router state 驱动；DOM class 只作为 slot 内 content 呈现或 feature-local compatibility signal，不是 shell authority。
- child slot 只用于明确不在本 program 的 content internals，且必须有 owner 文档、stable key、mount target、allowed capability 与 focused proof。
- shell 可调用明确 capability（例如 refresh、select、open a documented child editor），但 capability 不得执行或观察 drawer lifecycle；shell lifecycle 只由 React registry/store 读写。
- `globalThis.SillyTavern` 等 public contracts 由 replacement providers 提供，不由 internal bridge 替代。
- server 仍以 `public/index.html`/React assets 提供同一 `/` entry；不引入 SSR/新 framework。

## 数据 / 集成

- dock/open/pin state 继续只在当前 page session，除非已有用户 preference 明确持久化；slot 的 legacy `pinnedOpen` / `openDrawer` class 不得覆盖 React store。
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

- `feature.next_workspace_shell`：root shell/chrome/navigation/panel lifecycle sole owner，以及受限 child-slot contract。
- `page.chat_workspace`：same `/` entry、chat/panel integration、states、recovery 与 main-chat content slot。
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
