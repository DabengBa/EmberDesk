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
- **后续（2026-10-08）**：WI 占位符合并后，ANTop/ANBottom 折叠进单一 `worldInfo` 桶，`2_floating_prompt` 注入槽再无消费者——`authors-note.js` stub、`feature_settings.note` 桶、`note.chara` 重命名与 `NOTE_MODULE_NAME`/`metadata_keys` 上下文导出已全部移除。
- **行为差异（有意）**：WI ANTop/ANBottom 条目不再被 AN 的 insertion-interval 门控——有匹配条目即注入（原先 `shouldWIAddPrompt` 会随 AN 间隔跳过）；persona TOP_AN/BOTTOM_AN 去掉 `shouldWIAddPrompt` 前置门；CFG 负提示词通道整体消失（`getCombinedPrompt(isNegative)` 参数退役）；`samplerSelect` 对 preset 中残留 `guidance_scale` 键返回空 DOM 映射。
- **验证**：lint+tsc 净；unit lane 59 文件/624 tests 绿；integration lane 98 文件/849 tests 绿（初轮 third-party-extension-compatibility 命中 JSR alias 导入面——经 stub 修复）；e2e（panel-navigation + world-info-workbench + chat-message-rendering）21/21 绿；workspace-panels bundle 重建。
- **Commit**: `1b22d26e8`。

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

### B-cut-11a: horde + novelai + nanogpt + openrouter

**R0 裁决**：四 provider 前端早已死亡（`script.js:8151` 的 `main_api` 归一化把 `koboldhorde`/`novel` 折到 `openai`；无 DOM 控件存活）。删除形状=后端 router + secrets 机器 + 散点引用。

- **删**：`src/endpoints/{horde,novelai,nanogpt,openrouter}.js` router 与挂载；`secrets.js` 的 provider 专属机器（key 标签、授权按钮绑定、OpenRouter OAuth `/callback/openrouter`、NanoGPT credits）；`slash-commands.js`/`tokenizers.js`/`RossAscends-mods.js` 的 provider 分支；`ai_horde` npm 依赖。
- **保留（410 tombstone）**：`src/endpoints/provider-retirement.js`——退役 provider 路径统一 410（`provider_feature_removed`），经 `tests/provider-retirement-express-route.test.js` 钉契约。存量 `api_key_*` secrets 不删——secrets 存取按键存在性校验非枚举白名单，旧数据可读可删。
- **验证**：lint+tsc 净；unit 158 suites/1475 tests 绿（含新增 provider-retirement 路由测试）；服务端实测 410。
- **Commit**: `e5c0633c0`。

### B-cut-11b: vertexai（Google Vertex AI）

**R0 裁决**：Vertex AI 无独立端点——它是共享 `chat-completions` 后端的 `chat_completion_source` 值，故不需要 410 tombstone；未知 source 由现有 400 兜底覆盖。MakerSuite/Gemini 保留。

