# Feature Retirement Workflow (R-loop)

> 退役大模块的循环工作流。目标：减功能不减契约——用户数据、第三方扩展面、slash/宏语法与历史文件全部保留；删除产物是可导航性/UI/运行时路径与端点挂载。每批一个 commit、可独立回滚、必须过全部门禁。

## 全局规则（每批生效，不重复裁决）

- **数据永留**：`settings`/`power_user`/`extension_settings` 键、用户目录下扩展数据、聊天元数据、上传文件一律不删、不迁移。
- **契约面不动**：`third-party/`、`@sillytavern/*` 导入、`getContext()`/st-context barrel、`eventSource`/`event_types`、`.character_select` 等身份选择器。
- **死而不删 vs 删干净**：UI/行为/端点删干净（不留半残面）；历史数据与兼容键原地保留。
- **410 约定**：沿用 `group-chat-retirement.js` 模式——仍可能被存量状态/脚本调用的对外端点返回 `410 + { error, message }`；纯内部端点直接删。
- **存量归一化**：`settings.main_api`/`chat_completion_source`/扩展启用列表等指向已删模块时，加载期归一化到安全默认（沿用 `['poe','kobold',...].includes(main_api) → 'openai'` 先例）。
- **每批 e2e**：每批必须带受影响面的 e2e 证据。

## R-loop（每批六个阶段）

### R0 收口判定 Contract gate

回答四个问题，写进模块卡：

1. **兼容面**：它注册了 slash 命令？暴露 `getContext()`/`@sillytavern` 导出？DOM id 被第三方扩展命中？设置键被外部读写？
2. **数据足迹**：磁盘上有什么（settings 键、扩展数据目录、聊天元数据、文件）？保留策略？
3. **端点暴露面**：哪些 API 路由属于它？存量状态/脚本可达的走 410，纯内部的直接删。
4. **删除形状**：整删 / 删 UI 保引擎 / 删引擎保数据。

**裁决不了就停**——把问题抛给用户，不猜。

### R1 引用图谱 Blast radius

固定扫描集：

- 模块文件名/导出符号的 importer（`grep` 全仓）
- DOM id/class（index.html、React 面板、委托绑定）
- slash 命令名（`addCommandObject`/`SlashCommand.fromProps`）
- 端点路径（`server-main.js`/`setupPrivateEndpoints` 挂载点 + `src/endpoints/`）
- `eventSource` 事件名、`power_user`/`extension_settings` 键、i18n key 前缀
- 测试钉住的断言（unit/integration/compat/e2e）

产出三列清单：**删 / 改线 / 保留**。

### R2 分层删除 Removal layers

固定顺序（每层可编译）：

1. **UI**：React 面板项 + index.html markup + options menu + CSS 死规则
2. **行为**：init 绑定、事件委托、键盘/a11y 选择器、生成管线插入点
3. **服务**：前端 service 文件、context/shell-context 桥
4. **端点**：router 卸挂载或 410 stub
5. **注册**：扩展目录删除（discover 是 `readdir` 驱动，删目录即下线）、slash 命令注销、context barrel 导出处理（扩展可达的保留为 no-op/stub，纯内部的删）

### R3 存量归一化 Saved-state normalization

- 引用已删模块的 settings 键 → 加载期归一化到安全值
- 聊天元数据/扩展数据 → 读不到就跳过，不崩

### R4 测试翻转 Test inversion

- 源契约测试：`toContain` → `not.toContain`/缺省断言
- 功能 e2e：删套件或翻转为「面不存在」冒烟
- compat：证明契约没断（slash 解析、context barrel、受保护 slot）

### R5 门禁 Gates（固定顺序）

```
pnpm run lint                        # eslint + tsc
pnpm --dir tests run test:unit -- <聚焦套件> --runInBand
pnpm run test:compat
pnpm run test:unit && pnpm run test:integration
pnpm run build:react:workspace-panels  # app/ 或桥动过时
# e2e：模块套件（翻转后）+ 邻接面（panel-navigation / workspace-shell / chat）
# headless 冒烟：启动零 console 错误 + 关键路径实测
```

### R6 台账+提交 Ledger & commit

- 台账条目写本文件末尾的 Retirement Ledger
- `.docs/db` 语义文档：owning page/feature 标退役 + `pnpm run docs:build`
- 一批一 commit，message 写「为什么删」而非「删了什么」

## 本批目标清单与排序

原则：低耦合先行跑通 loop；同构的 provider 端点留到后期批量走。

