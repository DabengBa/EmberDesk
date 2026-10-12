---
created: 2026-10-12
source: audit
confirmed: true
last_updated: 2026-10-12
feature_slug: legacy-asset-cleanup
status: delivered
---

# 遗留资产清理方案（2026-10-12 审计基线，评审修订 v2）

> 依据 `legacy-asset-governance` 审计产出的 Confirmed/Gap 结论整理，已经过一轮对照源码的评审修订（v2 补齐 Batch 2 测试改线清单、收敛门禁口径、补 Batch 3 验证）。本方案只做退役残留与孤儿资产清理，不新增功能、不改动兼容契约面。每批一个 commit、可独立回滚。

## 1. 审计证据基线

| 证据通道 | 结论 |
|---|---|
| `src/` / `public/scripts/` **运行时**反向引用图（静态 import/字符串引用扫描，测试引用不计入"零引用"判定） | 4 个运行时零引用源码文件：`additional-headers.js`、`ThemeGenerator.js`、`f-localStorage.js`；另 `react-feature-flags.js`/`react-settings-feature.js` 运行时零导入但仍有测试引用 |
| 端点挂载表（`server-startup.js:121-152`） | 24 存活路由 + 7 个干净 tombstone，无假删除路由面 |
| `default/config.yaml` ↔ `getConfigValue` 消费扫描 | 4 个死配置键 + 2 个死配置块 |
| `package.json` 依赖 ↔ 源码引用扫描 | 9 个 direct deps 零引用 |
| 默认内容播种链（`default/content/index.json` → `content-manager.js`） | 34 个退役类型文件仍在播种 |
| 运行时 spot proof | `import('./plugins.js')` → `ERR_MODULE_NOT_FOUND`（CLI 实测断裂） |
| 未执行 | live 410 穿透验证、依赖删除后全量回归 —— 列入 Gap |

## 2. 目标状态

| 维度 | 当前应有 | 必须消失 | 兼容保留 |
|---|---|---|---|
| 服务端 | 存活 router、tombstone、服务模块 | 零导入死模块 | 410 tombstone、deprecated→tombstone 重定向 |
| 前端脚本 | 入口可达的模块 | 零引用文件、悬空类型声明 | `group-chats.js` 等 410 facade、`login-shared`/`setup-shared` |
| 配置 | 有消费方的键 | 无消费方的键（`default/config.yaml`） | 存量用户 config.yaml 中的旧键（惰性、不写死删） |
| 依赖 | 有 import 的 direct deps | 零引用 deps | `@types/*` 与构建工具不在本批范围 |
| 默认内容 | 活跃类型播种 | 退役类型条目+文件+枚举臂 | 已播种到存量用户目录的文件原地不动 |
| 仓库根 | 源文件/文档/入口 | 会话产物、孤儿截图/图标 | DESIGN.*、start.sh、docker/、部署清单 |
| 服务端插件 | `plugin-loader`/`plugin-updater` 运行时 | — | CLI 需先裁决（C0） |

## 3. 门禁口径：风险裁剪版 R-loop

本清理是**资产清理的风险裁剪版 R-loop**，不完整套用 `feature-retirement-workflow.md` 的全部规则：

- **适用**：数据永留、目录映射保留、tombstone/facade 不动、测试翻转（钉"不存在"/"正确新宿主"）、一批一 commit、R6 台账+PROJECT_HISTORY 行。
- **不适用**：第三方扩展契约面规则（`third-party/`、`@sillytavern/*`、`getContext()`、`st-context` 兼容条款）——该面已随扩展体系退役，本次不触碰也不受它约束；`test:compat` 仅在改动文件落入其断言面时必跑。
- **逐批门禁**（每批固定执行，不再写"必要时"）：

