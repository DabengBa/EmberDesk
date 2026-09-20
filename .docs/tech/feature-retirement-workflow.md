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
- **Commit**: 待提交。