| 批 | 模块 | 体量 | 预判风险 |
|---|---|---|---|
| B-cut-1 | **movingUI** | endpoint+CSS+power-user 开关 | 最小自包含，loop 试金石 |
| B-cut-2 | **stats** | 335+469(后端) | 面板+端点，独立 |
| B-cut-3 | **bookmarks** | 561 | 聊天树分支耦合 chats.js |
| B-cut-4 | **authors-note** | 644 | 生成管线插入点（floatingPrompt） |
| B-cut-5 | **cfg-scale** | 493 | sampler 面 + slash 命令 |
| B-cut-6 | **assets** | 52K | 扩展目录级删 |
| B-cut-7 | **memory** | 72K | 扩展目录级删 |
| B-cut-8 | **gallery** | 340K | 与 background-library 有耦合，先盘 |
| B-cut-9 | **attachments** | 76K | 消息渲染模板+文件端点牵连 |
| B-cut-10 | **quick-reply** | 372K | `/qr*` slash 命令族=契约面，最后做 |
| B-cut-11 | **providers**：horde→novelai→nanogpt→openrouter→vertex(google) | 各 1 endpoint+source 分支 | 同构模式；含 source 列表/secret 键/settings 归一化 |
| ⚠️ | **instruct-mode** | 895 | **需裁决**：是所有非 OpenAI completion 源的提示词格式化引擎，非纯 UI——删=completion 后端裸发提示词 |
| ⚠️ | **images** | 204(端点) | **需裁决**：是媒体文件服务管道（角色头像/聊天图/上传），非生图模块；本 fork 无 SD 生图 |

## 待裁决问题（R0 阻塞项）

1. **instruct-mode**：删的是「instruct 模板编辑/管理 UI」还是「整个 instruct 格式化引擎」？后者会让所有 completion 类后端（textgen/openai-compatible 等）失去提示词包装——通常意味着只支持 chat-completion 源。
2. **images**：`src/endpoints/images.js` 是上传/服务/删除受管媒体的管道，删除会断头像与聊天图。如果目标是「图像生成」——该功能在本 fork 不存在，无需操作。
3. **quick-reply 的 `/qr*` slash 命令族**：删模块即删命令——第三方扩展/脚本调用会 404/报错，可接受？（契约破坏 vs 功能退役的边界）

## Retirement Ledger

### B-cut-1: movingUI

**删除形状**：UI + 行为 + 服务 + 端点（410 tombstone）+ 注册。

- **删**：`power_user.movingUI/movingUIState/movingUIPreset` 默认值与全部消费者；`switchMovingUI`/`applyMovingUIPreset`/`saveMovingUI`/`resetMovablePanels`/`doResetPanels`/`setmovingUIPreset`；`initMovingUI`；窗口 resize→movingUI 缩放器（`coreTruthWin*`/`reportZoomLevelDebounced`）；`/resetpanels`(+`/resetui`)、`/movingui` slash 命令；`#movingUImode`/`#movingUIreset`/`#movingUIPresets`/`#movingui-preset-save-button` 控件（PowerUserPanel.tsx + SettingsSurface.tsx + settings-helpers 三处映射）；`#sheldheader` 与 zoomed-avatar 模板的死 grabber markup；`body.movingUI` CSS 门（drag-grabber 显示、resize:both、scrollbar、maximized 覆盖）；`/api/settings/get` 的 `movingUIPresets` payload 字段。
- **保留**：`POST /api/moving-ui/save` → 410 JSON tombstone（`moving_ui_feature_removed`），`/savemovingui` 兼容重定向不变；`movingUI` 用户目录映射（constants/user-directories/user-migrations/content-manager）——存量 preset 文件仍被备份/清理工具看见；`loadMovingUIState` → no-op stub（quick-reply/memory/gallery 仍 import，随各自批次消亡）；`dragElement`/`resetMovableStyles` 导出（扩展契约面）；`MOVABLE_PANELS_RESET` 事件常量（无 emitter，保留给第三方 listener）。
- **数据策略**：`settings.json` 里的 `power_user.movingUI*` 旧键不主动归一化——schema 移除后自然被忽略，无害。存量 `movingUI/` preset 文件保留在磁盘。
- **行为差异（有意）**：zoomed avatar 不再可拖（grabber 本来就是 movingUI-gated 隐藏态）；`.drawer-content.maximized` 规则现在无条件生效（原先 `body:not(.movingUI)` 门）；dragElement 的 corner-resize 观察器不再被 `movingUI===false` 断开。
- **验证**：lint+tsc 净；jest 157 suites/1477 tests 全绿（含重写后的 `moving-ui-express-route.test.js` 410 契约测试）；e2e 576 过 + 3 个 MacroEngine beforeEach 超时（复跑 322/322 全绿，确认为 lane 尾部资源耗尽 flake）。
- **Commit**: `ce772ff3f`。

### B-cut-2: stats

**删除形状**：UI + 行为 + 服务 + 端点（410 tombstone）+ 生命周期钩子。