- **删**：`chat_completion_sources.VERTEXAI`；`oai_settings` 的 `use_vertexai`/`vertexai_auth_mode`/`vertexai_region`/`vertexai_express_project_id` 默认值与 settings-helpers 全部映射（`vertexAuthModeOptions`、`mapUseVertexAiToFormValue`、`saveWhenFormPathsChanged`、form 默认值、schema 字段、coverage 声明）；SettingsSurface 四个 SettingField + service-account textarea 分支；ApiConnectionsPanel 的 `vertexai_config` 块与 `#use_vertexai`/`#vertexai_*` 控件族；`secrets.js` 的 `api_key_vertexai`/`vertexai_service_account_json` 键、标签、选择器映射与 `resolveSecretKey` 分支；`provider-secret-field-state.js` 的 service-account/express 分支（`resolveProviderSecretKeyForSettings` 退化为直通）；`src/endpoints/google.js` 重写为 makersuite-only（删 `getVertexAIAuth`/`generateJWTToken`/`getAccessToken`/`getProjectIdFromServiceAccount` 与 vertex URL 分支）；`chat-completions.js` 的 `isVertexAi` 分支（generate + status + switch case）；`constants.js` 的 `VERTEX_SAFETY`/`CHAT_COMPLETION_SOURCES.VERTEXAI`；`util.js` `flattenSchema` 的 vertex 项；reasoning/tool-calling/tokenizers/slash-commands/custom-request/extensions-shared/RossAscends/openai-provider-capabilities 的 vertex 分支；`body.vertexai-active`/`#vertexai_config`/`.vertexai-*` CSS；`/api` slash 帮助文案。
- **归一化**：`migrateChatCompletionSettings` 新增 `vertexai → makersuite` 映射（沿用 palm→makersuite 先例）；React settings form `mapChatCompletionSourceToFormValue` 保留 vertexai→makersuite shim——存量 `vertexai` source 在载入时显示为 Google，保存后落 `makersuite`。
- **数据策略**：`api_key_vertexai`/`vertexai_service_account_json` 存量 secrets 保留在磁盘（key-existence 校验仍可读删）；settings 里的 `use_vertexai`/`vertexai_*` 旧键不再被映射，保存时随 untouched 原样保留（惰性）。
- **保留**：MakerSuite/Gemini 全路径（generate/status/`countTokens` 无关 vertex 部分、`GEMINI_SAFETY`、`convertGooglePrompt`、reasoning thought-signature、tokenizer 选择）。JS-Slash-Runner 源码里的 `vertexai` 引用不动（vendored 契约源——`chat_completion_sources.VERTEXAI` 解析为 `undefined` 后自然降级，`settings.vertexai_*` 为 `undefined` 时字段不写入 payload）。
- **测试翻转**：`chat-completions-google.test.js` 删 3 个 vertex 用例；`settings-react-route.test.js` 的 vertex round-trip 测试改写为"legacy vertexai → makersuite 归一化"语义；`provider-secret-field-state.test.js` vertex secret 解析断言改直通；`openai-provider-capabilities.test.js`/`api-connections-react-surface.test.js` 删 vertex 条目；删 `tests/vertexai-api-key-visibility.test.js`。
- **文档**：`chat-completion-select`/`custom-base-url`/`api-configuration` 语义条目、`react_settings_payload_processing_flow` + sandbox proof、`processed_columns_lineage`、`react-modernization-roadmap` 同步翻转；proof 脚本实测通过。
- **验证**：lint+tsc 净；聚焦 7 suites/56 tests 绿；unit 60 suites/625 tests、integration 97 suites/846 tests、compat 8 suites/107 tests 全绿；React + workspace-panels + character-library bundle 重建。
- **Commit**: `887cc2780`（+ `cdbf3592a` vector-retirement e2e 翻转）。

### B-cut-12a: claude（Anthropic Claude provider）

**R0 裁决**：Claude 是共享 `chat-completions` 后端的 `chat_completion_source` 值，无独立端点——不需要 410 tombstone，未知 source 由现有 400 兜底。产品边界只剩 OpenAI-compatible，Claude 专属请求形状（messages API、cache_control、adaptive thinking、anthropic SSE）整体退役。MakerSuite/Gemini 存活到 B-cut-12b。

- **删**：`chat_completion_sources.CLAUDE`/`CHAT_COMPLETION_SOURCES.CLAUDE`/`SECRET_KEYS.CLAUDE`；`src/endpoints/backends/chat-completions.js` 的 `sendClaudeRequest`（~220 行）、`/models` status 分支、`API_CLAUDE` 常量与 `claude.*` config 读取（extendedTTL/systemPromptCache/cachingAtDepth/adaptiveThinking）；`prompt-converters.js` 的 `convertClaudeMessages`/`cachingAtDepthForClaude`/`calculateClaudeBudgetTokens` 导出与实现；openai.js 的 `claude_model`/`assistant_prefill`/`assistant_impersonation` 默认值与 settingsToUpdate 映射、`max_200k`/`claude_max_temp` 常量、populateChatCompletion 的 assistant-prefill 拼接、createGenerationParameters 的 claude 块（top_k/use_sysprompt/stop/prefill）、saveModelList/toggleChatCompletionForms/onModelChange 的 `#model_claude_*` 分支、`getStreamingReply` claude delta 分支、getStatusOpen 的 noValidate 分支、onConnectButtonClick apiSourceConfig 条目、`#claude_assistant_*` input 处理器、`api.anthropic.com` placeholder；`sse-stream.js` 的 claude delta.text/delta.thinking 解析；`tool-calling.js` 的 supportedSources 条目、isClaudeToolCall/convertClaudeToolCall 与 content 数组 tool_use 提取；`reasoning.js`/`script.js extractJsonFromData` 的 claude case；`tokenizers.js` claude 路由；`secrets.js` 的 `api_key_claude` 标签/INPUT_MAP；`provider-secret-field-state.js` claude 分支；`slash-commands.js` `/api` 枚举与 CONNECT_API_MAP 自动下线；`RossAscends-mods.js` claude 自动连接条件；`openai-provider-capabilities.js` claude 能力映射；`toggle-dependent.css` claude-only 警告规则；`default/config.yaml` claude 配置块；React 侧 `AiConfigPanel`/`ApiConnectionsPanel`/`SettingsSurface`/`settings-helpers` 的 claude 选项、字段映射、data-source 门控与 vertex 同型的 source 归一化 shim。
- **归一化**：`migrateChatCompletionSettings` 新增 `claude → openai`（沿用 custom/vertexai 先例）；React `mapChatCompletionSourceToFormValue`/`settings-helpers` 同步 shim——存量 `chat_completion_source: 'claude'` 载入时显示 OpenAI，保存后落 `openai`。
- **数据策略**：`api_key_claude` 存量 secret 保留磁盘（key-existence 校验可读删，`FRIENDLY_NAMES[key] || key` 兜底显示原名）；`claude_model`/`assistant_prefill`/`assistant_impersonation` 旧 settings 键不再映射、惰性保留；`default/content/presets/openai/Default.json` 中 `claude_model` 字段作为历史 preset 数据保留；`public/img/claude.svg` 静态资产保留。
- **保留**：JS-Slash-Runner vendored 的 claude 兼容引用不动（契约边界）；`use_sysprompt` 字段本身保留（makersuite 仍消费）。
- **测试翻转**：`prompt-converters.test.js` 删 claude 用例；`chat-completions-google`/`chat-completions-openai-fallback`/`chat-message-streaming.e2e`/`chat-workspace-structure`/`ai-config-react-surface`/`api-connections-react-surface`/`openai-provider-capabilities`/`provider-secret-field-state` 删 claude 断言；`settings-react-route.test.js` 的 reactOwned 移除 `assistant_prefill` 并新增 `claude → openai` 归一化断言。
- **文档**：`chat-completion-select`/`api-configuration` 语义条目翻转（活跃 provider=OpenAI+Google，claude 记为 legacy 归一化入 openai）；docs bundle 重建（30 文档）。
- **验证**：lint+tsc 净（修 `max_200k`/`process`/`color` unused）；unit 60 suites/595 tests、integration 97 suites/847 tests、compat 8 suites/107 tests 全绿；React + character-library bundle 重建；docs:build 通过。
- **Commit**: `1db68e8a0`。