| 批 | 必跑门禁 | 裁剪理由 |
|---|---|---|
| C0 | `pnpm run lint` + `plugin-updater.test.js` + §C0 隔离 clone 验证 | 纯服务端 CLI，无浏览器面 |
| Batch 1 | `pnpm run lint` + `pnpm run test:unit` 全量 + `pnpm run docs:check` + 启动冒烟 | 零引用文件删除，无运行时行为变化 |
| Batch 2 | `pnpm run lint` + `pnpm run test:unit` + `pnpm run test:integration` 全量 + 聚焦 `chat-workspace-structure`/`world-info-card-rendering`/`settings-react-route`/`react-workspace-panels-helpers` | 改测试文件 + 服务端模块/配置；integration lane 覆盖文件系统与路由测试 |
| Batch 3 | `pnpm run lint` + 新增播种集成测试 + `pnpm run test:unit` + `pnpm run test:integration` 全量 + 全新 dataRoot 首启冒烟 | 播种是文件系统行为，需直接证明 |
| Batch 4 | `pnpm install --frozen-lockfile` + `pnpm run test:unit` + `pnpm run test:integration` 全量 + `build:lib`/`build:react`/`build:react:workspace-panels`/`build:react:character-library` + 启动冒烟 | 依赖变更需构建与全量回归 |

## 4. 批次计划

### C0 前置：`plugins.js` 断裂修复（独立 commit，不阻塞 Batch 1-3）

**现状**：`plugins.js:12` 顶层导入 `./src/git/client.js`（该文件在 `5a3c46484` 被有意删除，`tests/extension-retirement.test.js:138` 钉死其不存在）。实测 `import('./plugins.js')` → `ERR_MODULE_NOT_FOUND`，`pnpm plugins:update`/`plugins:install` 必崩。

**方向（评审确认）**：修复而非退役——用已导入的 `simple-git` 替换 `createGitClient`，与 `plugin-updater.js` 的现存用法一致：

- `plugins.js:12` 删除 `createGitClient` import 与 `plugins.js:18` 的 `EMBERDESK_GIT_BACKEND` env 分支（该 env 是已删除抽象的选择器）。
- `plugins.js:84-96` 的 `installPlugin` 改为 `git().clone(pluginName, pluginPath, ['--depth', '1'])`。
- 文案措辞：plugins.js 是"仓库提供的安装命令入口"；`plugin-loader` 同时支持手工放入 `plugins/` 的目录或顶层文件，CLI 并非唯一下线途径。

**验证**（修正后）：

- `node plugins.js`（无参）输出 usage 且**退出码为 1**（`plugins.js:27` 的预期行为，不是 0）。
- 隔离 clone 验证：用 `git init --bare` 在临时目录建本地裸仓库作为"远端"，执行 `node plugins.js install <裸仓库路径>`，断言插件目录生成且含期望文件。**不得对真实已安装插件或远端仓库执行验证**。

### Batch 1：纯孤儿资产删除（零引用、零测试钉住、无行为面）

**删除形状**：整删文件，无调用方迁移、无契约变更。已复核 `tests/` 对以下文件全部零引用（含 `global.d.ts` 的 `quickReplyApi`）。

| 删 | 证据 |
|---|---|
| `public/scripts/util/ThemeGenerator.js`（322 行，`/bgcol` 调色板引擎） | 运行时零引用；消费方随 Background Library 退役 |
| `public/scripts/f-localStorage.js`（41 行 deprecated 包装） | 运行时零引用 |
| `public/sounds/message.mp3`、`public/sounds/silence.mp3` | 音效功能已退役；`sounds/` 全仓零引用 |
| `public/st.ico`、`public/st-launcher.ico` | Windows 启动器图标；`.bat` 启动器已在 `eb984cd82` 删除 |
| `docs/ux-walkthrough-ext-host/`（6 张截图） | 已退役 Extensions Host 的 walkthrough 素材，零引用 |
| `audit.md`、`current-page.png`、`wi-fix-cards-visible.png`、`artifacts-chat-desktop.png`、`artifacts-chat-mobile.png` | 根目录混入的会话产物（`audit.md` 还引用已删除的 `public/login.html`） |
| `public/global.d.ts:165` 的 `quickReplyApi` 声明 | 悬空 `import('./scripts/extensions/quick-reply/index.js')`（模块已删） |

**验证**：见 §3 门禁表。启动冒烟确认首屏无 404/console 错误。

### Batch 2：死模块与死配置链（含完整测试改线清单）

**删除形状**：删实现 + 删默认配置声明 + 测试改线。

**删（源码与配置）**：

