# 扩展系统整体退役计划（Extension System Retirement Plan）

> 交付给执行开发的任务文档。目标：**完整剔除外部扩展支持**；剩余内置扩展转为固定功能；拆除为此保留的兼容层，为现代化改造解锁 DOM 契约/启动管线/React 面板面。
>
> 本计划与既有退役批次共用同一工作流：**`.docs/tech/feature-retirement-workflow.md`**（R0 收口判定 → R1 引用图谱 → R2 分层删除 → R3 存量归一化 → R4 测试翻转 → R5 门禁 → R6 台账+提交）。每批独立提交、独立台账条目。

## 0. 与既有计划的关系（红线变更）

`.docs/tech/non-core-feature-retirement-plan.md` 中的以下红线由本计划**显式覆盖**（产品所有者已拍板，2026-09-24）：

| 旧红线 | 新裁决 |
|---|---|
| 不动 `public/scripts/extensions/third-party/`（JS-Slash-Runner vendored 源） | **整目录删除**，含 fixtures fetch 脚本与 `.gitignore` 条目 |
| 保留 `@sillytavern/*` 导入面 | **不再保留**。内部代码本就走相对/直接 import；别名只为第三方存在 |
| `st-context`/`eventSource`/`globalThis.SillyTavern` 为冻结扩展契约 | **降级为内部 API**：`globalThis.SillyTavern.getContext` 继续挂载（~40 处 e2e 与调试依赖），但不再是扩展契约；`st-context` 中只为第三方暴露的导出（`ScraperManager`、`openThirdPartyExtensionMenu`、`getExtensionManifest`、`renderExtensionTemplate*`、`ModuleWorkerWrapper` 等）随批移除 |
| `/qr*` slash 命令留 stub | **stub 全删**；仅 `/qr-arg`（`arg::` 作用域宏）收编为正式 STscript 命令——内部脚本与 `MacroSlashCommands.e2e.js` 依赖它 |

## 1. 产品裁决（已确认）

| 问题 | 裁决 |
|---|---|
| regex 面板归宿 | **独立 workspace panel**（新增 `regex` panel kind，React `RegexSettingsPanel` 直挂） |
| token-counter | **直接退役**（`getTokenCount` 等内部能力不受影响） |
| `window.SillyTavern.getContext` | **保留为内部 API**，不再声明为扩展契约 |
| `extension_settings` 数据袋 | **改名归位**为 `feature_settings`，持久化键 `settings.extension_settings` → `settings.feature_settings` 惰性迁移 |

## 2. R0 已证实事实（可直接引用）

- **活内置仅 3 个**：`connection-manager`（1163 行，挂 `#rm_api_block` 顶部——index.html 静态抽屉，直挂时序安全）、`regex`（2150 行，React 面板已存在于 `app/components/regex/`，经 `mountRegexSettings` 挂 `#regex_container`）、`token-counter`（118 行，仅魔杖菜单按钮）。`quick-reply` 已是 123 行退役 stub。
- **`extension_settings` 是功能数据袋**而非扩展配置：`variables.global`（STscript 全局变量）、`note`（作者注释）、`connectionManager.profiles`、`regex`/`regex_presets`、`sd`、`character_allowed_regex`/`preset_allowed_regex` 等。持久化为 `settings.extension_settings`（`script.js:8206` `Object.assign`）。内部消费者：`variables.js`、`personas.js`、`slash-commands.js`、`generation-service.js`、`character-lifecycle-service.js`、`MacroAutoCompleteHelper`、`SlashCommandCommonEnumsProvider`、regex engine、connection-manager。
- **Extras API 已空转**：`modules`/`connectedToApi`/`doExtrasFetch`/`getExtrasConnectionStatus` 无内部消费者，只剩 Extensions 面板 UI。
- **服务端足迹**：`src/endpoints/extensions.js` 8 条路由（install/update/branches/switch/move/version/delete/discover，~750 行）+ `users.js:526` `/scripts/extensions/third-party/*` 静态服务 + `request.user.directories.extensions` 用户目录扫描 + `extensions.enabled`/`extensions.autoUpdate`/`extensions.models.autoDownload` 配置键 + `src/endpoints/settings.js` 的 `enable_extensions`/`enable_extensions_auto_update` 输出字段。
- **React 桥接足迹**：`extension-host-service.js`/`extension-host-domain.js`/`extension-compatibility-slots.js`（~1300 行）+ `ExtensionsHostWorkspacePanel`（workspace-panels.tsx）+ script.js ~48 处桥接（`mountReactExtensionsHostPanel`、bridge state/commands、`initReactExtensionsHostBridge`、deferred bootstrap、`extensionsHostControlsDisabled`）+ `global-compatibility-bridge.js` 的 `extensionsHost` kind。
- **内部 load-bearing 导出**（迁移而非删除）：`saveMetadataDebounced`（personas/variables/slash-commands 用，存 chat/character metadata）、`writeExtensionField`/`writeExtensionFieldBulk`/`UNSET_VALUE`（regex engine 写 `data.extensions.regex_scripts`）、`renderExtensionTemplate(Async)`（内置功能模板渲染）、`getContext`（world-info/slash-commands/utils 从 extensions.js 导入——改指 `st-context.js`）。
- **纯第三方机制**（直接删）：manifest 加载/激活、`generate_interceptor`（`runGenerationInterceptors`，generation-service:773 唯一调用点）、`/qr*` stub、`{{extension}}` state-macro、`extensions-slashcommands.js`、wand 菜单（`addExtensionsButtonAndMenu`/`showHideExtensionsMenu`/wandButton/wandMenu 模板）、enable/disable/manage/install/update/delete、`isOfficialExtension`/`getAuthorFromUrl`/`findExtension`/`getExtensionManifest`/`extensionNames`/`extensionTypes`/`activeExtensions`、`EXTENSIONS_FIRST_LOAD`、`deferredExtensionLoader`、TH mutation zones（`TH-render`/`TH-streaming` 存活保护）。
- **内部基础设施**（保留，仅解冻）：`eventSource`/`event_types`、`Popup`/`callPopup`/`#dialogue_popup`、STscript 引擎、`getRegexedString`/`regex_placement`、`.character_select` 等 DOM 选择器、`/lib.js`。