### B-cut-12b: makersuite（Google AI Studio / Gemini）+ provider 单源收敛

**R0 裁决**：MakerSuite 是 `chat_completion_source` 值 + 独立 `src/endpoints/google.js` helper（`getGoogleApiConfig`）——无独立 HTTP 路由挂载，未知 source 由现有 400 兜底，不需要 410 tombstone。产品边界收敛为单一 OpenAI-compatible source，`chat_completion_source` 字段保留并固定为 `'openai'`。Vertex/PaLM/Claude 的历史归一化终点从 makersuite 改指 openai。

- **删**：`chat_completion_sources.MAKERSUITE`/`CHAT_COMPLETION_SOURCES.MAKERSUITE`/`SECRET_KEYS.MAKERSUITE`；`src/endpoints/google.js` 整文件；`chat-completions.js` 的 `sendMakerSuiteRequest`（~270 行，含 Gemini 模型清单/safety/thinkingConfig/imageConfig/webSearch 工具装配）、`/status` makersuite 模型列表分支、`/generate` makersuite 分发、`API_MAKERSUITE` 与 `GEMINI_SAFETY` 常量、`gemini.*` config 读取；`src/endpoints/google.js` 随 `getGoogleApiConfig` 一并退役；`prompt-converters.js` 的 `convertGooglePrompt`/`calculateGoogleBudgetTokens`/`GEMINI_MEDIA_RESOLUTION`/`enableThoughtSignatures`；`util.js flattenSchema` 的 Google 关键字过滤分支；openai.js 的 `google_model`/`top_k_openai`/`enable_web_search`/`request_images*` 默认值与 settingsToUpdate、`max_8k~max_1mil` 常量、`getGeminiMaxContext`/`getGeminiMaxTemp`、makersuite 分支（populate/saveModelList/onModelChange/toggleChatCompletionForms/getStatusOpen/onConnectButtonClick/getStreamingReply/compressImage）、generativelanguage placeholder、`#model_google_*`/`#top_k_openai`/`#openai_enable_web_search`/`#openai_request_images`/`#request_image_*` 处理器；`sse-stream.js` 的 `json.candidates` Google AI Studio 流形状解析；`tool-calling.js` 的 candidates parts 提取与 `isGoogleToolCall`/`convertGoogleToolCall`；`reasoning.js` extractReasoningFromData makersuite case（`extractReasoningSignatureFromData` 改为数据形状驱动保留）；`tokenizers.js` makersuite→gemma 映射；`secrets.js` 的 `api_key_makersuite` 标签/INPUT_MAP；`provider-secret-field-state.js` makersuite placeholder；`slash-commands.js` `google` /api 别名与 `model_google_select` 映射；`RossAscends-mods.js` makersuite 自动连接；`openai-provider-capabilities.js` makersuite 分支与 videoSupportedModels（视频内联随 provider 退役）；`custom-request.js` `use_sysprompt`；`toggle-dependent.css` request_images 死规则；`default/config.yaml` `gemini:` 块与 `default/content/settings.json` 的 claude/google 遗留键；React 侧 `providerOptions`/`providerSecretKeyBySource`/`providerModelFieldBySource`/`settingsSchema`/`fieldBindings`/`defaultSettingsFormValues` 的 google/topK/webSearch/requestImages 映射，`ApiConnectionsPanel` makersuite 表单与选项，`AiConfigPanel` 的 makersuite data-source 控件（Top K/Web Search/Request Images/分辨率/宽高比），`SettingsSurface` 对应字段。
- **归一化**：`migrateChatCompletionSettings` 的 `palm → openai`、`vertexai → openai`，新增 `makersuite → openai`（保留既有 `claude → openai`、`custom → openai`）；React `mapChatCompletionSourceToFormValue` 统一 shim `['vertexai','makersuite','palm','claude'] → 'openai'`。
- **数据策略**：`api_key_makersuite` 存量 secret 保留磁盘（与 claude 同策略）；`google_model`/`vertexai_model`/`top_k_openai`/`enable_web_search`/`request_images*`/`use_sysprompt` 进入 preset-manager 惰性保留清单；`default/content/presets/openai/Default.json` 历史字段保留。
- **保留**：JS-Slash-Runner vendored 兼容面；tokenizer 端点的 `gemma`/`gemini`/`claude` 模型名→tokenizer 选择（OpenAI-compatible 端点服务同名模型的格式兼容，与 provider 退役无关）；`reasoning.js`/`script.js` 的 `responseContent.parts` 数据形状驱动提取（OpenAI-compatible 代理回传 Gemini 形状的零成本兼容）；`openai-provider-capabilities.js` 的 gemini/gemma 模型名前缀清单（模型格式兼容）；`isReasoningSignatureSupported()` 维持 `false`；`search.js` serper 属 B-cut-14b；instruct 模板 "Gemma / Gemini" 选项属 B-cut-13。
- **测试翻转**：删 `chat-completions-google.test.js`；`prompt-converters.test.js` 删 google/openrouter 签名用例（convertClaudePrompt 保留给 tokenizer 端点）；`util.test.js` flattenSchema 改 openai 断言并删 Google 过滤用例；`openai-provider-capabilities`/`provider-secret-field-state`/`settings-react-route`/`api-connections-react-surface`/`ai-config-react-surface`/`chat-workspace-structure` 断言翻转为 openai-only 契约与 makersuite→absent/归一化；`chat-completions-openai-fallback` 移除 MAKERSUITE mock；`chat-message-streaming.e2e` fallback 场景改 openai 主源。
- **文档**：`chat-completion-select`/`api-configuration`/`settings` 语义条目更新为单源契约与四类 legacy source 归一化说明；demo HTML 重写为 OpenAI 单选项 + fallback provider 面板；docs bundle 重建（30 文档）。
- **验证**：lint+tsc 净（清 `util`/`tryParse`/`REASONING_EFFORT`/`max_*`/`getRandomId` unused）；unit 59 suites/557 tests、integration 97 suites/847 tests、compat 8 suites/107 tests 全绿；focused 9+3 suites 通过；lib + react + character-library + workspace-panels 构建通过；docs:check/docs:build 通过；`chat-message-streaming.e2e` fallback 3 用例通过（独立端口 8123）。
- **Commit**: `b367059d7`。