- `src/additional-headers.js`；`default/config.yaml:330-340` 的 `requestOverrides` 键与注释块。
- `src/react-feature-flags.js`、`src/react-settings-feature.js`；`default/config.yaml:154-157` 的 `features.react` 块（`pages`/`panels` 空键 + 注释）。
- `default/config.yaml` 中零消费键：`openai.captionSystemPrompt`（353-354）、`deepl.formality`（355-358）、`ollama.keepAlive`/`ollama.batchSize`（364-374）。

**测试改线（删 / 改线 / 保留，按评审核实补全）**：

| 测试位置 | 当前形态 | 处置 |
|---|---|---|
| `tests/chat-workspace-structure.test.js:31,38` | `readRepoFile('src/react-feature-flags.js')` + `not.toContain('features.react.shell')` | **改线**：删除该文件读取；把 `features.react.shell` 缺席断言改钉到 `src/workspace-react-features.js`（仍存活）或直接删除该断言——`features.react.*` 命名空间整体消失后此断言无对象 |
| `tests/world-info-card-rendering.test.js:351,354-355` | 读 `react-feature-flags.js` 并断言含 `panelName === 'characterAuthoring' \|\| panelName === 'worldInfo'` | **删除**：sole-owner 语义已由同测试 `:356` 的 `bridge` 断言（`worldInfo: true`）覆盖，无需找新宿主 |
| `tests/settings-react-route.test.js:79,90` | helper `createSettingsRouteApp` 动态 import `react-settings-feature.js` 并返回 `featureModule` | **改线**：helper 删除该 import 与 `featureModule` 返回字段 |
| `tests/settings-react-route.test.js:867,898` | `featureModule.isReactSettingsEnabled()` 两处断言 | **删除**：模块不存在则断言无对象；**保留**该 suite 的 302/503/200 路由与静态资源服务断言（不得以"构建存在性"之类的弱断言替代） |
| `tests/react-workspace-panels-helpers.test.js:9,46-47,73-75` | 已从 `public/scripts/workspace-panels-react-bridge.js` 导入 `isReactWorkspacePanelEnabled` | **保留不动**（评审修正：此迁移已完成，brief v1 描述有误） |

**保留**：存量用户 `config.yaml` 中的同名键惰性存在、不主动归一化；`PROJECT_HISTORY` 中的历史行不改（doc-compiler 不校验反引号文件路径）。

**验证**：见 §3 门禁表。

### Batch 3：退役类型默认内容播种收敛

**删除形状**：index 条目 + 文件 + 类型枚举臂，三层同步删。

- **删** `default/content/index.json` 条目与对应文件：`Default_Comfy_Workflow.json`、`Char_Avatar_Comfy_Workflow.json`（type `workflow`）、`presets/kobold/*`（6 个，`kobold_preset`）、`presets/novel/*`（24 个，`novel_preset`）、`presets/moving-ui/Default.json`（`moving_ui`）、`presets/quick-replies/Default.json`（`quick_replies`）。
- **删** `src/endpoints/content-manager.js` 的 `CONTENT_TYPES` 对应枚举（`64-69`）与 `getUserTargetByType`/`getScopeByType`/`resolveTarget` 中对应 case 臂（`349-385` 一带）。
- **R0 结论（评审已核实关闭）**：`/api/content/importURL`、`/importUUID` 走独立外部内容分类链（`EXTERNAL_CONTENT_DOWNLOADERS`），不依赖这五种播种枚举；枚举可随条目一并删。
- **保留**：存量用户目录中已播种的同名文件不动（数据永留）；`comfyWorkflows` 等目录映射不动。

**必须新增的聚焦集成测试**（评审要求：现有测试只 mock `checkForNewContent`，且该函数 catch 错误仅打日志——"服务器能启动"≠"播种成功"）。用临时 dataRoot + 真实文件系统断言：

1. 新用户播种后目录中**不含**任何退役类型文件（34 个清单逐项断言不存在）；
2. 活跃默认内容仍正常播种（settings/character/world/avatar/openai_preset/error_page/stylesheet 逐类型断言存在）；
3. 预置了退役文件的"存量用户"目录在播种前后文件内容**逐字节不变**；
4. 重复执行 `checkForNewContent` 幂等（无新增、无改写、无报错日志）。