## 3. 批次

### E-cut-1：内置直挂 + 第三方断载（本批后系统不再可能加载第三方代码）✅ 已完成（2026-09-24）

> **落地状态**：工作树未提交。验证：lint/tsc 净、`test:compat` 8/8 suites 107 tests、`test:unit` 59/59 suites 562 tests、integration 93/95（2 个 HEAD 预存失败）、build 全绿、定向 e2e 26+1 通过、docs:check/build 通过。
>
> **超计划的额外改动**：`initCoreFeatureExtensions` 增加按功能的 `initCoreFeatureOnce` 缓存（成功不重跑、失败清缓存供重试）——两个 init 均非幂等（regex `append` 宿主 + jQuery 绑定；connection-manager `insertAdjacentHTML`），裸重试会双挂。契约钉在 `extension-retirement.test.js`。
>
> **广量 e2e 三条确定性失败经查证为 HEAD 预存/环境问题**（纯净 HEAD + 全新数据根复现同样失败，非本批回归）：`character-library-bulk-mode` export popup、`chat-message-list-walkthrough` sprint2 reasoning 编辑被 `mes_create_branch` 拦截、`chat-message-rendering` 消息操作展开后塌缩（根因：`chat-message-actions-controller.js` 的 document 级 `onReactOwnedOutsideClick` 与 React 行 `stopPropagation` 的双属主点击竞态——菜单 open 后 ~100ms 收到 legacy close）。该竞态独立于本批，建议单列修复。

- 新增 `regex` workspace panel kind：index.html 抽屉（`#regex-panel-button`/`#RegexPanel`，照 `#persona-management-button` 先例）+ 导航项 + `mountRegexPanel`（宿主 div 内 `mountRegexSettings`）。
- `regex/index.js init()`：挂载目标改新 panel 宿主；删 `disabledExtensions.includes('regex')` 早退；模板渲染保留（`renderExtensionTemplateAsync` 暂仍由 extensions.js 提供）。
- `connection-manager`/`regex` 直挂：deferred 任务体改为直接 `init()` 调用（保持 deferred/retry 形状直到 E-cut-3 面板删除）。
- 删除 `public/scripts/extensions/third-party/`、`scripts/fetch-third-party-extension-fixtures.mjs`、`.gitignore` 两条目、`users.js:526` 静态路由（含 `extensionsEnabledFeatureGuard` import 清理）。
- 删除 `token-counter/`、`quick-reply/` 目录；`/qr-arg` 收编至 `slash-commands.js` 注册。
- wand 菜单删除：`addExtensionsButtonAndMenu`/`showHideExtensionsMenu`/`wandButton.html`/`wandMenu.html` + `initExtensions` 瘦身。
- 测试翻转：删 `third-party-extension-compatibility.test.js`、`third-party-extension-runtime.e2e.js`、`extensions-host.e2e.js`、`frontend-compatibility-contract.js` 中 globals/aliases/message-mutation/mounts 第三方条目；`test:compat` 清单同步。
- **本批容忍的过渡态**：Extensions 抽屉与 React 面板仍在但所有挂载点 unready（E-cut-3 删除）；`loadExtensionSettings` 等成为不可达死代码（E-cut-2 删除）。