### B-cut-13: instruct-mode + context 模板（空转提示词引擎）

**R0 裁决**：`main_api` 恒为 `'openai'`，`power_user.instruct.enabled && main_api !== 'openai'` 永假——instruct/context 模板构成一台不可达的 legacy text-completion 提示词引擎，随 `instruct-mode.js`/`chat-templates.js` 整文件退役一并下线。context 模板（story string/chat_start/example_separator）与 instruct 共享同一引擎、同一面板、同一 preset 管道，本批一并退役（计划外扩项，已记）。无独立 HTTP 端点，`/api/presets/*` 未知 apiId 由现有路径兜底，不需要 410 tombstone。

- **删**：`public/scripts/instruct-mode.js`、`public/scripts/chat-templates.js` 整文件；`power-user.js` 的 instruct/context 设置加载（loadInstructMode/loadContextSettings）、`contextControls` 绑定数组、`getContextSettings`、model-template 绑定接线与 `#instruct_derived`/`#context_derived`/`#context_size_derived` UI 状态；`script.js` 的 `isInstruct` 判定与下游（formatInstructMode*/getInstructStoppingSequences/instruct stop-sequences/`<START>` 分支/`instructOverride` 行为、debug 输出行）、`addChatsSeparator` 的 context 依赖随死路径一并惰性化；`generation-service.js` 的 instruct 包装与 `power_user.context` story-string inject 死分支；`message-service.js` 的 instruct stop-sequence/input-sequence 清理；`preset-manager.js` 的 `masterSections` instruct/context、`isPossiblyInstructData`/`isPossiblyContextData`、legacy import 分支、`instruct`/`context` API case 与 sysprompt 迁移钩子；`slash-commands.js` 的 `/instruct` `/instruct-on` `/instruct-off` `/instruct-state` `/context`；connection-manager 的 `instruct`/`context`/`instruct-state` profile 命令与 FANCY_NAMES；`sysprompt.js` 的 `checkForSystemPromptInInstructTemplate`；React 侧 `AdvancedFormattingPanel` 的 Context Template/Instruct Template 两栏与 cc-null 警告、`SettingsSurface`/`settings-helpers` 的全部 instruct*/context* schema/绑定/默认值与 Context Presets 统计；后端 `settings.js` 的 `instruct`/`context` payload 字段、`presets.js` 的 `instruct`/`context` apiId、`content-manager.js` 的 `INSTRUCT`/`CONTEXT` 类型与目录映射、`default/content/index.json` 72 条清单与 `default/content/presets/{context,instruct}/` 全部默认模板；`toggle-dependent.css` 的 cc-null 规则。
- **数据策略**：`power_user.instruct.*`/`power_user.context.*`/`instruct_derived`/`context_derived`/`context_size_derived`/`model_templates_mappings` 存量键惰性保留（settings save 不再覆写，settings-react-route 测试断言原样回环）；`USER_DIRECTORY_TEMPLATE` 保留 `instruct`/`context` 目录，`user-migrations.js` 的 instruct→sysprompt 迁移保持可用；`{{instruct*}}`/`{{chatStart}}`/`{{exampleSeparator}}` 宏继续从存量键解析（`getInstructMacros` 迁入 `macros/definitions/instruct-macros.js`）；`/genraw instruct=` 与 `generateRaw`/`generateRawData`/`createRawPrompt` 的 `instructOverride` 位置参数保留为 deprecated no-op（第三方脚本位置参数契约）。
- **保留**：`mountAdvancedFormattingPanel` 迁移至 `power-user.js`（React 面板挂载契约不变）；`renderStoryString`/`parseMesExamples`/`formatMessageHistoryItem`/`addChatsSeparator` 保留（openai 路径的 mesExamples 解析与存量的 text-completion 装配尾巴）；`always_force_name2`/`trim_sentences`/`single_line` 等 live 控件不动。
- **测试翻转**：`config-drawers-react-surface` 的 adapter/ID 清单翻转；`settings-react-route` 的 schema/合并断言翻转为「存量键原样保留」；`group-chat-retirement` 移除 instruct-mode 契约条目、stop-strings 断言翻转为 openai 路径；`script-js-reverse-import-contract` 删 instruct-mode 条目并更新 env-macros/power-user 导入面；`MacroStoryString.e2e` 改为内联模板（默认 preset 文件已删）。
- **文档**：`page.settings` 语义条目翻转（Advanced tab 不再含 instruct/context 字段，新增 retired template state）；docs bundle 重建。
- **验证**：lint+tsc 净；focused 6 suites/59 tests 绿；unit 58/59 suites（唯一失败 `chat-workspace-structure` + compat 中 `react-workspace-panels-helpers` 均为工作区未提交的 main-chat-store WIP 导致 `mes_text` 断言失败，stash 隔离后两套件全绿，与本批无关）；docs:check/docs:build 通过；`MacroStoryString.e2e` 通过（独立端口 8123，全新 server）。
- **Commit**: `96e91c427`。