- **删**：`statMesProcess`（生成与用户消息两条调用链）；`initStats`；`userStatsHandler`/`characterStatsHandler`/`refreshStats`；`.rm_stats_button`/`.user_stats_button` 控件（RightNavPanel.tsx + PersonaManagementPanel.tsx）；`.rm_stat_block` CSS；`public/scripts/stats.js` 整文件；server-main 的 `statsInit`/`statsOnExit` 启动/退出钩子。
- **保留（410 tombstone）**：`/api/stats/get|recreate|update` + 旧版 `/getstats`/`/recreatestats`/`/updatestats` 重定向 → 410 JSON（`stats_feature_removed`）。存量 `stats.json` 文件保留在磁盘；`user-migrations` 的 stats.json 迁移条目保留。
- **数据策略**：存量 `stats.json` 不删不改——功能关闭后文件成为惰性历史数据。
- **验证**：lint+tsc 净；jest 157 suites 全绿；e2e 579/579 全绿。
- **Commit**: `efa7f7360`。

### B-cut-3: bookmarks（checkpoint 部分）

**R0 裁决**：checkpoint/bookmark 功能退役，但 **branch 机器必须存活**——`swipe-picker.js` import `branchChat`，`createBranch` 是 Timelines 扩展的标注契约（"Do not remove"）。因此删除形状为 **拆分式退役**：`bookmarks.js` → `chat-branch.js`（存活面）+ checkpoint 机器全删。

- **删**：`createNewBookmark`/`getBookmarkName`/`saveBookmarkMenu`/`updateBookmarkDisplay`；`/checkpoint-create|go|exit|parent|get|list` 六个 slash 命令；`.mes_bookmark`/`.mes_create_bookmark` 消息控件（index.html 模板 + MainChatMessageRow.tsx）；`#option_new_bookmark`（OptionsMenu.tsx）；`bookmark_link` 消息属性 + descriptor/projection/store 的 `bookmarkLink` 字段管线；`.mes_bookmark`/`mes_create_bookmark` CSS 显示门；`templates/createCheckpoint.html`；`.mes_bookmark` 点击委托 + shift-click 替换 checkpoint 路径。
- **迁移保留**：`.select_chat_block` 点击打开聊天委托 → dom-handlers.js（这是"过去聊天列表"的打开处理器，非 checkpoint 专属）。
- **存活（chat-branch.js）**：`branchChat`/`createBranch`（swipe-picker + Timelines 契约）；`/branch-create`；`.mes_create_branch` 按钮；`#option_back_to_main` + `backToMainChat` + `showBranchChatButtons`（branch 聊天的父级导航）；`getMainChatName` 的 legacy `Checkpoint #` 令牌回退（存量 checkpoint 聊天仍可经 `chat_metadata.main_chat` 导航回父级）。
- **数据策略**：`extra.bookmark_link` 与 `chat_metadata.main_chat` 历史字段保留在聊天文件内——无破坏性归一化。存量 checkpoint 聊天文件本身即普通聊天，仍可由聊天列表打开。
- **行为差异（有意）**：历史 `bookmark_link` 不再渲染旗帜/可点——数据惰化保留；options 菜单的 "Save checkpoint" 消失。
- **文案更新**：chatRename/scenarioOverride/FloatingPromptPanel 的 "checkpoint" 措辞 → "branch"（分支聊天仍继承 `main_chat` 元数据与场景覆盖）。
- **验证**：lint+tsc 净；聚焦 678 tests 绿；unit lane 59 文件全绿；e2e（chat-message-layout + chat-message-rendering）9/9 绿；headless 冒烟：checkpoint UI/命令全灭、`/branch-create` 实际创建分支聊天（`main_chat` 元数据磁盘证实、嵌套分支父链正确）、`.mes_create_branch`/`option_back_to_main`/swipe-picker 存活、零 console 错误；docs:build 通过。
- **Commit**: `24c285e73`。

### B-cut-4 + B-cut-5: authors-note + cfg-scale（耦合对，合并执行）

**R0 裁决**：两个模块共享 `#movingDivs` 抽屉槽位与生成管线插入点，合并为单批。Author's Note 的活跃功能（floating prompt UI、per-chat/chara note、`/note*` 命令族、`authorsNote`/`charAuthorsNote`/`defaultAuthorsNote` 宏、insertion interval 状态机）退役；但 `2_floating_prompt` 注入槽**保留为中性载体**——WI 的 AN-position 条目（ANTop/ANBottom）与 persona TOP_AN/BOTTOM_AN 仍经它注入，存量 lorebook 与 persona 设置语义不变。CFG 的 generation-path 语义（`getGuidanceScale`/`getCfgPrompt`、context 缩减、正/负提示词注入）随 UI 一并退役。