**验证**：见 §3 门禁表；外加全新 dataRoot 首启冒烟，确认用户目录不再出现死文件且启动日志无 content-check 告警。

### Batch 4：依赖瘦身

`pnpm remove` 以下 direct deps（静态零引用，逐一经源码扫描确认）：

| 依赖 | 原消费面（均已退役） |
|---|---|
| `sillytavern-transformers` | 本地向量嵌入 |
| `isomorphic-git` | 扩展安装器（`src/git/client.js` 已删） |
| `wavefile` | TTS 音频处理 |
| `bing-translate-api`、`google-translate-api-x` | 翻译端点 |
| `iconv-lite`、`html-entities`、`form-data` | 编码/转义/多端上传工具（SD/horde 时代） |
| `cookie-parser`（连带 `@types/cookie-parser`） | 旧 auth cookie 解析（现为 cookie-session） |

**删前检查**：`pnpm ls <dep>` 确认无 workspace 内间接声明；`sillytavern-transformers` 复核无 worker/动态 require 路径（`briefs/260715-01` 的"误伤分类/图片描述/语音"警示已失效——三个消费面其后均退役）。删除后须以 §3 门禁表的全量构建+回归为准，静态零引用不构成单独放行依据。

### Batch 5（独立后续，本方案不承诺）：`/lib.js` 导出审计

`public/lib.js` 是 freeze-supported 边界。第一方消费方退役后，哪些 vendored 导出（readability/popper/localforage 等）已无调用方需专项逐符号扫描，属 Gap——不作为本方案批次，建议另立审计。

## 5. Gap / 需裁决清单

| 项 | 阻塞原因 | 建议 |
|---|---|---|
| `Remote-Link.cmd`、`replit.nix` | 功能完整的 Windows/Replit 平台资产，无文档引用；是否仍是支持平台需产品裁决 | 确认目标平台清单后决定去留 |
| `artificial-analysis-models.csv`（未跟踪） | 28 行模型基准表，疑似调研会话产物 | 由 owner 决定移出仓库或删除；非本清理必要交付 |
| `docs/presets/Latest-1st-output-contract.md`（未跟踪） | 派生文档，内容未经审阅 | 由 owner 审阅后自行决定是否入库；不属于本清理范围 |
| tombstone live 穿透验证 | tombstone 位于 `requireLoginMiddleware` 之后，需登录态实测 | 部署环境 curl 各 tombstone 路径确认 410 JSON body |
| `.tmp/`（868MB） | gitignored 会话工作区，非仓库资产 | 由 owner 择机本地清理，不进入版本动作 |

## 6. 验收标准（签收清单）

- [x] C0 修复独立 commit，隔离 clone 验证通过，`plugins.js` 处于一致可用状态
- [x] Batch 1-4 各自单 commit，§3 门禁表所列项全绿（integration lane 剩 5 个 HEAD 预存失败，见 §9）
- [x] 被删对象无运行时、构建、类型及测试层面的悬空引用；`.docs/` 历史记录与 ledger 中的文件名保留属正常
- [x] Batch 3 新增播种集成测试通过，且全新 dataRoot 冒烟实测确认无死文件
- [x] 存量用户数据零改动（本批仅删仓库内默认文件与配置模板，不触碰任何 dataRoot 内容）
- [x] `.docs/PROJECT_HISTORY.md` 已同步；ledger 无 verdict 变更（全部为已 `retired` 行的残留物清理，无新裁决），`.docs/db` 无行为面变化
- [ ] live 410 穿透验证仍为 Gap（需登录态部署环境实测）

## 7. 回滚

每批独立 commit，单批回退 `git revert <sha>` 即可；默认内容播种项删除后如需恢复，`git revert` 会同时还原 `index.json` 条目与文件。存量用户目录中的已播种文件不受任何回滚影响。

## 8. 执行记录（2026-10-12，5 个 commit）