### B-cut-14a: logit-bias + logprobs + prompt itemization（采样检查器退役）

**R0 裁决**：三者均为 OpenAI 请求路径上的检查/偏置工具——`bias_presets` 编辑器和 `/bias` tokenizer 端点、`request_token_probabilities` → `logprobs` 请求字段与 Token Probabilities drawer、`.mes_prompt` prompt itemization viewer。`audio-player.js` 按计划媒体复用豁免保留：它是 `extra.media` 消息音频附件的渲染器，与独立的音频播放器功能无关。无独立产品端点存活——`/api/backends/chat-completions/bias` 随功能一并删除。

- **删**：`public/scripts/logit-bias.js`、`public/scripts/logprobs.js`、`public/scripts/itemized-prompts.js` 整文件；`public/css/logprobs.css`；`templates/itemization{Text,Chat}.html`；`migrateInstructPrompt.html`（B-cut-13 漏删模板）；`index.html` 的 `#logprobsViewer` drawer、`.mes_prompt` 按钮、`#openai_logit_bias_template`/`#logit_bias_template`；React 侧 `LogprobsViewerPanel` 组件与 `mountLogprobsViewerPanel`、OptionsMenu 的 Token Probabilities 入口、PowerUserPanel/SettingsSurface/settings-helpers 的 `request_token_probabilities`/`biasPresetSelected` 绑定；AiConfigPanel 的 Logit Bias 栏；`openai.js` 的 `logit_bias` 请求组装、`bias_presets` 编辑器与 `calculateLogitBias`、logprobs 请求字段与三个响应解析器；`generation-service.js` 的 `messageLogprobs` 累积与 `parseAndSaveLogprobs`/`parseTokenCounts`/`additionalPromptStuff` itemization 推送；`script.js` 的模块导入、shell 条目、启动挂载与 delete/move/load 接线；`message-service.js` 的 `updateMessageItemizedPromptButton`；`chat-ops-service.js`/`chat-branch.js`/`dom-handlers.js` 的 itemized 持久化/删除接线；`custom-request.js` 的 bias preset 一致性补丁；后端 `/bias` 路由与其 tokenizer imports、`bodyParams.logprobs` 透传；`power-user.js` 的 `BIAS_CACHE`/`request_token_probabilities` 绑定；`style.css`/`mobile-styles.css` 的 logit_bias/logprobs/#movingDivs/tokenItemizing 规则。
- **数据策略**：`oai_settings.bias_presets`/`bias_preset_selected`、`power_user.request_token_probabilities` 存量键惰性保留（settings merge 不覆写未知键）；per-chat itemized-prompt IndexedDB/文件数据留存为惰性历史数据；`itemizedPrompts` shell getter 与模块导出保留为空数组（第三方读契约），`ITEMIZED_PROMPTS_*` 事件类型常量保留在 `event_types`（不再发射）。
- **保留**：`AudioPlayer`（`extra.media` 音频附件渲染，计划豁免项）；`.mes_bias`/`biasHtml` 消息 bias 渲染（`{{bias}}` 宏写入的消息正文，与 logit-bias 无关）；`user_prompt_bias`/`show_user_prompt_bias`（同名无关功能）；React main-chat `promptButtonVisible`/`hasItemizedPromptForMessage` 投影契约（读惰性空数组，随用户 WIP 保留接线）。
- **测试翻转**：`config-drawers-react-surface` 移除 logprobs viewer case 与 dynamic-output 断言；`ai-config-react-surface`/`options-menu-react-surface`/`chat-workspace-structure`/`react-runtime-boundary` 移除对应 ID/调用断言；`script-js-reverse-import-contract` 移除三个模块条目并更新 `chat-branch.js` 导入面；`vector-retirement`/`group-chat-retirement` 移除对已删文件的 readFileSync 断言。
- **文档**：`page.settings` 新增 retired sampler state 条目；`page.chat_workspace` 新增 retired token-inspection state；docs bundle 重建。
- **验证**：lint+tsc 净；focused 10 suites/82 tests 绿；compat 8 suites/110 tests 全绿；unit 59 suites/555 tests 全绿；React/workspace-panels 构建与 docs:check/docs:build 通过。
- **Commit**: `06f81b2e6`。