- **删**：`public/scripts/cfg-scale.js` 整文件；`authors-note.js` 活跃机器（`initAuthorsNote`/`setFloatingPrompt`/`onANMenuItemClick`/chara note 编辑/interval 计数器）；`FloatingPromptPanel.tsx` + `CfgConfigPanel.tsx`；`#floatingPrompt`/`#cfgConfig` drawer hosts（index.html）；`#option_toggle_AN`/`#option_toggle_CFG`（OptionsMenu.tsx）；`mountFloatingPromptPanel`/`mountCfgConfigPanel`（workspace-panels.tsx）；`/note*` slash 命令与三个宏；RossAscends 的两处 `.not()` 过滤与 Escape 分支；`guidance_scale` 的 samplerSelect DOM 映射与 power-user 滑条 offVal 条目；CSS 规则群（style.css 4 处 + mobile-styles 2 处）。
- **保留（契约面）**：`public/scripts/authors-note.js` → 最小 stub，仅导出 `NOTE_MODULE_NAME`/`metadata_keys`/`shouldWIAddPrompt=false`（Tavern Helper `dataProcessor.ts` 经 `@sillytavern/scripts/authors-note` 导入——compat 测试实证）；`2_floating_prompt` 槽仍被 world-info-service ANTop/ANBottom 合并、`openai.js` 的 `authorsNote` 系统提示条目、itemized-prompts 的 `authorsNoteString`、persona TOP_AN/BOTTOM_AN 写入；`extension_settings.note` 存量桶与 `chat_metadata.note_*`/`chat_cfg*` 键不归一化（惰性历史数据）；character-lifecycle-service 的 `note.chara` 重命名同步保留（存量数据卫生）。
- **行为差异（有意）**：WI ANTop/ANBottom 条目不再被 AN 的 insertion-interval 门控——有匹配条目即注入（原先 `shouldWIAddPrompt` 会随 AN 间隔跳过）；persona TOP_AN/BOTTOM_AN 去掉 `shouldWIAddPrompt` 前置门；CFG 负提示词通道整体消失（`getCombinedPrompt(isNegative)` 参数退役）；`samplerSelect` 对 preset 中残留 `guidance_scale` 键返回空 DOM 映射。
- **验证**：lint+tsc 净；unit lane 59 文件/624 tests 绿；integration lane 98 文件/849 tests 绿（初轮 third-party-extension-compatibility 命中 JSR alias 导入面——经 stub 修复）；e2e（panel-navigation + world-info-workbench + chat-message-rendering）21/21 绿；workspace-panels bundle 重建。
- **Commit**: 待提交。

### B-cut-6 + B-cut-7: assets + memory（扩展目录级删）

- **删**：`public/scripts/extensions/assets/`、`public/scripts/extensions/memory/` 整目录；`extension_settings.memory` 默认值；契约条目。readdir 驱动发现——目录删即下线。
- **验证**：lint+tsc 净；契约测试绿；headless discovery 列表不再含两者。
- **Commit**: `68c1f5192`。

### B-cut-8: gallery（扩展目录级删）

- **删**：`public/scripts/extensions/gallery/` 整目录 + 契约条目；`mes_gallery` 从 `MESSAGE_ACTION_TIERS.secondary` 移除（无 DOM 生产者的残留）。
- **保留**：`MEDIA_DISPLAY.GALLERY`——消息媒体网格布局模式，核心功能非扩展。
- **Commit**: `4d998e99f`。

### B-cut-9: attachments + Data Bank

**R0 裁决**：attachments 扩展实为 **Data Bank 管理器**（`/db*` 命令族 + `#manageAttachments` 面板）。边界：删 Data Bank 管理面，**保留消息级文件嵌入**（`mes_embed`/`embedMessageFile`/`populateFileAttachment`/`appendFileContent`/`hasPendingFileAttachment`/`/api/files/*`/`extra.files`——文件内容进 prompt 的核心路径）。

- **删**：`public/scripts/extensions/attachments/` 整目录；chats.js 的 Data Bank 子树（~1153–1837：`openAttachmentManager`/attachment 编辑移动启停/银行列表渲染/targets/scraper 集成/attachment 校验/银行专用上传删除管理）；`/db*` 命令族；`#manageAttachments` 处理器；`extension_settings.attachments`/`character_attachments` 银行存储默认值；`Popper` import。
- **保留**：`ScraperManager` 注册表 API（`st-context` 暴露的第三方扩展契约，`initScrapers` 内置注册变惰性）；`openFilePopup`（消息文件预览仍用）；canonical 备份/恢复的 attachment manifests（独立存储层）。
- **验证**：lint+tsc 净（初轮 `Popper` unused 已修）；聚焦 unit 绿；headless discovery 仅剩 connection-manager/quick-reply/regex/token-counter/JS-Slash-Runner。
- **Commit**: `3236ea33a`。