### E-cut-2：extensions.js 拆解 + `feature_settings` 改名 ✅ 已完成（2026-09-28，commit `772c1a8d3`）

- `extension_settings` → `feature_settings`：持久化键 `extension_settings` → `feature_settings` 惰性迁移（load 时读旧键写新键）；全库引用改写（~10 个消费者文件）。
- **`extension_settings` 键清单（E-cut-1 实测）**——持久化路径：`settings.json` 顶层 `extension_settings`；前端 defaults 在 `public/scripts/extensions.js`（`export const extension_settings`），`script.js` `applyStartupSettingsCore` 以 `Object.assign(extension_settings, settings.extension_settings ?? {})` 合并，经 `saveSettingsDebounced` 回写。
  | 键 | 属主 | 处置 |
  |---|---|---|
  | `connectionManager` | connection-manager 功能（profiles/selectedProfile） | 迁至 `feature_settings.connectionManager`，引用改写 ~39 处 |
  | `regex` / `regex_presets` | regex 功能（全局脚本 + 预设） | 迁至 `feature_settings.regex*`，~25 处 |
  | `note` | authors-note（作者注释/depth prompt） | 迁至 `feature_settings.note` |
  | `variables` | STscript 变量子系统（`variables.global`） | 迁至 `feature_settings.variables` |
  | `apiUrl`/`apiKey`/`autoConnect`/`notifyUpdates` | Extras/更新通知（已空转） | **随批删除**：defaults 移除 + 迁移时丢弃旧值 |
  | `disabledExtensions` | 扩展启停（已死） | 同上删除 |
  | `memory`/`caption`/`dice`/`sd` 等 defaults 残留 | 已退役功能 | 从 defaults 移除（存量用户文件键值不主动清） |
- **迁移机制**：`applyStartupSettingsCore` 中 `Object.assign(feature_settings, settings.feature_settings ?? settings.extension_settings ?? {})`——旧键优先读取、新键写透；存量的 `settings.extension_settings` 键不删除（红线：不动磁盘存量键）。`extensions.js` 的 `export const extension_settings` 是全部消费者的 import 源——改名时整对象随归位模块迁出，调用点统一换名。
- `saveMetadataDebounced`/`cancelDebouncedMetadataSave` → 迁往 metadata/数据模块；`writeExtensionField`/`writeExtensionFieldBulk`/`UNSET_VALUE` → 迁往 `char-data.js`；`renderExtensionTemplate(Async)` → 迁往 `templates.js`（或保留在 feature 模块内）。
- 删：manifest/loader/enable-disable/update-check/manage-install popup 族/Extras 全部/`openThirdPartyExtensionMenu`/`extensions-slashcommands.js`/`{{extension}}` state-macro/`runGenerationInterceptors` + generation-service:773 调用点/`findExtension`/`getExtensionManifest`/`extensionNames`/`extensionTypes`/`activeExtensions`/`modules`/`isOfficialExtension`/`getAuthorFromUrl`/`EXTENSIONS_FIRST_LOAD`。
- 目标：`public/scripts/extensions.js` 整文件消灭，仅余 `extensions/connection-manager/`、`extensions/regex/`（可考虑移出 `extensions/` 目录，或下批收尾）。
- **落地备注**：`extensions.js` 更名为 `feature-settings.js`（保留 `feature_settings` 数据袋 + `initCoreFeatures`/`saveMetadataDebounced`/`cancelDebouncedMetadataSave`/`writeExtensionField`/`writeExtensionFieldBulk`/`UNSET_VALUE`/`renderFeatureTemplate*` 八个 load-bearing 导出）；`runGenerationInterceptors`/extras/scrapers 随批删除；Extras 前缀宏移交 `expressions.js`；两份 manifest.json 删除；`/api/settings/get` 边界做 `extension_settings`→`feature_settings` 归一化（客户端 `power_user.js` 加载点同样双读）；`data-maid` 对未迁移磁盘文件双读。

### E-cut-3：服务端墓碑 + React 桥接/抽屉删除 ✅ 已完成（2026-09-28，commit `5a3c46484`）