### B-cut-14b: scrapers + themes + search + classify（外部内容/主题管线退役）

**R0 裁决**：四者均为外部内容获取与 UI 主题管线——内置 Data Bank scrapers（Notepad/网页抓取/转录）、`power_user.theme` 主题 preset 系统与 `/theme` slash command、`/api/search/*`（SerpApi/Tavily/Serper + visit/transcript）、`/api/extra/classify` 的 transformers feature-extraction 管线。全部退役端点经新增 `utilityFeatureRetirementRouter`（`src/endpoints/feature-retirement.js`）回稳定 410 JSON；旧 URL 重定向（`/savetheme`→`/api/themes/save`、`/api/serpapi/*`→`/api/search/*`）保留并落到同一 tombstone。`initSettingsSearch` 为设置面板内搜索，与外部搜索无关，保留。

- **删**：`src/endpoints/themes.js`、`src/endpoints/search.js`、`src/endpoints/classify.js`、`src/transformers.js` 整文件；`public/scripts/scrapers.js` 的内置 scraper 实现（仅保留 `ScraperManager` 注册表作 `st-context` `registerDataBankScraper` 兼容桩）；`templates/theme{Delete,ImportWarning}.html`；`power-user.js` 的主题 preset CRUD/`applyTheme`/`#themes`/`ui-preset-*` 接线与 `/theme` slash command、`themes` settings 消费；`PowerUserPanel` 的 `UI-presets-block`（主题选择器+导入导出删除按钮）；`SettingsSurface`/`settings-helpers` 的 `userInterface.theme` 绑定与 Themes 统计条目；`index.html` 的 `#websearch_container` 死挂载点；`preset-manager.js` 的 `enable_web_search` 排除键；`secrets.js`（前后端）的 SERPAPI/TAVILY/SERPER 键与 friendly names；`settings.js` `/get` 的 `themes` 目录聚合字段；`default/content/index.json` 的 5 条 theme 条目与 `default/content/themes/` 目录；`power_user` 默认对象与 `default/content/settings.json` 的 `theme` 死键。
- **数据策略**：存量 `power_user.theme`、用户 `themes/` 目录、已存 secrets 惰性保留（merge 回写不丢键）；`directories.themes` 与 `CONTENT_TYPES.THEME` 保留为被动映射（历史目录 + `getContentOfType('theme')` 优雅返回空）；`/api/themes|/api/search|/api/extra/classify` 410 tombstone 保路由形状。
- **保留**：`ScraperManager` 注册表（第三方 `registerDataBankScraper` 不崩）；`applyThemeColor` 等 UI Colors 单项设置（themeElements 存活面，非 theme preset）；`stscript.autocomplete.style` 的 `'theme'` 值（同名无关项）；settings/character-library/world-info 面板内搜索。
- **测试翻转**：`canonical-settings-store` 移除 `themes` 目录聚合断言；`settings-react-route` 的 `theme` schema 断言翻转 + 稀疏保存用例改用 `chatWidth`、merge 断言改验历史 `power_user.theme` 保留；`power-user-react-surface` 移除主题控件 ID；`vector-retirement` 的 `transformers.js` 断言改为 `existsSync === false`。
- **文档**：`page.settings` 移除 theme 条目与 `themes` 聚合字段说明；docs bundle 重建。
- **验证**：lint+tsc 净；focused 7 suites/62 tests 绿；compat 8 suites/110 tests 全绿；unit 59 suites/555 tests 全绿；React/workspace-panels 构建与 docs:check/docs:build 通过。
- **Commit**: `9e76c90a2`。

