# React Extensions Host Legacy 退休

## 意图与核心流程

让 React Extensions Host 成为同入口扩展生命周期的唯一 owner，同时继续承载现有扩展内容。用户打开 Extensions，看到 local loading/error/retry，管理安装与更新，配置 Extras；第三方扩展挂载到 React 提供的稳定 slots，并继续使用 public imports/events/slash/regex。

前置依赖：`react-compatibility-contract-baseline` 已交付并可作为删除 gate。

## 范围 / 不做范围

包括 React host/mount slots、extension services、discovery/activation/injection、settings、Manage/Install、operation safety feedback、Extras、public compatibility barrel、legacy host/flag/fallback 删除。

不重写第三方扩展自身 Vue/jQuery UI，不改变 manifest、filesystem/Git authority、extension endpoints success shape 或 extension settings document。

## 边界规则 / 验收

R1: React Host 必须独立拥有 deferred load、discovery、dependency ordering、activation/deactivation、script/style injection、local loading/error/retry 和 lifecycle cleanup；打开 Extensions 不得阻塞 chat。

R2: React 必须直接渲染并管理 `#extensions_settings`、`#extensions_settings2`、`#regex_container`、`#extensionsMenuButton`、`#extensionsMenu` 或文档化等价 slots。现有扩展 mount 内容、顺序、focus 与 teardown 必须保持，slots 不得依赖 legacy drawer。

R3: notify updates、Manage、Install、update、branch switch、move、delete 与 enable/disable 必须通过 extension services 执行，保留 retryable/user-action-required/forbidden/invalid feedback 和 dirty/detached/collision protections。

R4: Extras API URL/key/autoconnect/connect、secret handling、connection status 和 startup autoconnect 行为必须保持；失败只影响 Extensions surface。

R5: JS-Slash-Runner、Regex Manager 与 Quick Reply representative paths 必须挂载并运行；`@sillytavern/*` aliases、`globalThis.SillyTavern`、events、slash exports 和 regex placements 保持 compatibility baseline。

R6: `public/scripts/extensions.js` 若保留 `@sillytavern/scripts/extensions` contract，只能是薄 public barrel/service API；不得拥有 drawer DOM、jQuery control binding、React bridge snapshot 或第二 lifecycle state。

R7: legacy extension drawer host/templates（兼容 slots 本身除外）、hidden host、panel flag、mount/build fallback 与 legacy-only control handlers 必须删除。React bundle/build 是发布必需产物。

R8: extension operation 不得自动 reset/clean 用户 worktree；filesystem/Git discovery 继续是 runtime authority，canonical settings 继续拥有 `extension_settings`。

R9: unit/compat/E2E 必须覆盖 first open、deferred success/failure/retry、JS-Slash-Runner mount/events/slash/regex、Manage/Install/operation failures、Extras、reload 和 mobile；semantic docs 更新。

## 架构 / 约束

- 将 extension discovery/lifecycle、operations、Extras 分成已有职责对应的 framework-neutral services；不建立通用 plugin framework。
- React Host 渲染兼容 slots 并通过 TanStack Query/Mutation 管理 host state。
- third-party extension 内容可以继续使用自身框架；React 不重渲染其内部 DOM。
- 保持 middleware、endpoint、path/security guards 和 operation safety。
- public barrel 只保留 documented exports。

## 数据 / 集成

- extension manifests、installed directories、Git repos、`extension_settings`、Extras secret 与 endpoint payload 保持。
- React host 只持有可序列化 lifecycle/status；extension instances 与 DOM nodes 由 host lifecycle manager 管理。
- operation errors 使用现有 structured failure envelope。

## 验证

```bash
bun run --cwd tests test:unit -- extension-operation-safety.test.js extension-repo-update-state.test.js react-workspace-panels-helpers.test.js global-compatibility-bridge.test.js --runInBand
bun run test:compat
bun run build:react:workspace-panels
bun run --cwd tests test:e2e -- third-party-extension-runtime.e2e.js workspace-shell-panel-navigation.e2e.js extensions-host.e2e.js --workers=1
bun run docs:check
```

## Doc ID 契约

- `feature.extension_panel_open`：完整 host lifecycle、mount、operations、Extras 与 sole owner。
- `term.shared_browser_library`：public imports/globals behavior。
- `page.chat_workspace`：same-entry open、local failure 和 extension reachability。

## 参考资料

- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `public/scripts/extensions.js`
- `src/extension-operation-safety.js`
- `public/scripts/extensions/third-party/JS-Slash-Runner/src/index.ts`
- `tests/third-party-extension-compatibility.test.js`
- Inference：由 React host 创建稳定 mount slots，可删除旧 drawer implementation，同时允许第三方扩展保留自身框架与 DOM。