- `src/endpoints/extensions.js` → 410 tombstone router（8 条路由均曾被外部直接调用）。
- 删 `extensions.enabled`/`extensions.autoUpdate`/`extensions.models.autoDownload` 配置键 + config-init 迁移条目 + `settings.js` `enable_extensions`/`enable_extensions_auto_update` 输出 + `settingsPlan.extensionPlan`/`applyDeferredExtensionBootstrapState`/`extensionsHostControlsDisabled`/deferredExtensionTask 全链。
- 删 `extension-host-service.js`/`extension-host-domain.js`/`extension-compatibility-slots.js`、`ExtensionsHostWorkspacePanel`、script.js 全部 extensionsHost 桥接、`global-compatibility-bridge.js` `extensionsHost` kind。
- 删 index.html `#extensions-settings-button`/`#rm_extensions_block`/`#extensions_settings`/`#extensions_settings2` 抽屉标记（`#regex_container` 已随 E-cut-1 提前删除——regex 改挂 `#RegexPanel`）。
- `user-directories`/`users.js` 中 `directories.extensions` 停止创建与服务（存量目录惰性保留）。
- **落地备注**：deferred init 与 initRetry/warm-up 管线整链删除（无存活消费者）；`initCoreFeatures()` 经 `deferred(200)` 注册由 `executeDefferedStartupTasks` 执行；`src/util.js` 的 `getGitClient`/`src/git/client.js`/`git.backend` 配置随唯一消费者删除；`config-init` 中 `extensions.*`→`performance.*` 键迁移条目保留为"删除旧键不写新键"的惰性清理；connection-manager 顶部探针、`WAND_MENU_EXTRAS` 事件常量、内置扩展尾部三段 Extras 控制 UI 随批删除；`applyStartupSettingsCore` 改用 `settings.feature_settings`（经 `/get` 归一化保证）。

### E-cut-4：st-context 瘦身 + 测试/文档收官 ✅ 已完成（2026-09-28）

- `getContext()` 去掉只为第三方暴露的导出（`ScraperManager`、`openThirdPartyExtensionMenu`、`getExtensionManifest`、`renderExtensionTemplate*`、`ModuleWorkerWrapper`、extension helpers）；`window.SillyTavern.getContext` 全局保留为内部 API。
- compat suite 重定义：保留仍被内部依赖的 selectors/events/regex/slash 结构断言（改写为内部契约定性）。
- `.docs/tech/third-party-extension-compatibility.md` 改写为退役记录；`.docs/db` 相关 page/feature/term 文档同步；台账补录。
- **落地备注**：`st-context.js` 同步删除 `EXTENSION_PROMPT_ROLES`/`getContext` 残留第三方导出；compat contract 已含 `extensions.js` 缺席断言；行级 `extension-mutated` 死契约（`hasExtensionMutatedRows`/`extension-mutated` row state/bridge 标记）随批清除——第三方退役后无生产者。

## 4. 每批门禁（缺一不可）

```bash
pnpm run lint
pnpm run test:unit            # 聚焦先行，再全量
pnpm run test:integration
pnpm run test:compat          # E-cut-1 后为缩减后的清单
pnpm run build:react && pnpm run build:react:workspace-panels && pnpm run build:react:character-library
pnpm --dir tests run test:e2e <相关文件>.e2e.js
pnpm run docs:build           # 改了 .docs/db 后必跑
```

## 5. 全局红线

- **不降** CSRF/whitelist/host/SSRF/proxy 防护；不动 Express 中间件顺序。
- **不删** 磁盘上存量 settings/secrets/数据文件键——只删活跃读取者；`settings.extension_settings` → `feature_settings` 走惰性迁移，旧键数据不丢。
- **不删** `data.extensions.*` 角色卡/聊天元数据字段（regex_scripts、world 等是功能数据）。
- 410 tombstone 仅用于 `/api/extensions/*` 外部可达路由。
- 提交信息沿用 `feat(retirement): ...` / `test(retirement): ...` / `docs(retirement): ...` 前缀。

## 6. 完成定义 ✅ 全部达成（2026-09-28）

- 浏览器与服务端均无任何第三方扩展加载/发现/服务路径；`public/scripts/extensions/` 只剩被直挂的功能模块（或全部迁出）。
- `extensions.js` 文件消灭；`feature_settings` 归位；`/api/extensions/*` 全部 410。
- Extensions 抽屉/面板/桥接/compat slots/wand 菜单消灭；regex 在独立 workspace panel 正常工作（global/scoped/preset 脚本、编辑器、调试器、批量操作、导入导出）。
- 全部门禁通过；`.docs/db` 一致；台账完整含 commit hash。