### B-cut-14c: welcome-screen（欢迎屏/角色管理快捷面板退役）

**R0 裁决**：welcome screen 是空会话时注入 `#chat` 的产品欢迎面板（版本信息、扩展/Discord/文档链接、最近角色卡片快捷入口），兼挂「永久助理」角色（`openPermanentAssistantCard`/`newAssistantChat` 的 temporary 分支）。面板实现横跨 legacy（`welcome-screen.js` 渲染 + `welcome.html`/`welcomePrompt.html` 模板）与 React（`WelcomePanel` + `welcome-panel.styles`），并占住 main-chat store 的 `welcome` snapshot/投影字段。全部随本批退役；角色库快捷入口改为直接打开 workspace character drawer，会话生命周期与角色管理主路径不受影响。无独立 HTTP 端点，不需要 410 tombstone。

- **删**：`public/scripts/welcome-screen.js` 整文件；`app/components/welcome/WelcomePanel.tsx`、`app/styles/welcome-panel.styles.ts`；`templates/welcome.html`、`templates/welcomePrompt.html`；`script.js` 的 welcome 导入/shell 暴露/`MainChatWelcomeSnapshot` 接线/启动初始化/`displayVersion` 导出消费；`main-chat-store.ts` 的 `welcome` snapshot 类型与输入归一化；`main-chat-store-projection.js` 的 welcome 投影；`system-messages.js` 的 `WELCOME`/`WELCOME_PROMPT`/`ASSISTANT_MESSAGE` 类型与对应系统消息；`dom-handlers.js` 的 `openPermanentAssistantCard` 与 `option_select_chat` 分支、`newAssistantChat` temporary 判定坍塌为无参调用；`chat-ops-service.js`/`delete-character-preflight.js` 的 `suppressWelcomeScreen` 钩子；`chat-route-service.js` 的 welcome 分支；`workspace-panels.tsx`/`RightNavPanel`/`CharacterLibraryPanel`/`CharacterLibraryCharacterRow`/`character-library-row-helpers` 的 welcome 面板契约；`index.html` 的 welcome 挂载点；`seed-dev-environment.mjs` 顺带移除对已删 theme 文件的 `seedThemes()` 拷贝（B-cut-14b 遗漏，修复 e2e 启动 ENOENT）。
- **数据策略**：无专属存量数据——欢迎屏为纯运行时渲染；`system_message_types` 中被删枚举仅影响新消息生成，历史聊天中的 welcome 系统消息按普通消息渲染。
- **保留**：workspace character library/drawer 与角色管理全路径；`newAssistantChat` 助理会话创建本身（仅去 welcome 分支）；JS-Slash-Runner vendored 的 `$('#chat > .welcomePanel')` DOM 探测（永远为假的兼容检查，受保护面不动）。
- **测试翻转**：删 `welcome-panel-structure.test.js`；`welcome-screen-character-management.e2e` 的 welcome 分支断言翻转为 drawer 直达契约；`group-chat-retirement`/`script-js-reverse-import-contract`/`interaction-performance-delete` 移除 welcome 条目与导入面。
- **文档**：`page.chat_workspace` 语义条目移除 welcome 面板描述；docs bundle 重建（30 文档）。
- **验证**：lint+tsc 净；focused、compat 8 suites/110 tests、unit 58 suites/551 tests 全绿；React/workspace-panels 构建与 docs:check/docs:build 通过；e2e 独立端口验证 `welcome-screen-character-management`/`vector-retirement`/`settings` 全绿（广域运行中 `chat-message-list-walkthrough` sprint-2 的 `.mes_reasoning_edit` 点击拦截失败归因为工作区未提交的 `.extraMesButtons` 浮动菜单 WIP，与本批无关；`settings.e2e` 的 Theme→Custom CSS 重定向与 fullyParallel 竞态加固见 `2410a3d66`）。
- **Commit**: `da616937f`。