| 批 | commit | 门禁结果 |
|---|---|---|
| C0 | `3f7df4926` fix(plugins) | `simple-git` clone 替换已删 `src/git/client.js` 抽象；本地裸仓库隔离 install 实测通过；usage 退出码 1 符合预期 |
| Batch 1 | `a736779eb` chore(assets) | 删 `ThemeGenerator.js`/`f-localStorage.js`/2 sounds/2 icons/6 张 ext-host 截图/5 个根目录会话产物/`global.d.ts` 悬空声明；unit 605 全绿、docs:check 通过、8123 冒烟通过 |
| Batch 2 | `ba53936f8` chore(legacy) | 删 3 个死模块 + 5 个死配置块/键；4 处测试改线 + 评审遗漏的 `character-library-react-panel-flag.test.js` 翻转断言（钉 `react:`/`panels:` 消失） |
| Batch 3 | `ce3acf24d` chore(content) | 删 34 个退役类型默认文件 + `index.json` 条目 + `CONTENT_TYPES`/`getUserTargetByType` 对应臂；新增 `default-content-seeding.test.js` 4 断言全过；全新 dataRoot 冒烟仅播种 10 个活跃项 |
| Batch 4 | `0469925bd` chore(deps) | `pnpm remove` 10 包（含 `@types/cookie-parser`），裁剪 149 包；`build:lib`/`build:react`/lint/tsc 全绿 |

### 执行期新发现（超出审计/评审清单）

- **`scripts/seed-dev-environment.mjs` 是漏网消费方**：`seedBootstrapContent` 硬编码复制已删的 `presets/quick-replies/Default.json`，被 `seed-dev-environment.test.js` 在 integration lane 暴露。已删除该复制步骤；测试中 `QuickReplies/Default.json` 断言翻转为钉"不播种"。
- **`character-library-react-panel-flag.test.js` 需补充改线**：其 `:47` 断言 `default/config.yaml` 含 `panels:`，删 `features.react` 块后翻转为钉缺席。

### HEAD 预存 integration lane 失败（与本清理无因果；已在 `fb62fe65b` 修复）

以下 5 个失败断言在 `HEAD fc062359e` 的未修改版本中逐字存在，属退役 commit 未同步的 stale 断言（integration lane 此前未在 unit 全量中执行，故长期未暴露）。修复时又暴露 3 处被前置 throw 掩盖的同类断言（`custom_css`/`instruct`/`context` 两处 merged 块 + 第二处 `custom_css`），一并按 strip 契约翻转：

| 测试 | 失败点 | 归属 commit |
|---|---|---|
| `settings-react-route.test.js` ×3 | `:126` `isSettingsFormReady` const 断言（route 源码已重构）；`:442` 读已删 `app/components/ai-config/AiConfigPanel.tsx`（ENOENT）；`:739` `saved.power_user.instruct` 字段形状 | `8a126bee3`/`1c4bc97a2` |
| `world-info-card-rendering.test.js` ×1 | `:256` 期望 `ai-config-button` 在顶部抽屉列表（已退役移除） | `8a126bee3` |
| `world-info-react-surface.test.js` ×1 | `:75` 查找 `mountWorldInfoPanel(),` 逗号语法（现为 `measureStartupStage` 包装） | `fc062359e` |

修复结果（`fb62fe65b`）：integration lane 880/880、unit lane 605/605，工作树首次零失败基线。

## 9. 评审修订记录（v2）

- Batch 2 补齐测试改线清单：`chat-workspace-structure.test.js:31`、`world-info-card-rendering.test.js:351-355`、`settings-react-route.test.js:73-90` helper；修正"`react-workspace-panels-helpers.test.js` 需迁移"的错误描述（该测试已在 client bridge 上）。
- §3 明确为风险裁剪版 R-loop，逐批列必跑门禁与裁剪理由，剔除已不适用的第三方扩展契约规则。
- Batch 3 新增强制播种集成测试（4 条断言方向）；import 分类链 R0 疑问经核实关闭。
- C0 验证口径修正：usage 预期退出码 1；新增本地裸仓库隔离 clone 验证；标注不阻塞 Batch 1-3。
- 修正"零引用"口径为运行时扫描口径；删除对 `Latest-1st-output-contract.md` 的入库建议；调整"被删文件名消失"验收措辞为"无悬空引用"。