### B-cut-15: quick-reply（快捷回复扩展退役，`/qr*` 兼容桩）

**R0 裁决**：quick-reply 是唯一仍存活的首方大扩展（372K，18 个 `/qr*` 命令 + `/import` + 别名、`quickReplyApi`/`executeQuickReplyByName` 全局、auto-exec 事件钩子、按钮/右键 UI、React 编辑器/设置面板、`/api/quick-replies` 存取端点）。按计划倾向采用 stub 方案：命令注册保留并回执 "feature removed"，而非整删制造 unknown-command 破坏面。`/qr-arg` 经核实为纯 `_scope.setMacro('arg::*')` 作用域宏写入器、与 QR 运行时零依赖——作为通用宏工具保留功能（`{{arg::}}` 宏测试与第三方 arg 注入不受影响）。

- **删**：`public/scripts/extensions/quick-reply/` 的 `src/`、`api/`、`style.css`、`style.less` 全部实现（QuickReplySet/QuickReply/Config/Settings/ContextLink/SetLink/AutoExecuteHandler/SlashCommandHandler/ButtonUi/SettingsUi/ctx 菜单）；`app/components/quick-reply/`（React 编辑器+设置面板）；`src/endpoints/quick-replies.js` 整文件，`/api/quick-replies` 挂载改接 `utilityFeatureRetirementRouter`（`/savequickreply`、`/deletequickreply` 旧重定向随之落到 410 tombstone）；`index.html` 的 `#qr_container`；`workspace-panels.tsx` 的 `mountQuickReplyEditor`/`mountQuickReplySettings`；`jsconfig.json` 的 quick-reply/lib 死排除项。
- **Stub**：`index.js` 重写为 ~120 行兼容桩（manifest.json 保留、去 `css`）：全部退役命令名+别名注册为抛错 `Quick Replies functionality has been removed from EmberDesk.`；`quickReplyApi` 惰性面（list*→[]、get*→null、mutator/executor→抛错）；`executeQuickReplyByName` 抛同名回执；`didInit` 幂等防测试惰性二次注册。
- **数据策略**：`QuickReplies/` 用户目录、`default/content/presets/quick-replies/Default.json` 与 `index.json` 条目、`extension_settings.quickReply`/`quickReplyV2` 键、`chat_metadata.quickReply`、`settings.js` 的 `quickReplyPresets` 聚合、`content-manager.js` 的 `QUICK_REPLIES` 类型、`user-migrations.js` 迁移全部惰性保留（对齐 movingUI 先例：死数据不主动清）。
- **保留**：`/qr-arg`（纯 scope 宏工具）；`SlashCommandParser`/`world-info.js`/`slash-commands.js` 的 `quickReplyApi`/`executeQuickReplyByName`/`qrEnumProviderExecutables` 防御性 globalThis 读取（stub 使其优雅降级）；`extensions.js` 的 `quickReply: {}` 惰性默认值；JS-Slash-Runner vendored 的 `quickReplyV2.isCombined` 读取。
- **测试翻转**：删 `quick-reply-react-surface.test.js`；`group-chat-retirement` 的 QR 文件断言翻转为 `existsSync === false` + stub 源码断言；`script-js-reverse-import-contract` 移除 4 条 QR 条目；`MacroSlashCommands.e2e` 辅助函数改为惰性调 stub `init()`（deferred 扩展激活竞态修复）。
- **文档**：`feature.extension_panel_open` 的第三方扩展示例移除 Quick Reply；docs bundle 重建（30 文档）。
- **验证**：lint+tsc 净；focused 4 suites/46 tests + unit 58 suites/551 tests + compat 8 suites/110 tests 全绿；workspace-panels/React 构建与 docs:check/docs:build 通过；e2e 探针验证 stub 激活、`/qr-list` 回执、`/qr-arg` 功能、`/api/quick-replies`+legacy redirect 410；`MacroSlashCommands.e2e` 12/12 通过（独立端口）。
- **Commit**: `2c0a998da`。
