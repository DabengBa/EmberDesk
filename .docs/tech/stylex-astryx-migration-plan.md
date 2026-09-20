# StyleX + Astryx 统一迁移与 Legacy 清理计划

## 模块职责

本文档定义 EmberDesk 前端样式体系收敛到 **StyleX**（编译期原子 CSS）与 **Astryx**（Meta React+StyleX 设计系统）的终态，以及把所有 legacy `public/` UI 面和 `app/` 存量 Tailwind 迁入该终态的分波次执行计划。它是 [react-modernization-roadmap.md](react-modernization-roadmap.md) 和 ADR-0012 legacy-retirement program 的下游执行计划，不改变产品语义；用户界面行为仍由 `.docs/db/` 拥有。

## 状态

状态：计划已批准（2026-09-16）。StyleX 与 Astryx 已定为样式与组件终态；其余模块配合修改。
前置条件：群聊/group-authoring、全局 Background Library、Expressions/waifu 退休已合并进 `csp-dev-techupgrade`。

## 终态定义

- 所有用户可见 UI 由 **React + Astryx 组件 + StyleX 原子样式**持有。
- `app/` 内 Tailwind 清零，`tailwindcss`/`@tailwindcss/postcss`/`postcss` 依赖卸载。
- `public/` 只剩：薄启动壳 HTML、`eventSource`/`event_types`/`globalThis.SillyTavern` 契约、第三方扩展宿主、`public/lib.js` 边界、静态资源。
- 主题系统保留运行时真相源（`--SmartTheme*` CSS 变量 + `themes/*.json` + 用户自定义 CSS）；Astryx theme 层只做单向映射，不接管运行时主题。
- `script.js` 降为 bootstrap 编排与契约导出模块。

## 红线（永不迁移/永不改）

- `globalThis.SillyTavern` context、`eventSource`/`event_types`、`@sillytavern/*` 导入边界、`public/lib.js`。
- character-list selectors（`.character_select`、`data-chid`、`id="CharID${chid}"` 等）与扩展注入容器——第三方契约。
- `public/scripts/extensions/third-party/` 及其 DOM 契约。
- 用户自定义 CSS 功能（`public/css/!USER-CSS-README.md`）与 `themes/*.json` 文件格式。
- Data Maid 历史文案、`groups`/`group chats` 历史数据面、已退休产品面不重开。

## Phase 0 — 地基（零产品行为变更）

| 任务 | 内容 | 验收 |
|---|---|---|
| 0.1 StyleX 接入 | `@stylexjs` unplugin/babel 挂进全部 Vite mode（lib / login / character-library-panel / workspace-panels） | 各 mode 构建通过、含原子 CSS、产物可被现有 serve 链消费 |
| 0.2 Astryx 安装 | `@astryxdesign/core` + theme 包 pin 固定版本；smoke 组件渲染验证 | 组件渲染、tsc 通过、产物体积可接受 |
| 0.3 Token 桥 | `app/lib/theme-tokens.ts`：`--SmartTheme*` → Astryx theme var 单向映射；运行时主题切换与用户 CSS 覆盖不回归 | 主题切换 smoke 通过 |
| 0.4 门禁 | ESLint：`app/` 禁止新增 Tailwind class 与新 `.css` import（StyleX 产物除外）；本计划引用的 ADR/brief 落档 | lint 对增量拦截 |
| 0.5 契约清单 | 冻结禁止触碰的 selectors/DOM/事件清单 → 负断言测试 | 契约测试绿 |

## Phase 1 — `app/` 存量原子转换（一次做完）

- 范围：`settings-surface.css`（~666 行）、`tokens.css`、`globals.css`、各 tsx 的 Tailwind className（`workspace-panels.tsx`、`world-info-workbench.tsx`、`MainChatMessageRow.tsx`、`SettingsSurface.tsx`、character-library 组件等）。
- 表单/Field/Dialog/Select 类优先换 Astryx 组件；布局与定制样式走 `stylex.create()`。
- 验收：视觉等价（建立最小 screenshot 断言）、现有测试全绿、tailwind/postcss 依赖卸载。

## Phase 2 — Legacy 面迁移（分波次，每面同一 playbook）

每个面的固定流程：

1. **契约冻结**：该面对外暴露的 DOM selectors / 事件 / API → 负断言测试。
2. **React + Astryx/StyleX 新实现**（走现有 workspace shell 挂载机制）。
3. **接管 + legacy 面 tombstone/hidden 双跑**。
4. **删除** legacy 实现 + 对应 CSS + orphan locale keys。
5. **门禁**：unit / integration / compat / e2e smoke / tsc / scoped eslint / diff --check / docs:check 全跑。

| 波次 | 面 | 状态 |
|---|---|---|
| A 低风险 | power-user 设置抽屉（React `/settings` 已是 sole owner）、persona 管理 UI、welcome screen、chat-backups UI、data-maid UI、小配置抽屉 | 完成（待用户验收） |
| B 核心编辑 | PromptManager popup 群（`completion_prompt_manager_*`）、instruct/context settings、regex 编辑器、macros UI、tags 管理 UI | 完成（待用户验收） |
| C 纠缠面 | `world-info.js`（service/UI 拆分，World Info 面板已 React）、`extensions.js`（第三方 settings HTML 注入仅保留容器契约）、STscript/slash 编辑器 | 完成（待用户验收）。说明：`#WorldInfo` drawer markup 已 React 化，`world-info.js` 保留 service/动态行为所有权（160 函数 / 584 DOM 触点，深度拆分超出本波范围）；extensions 注入容器由既有 `ExtensionCompatibilitySlotManager` + React host bridge 持有，未重复迁移；STscript/slash 编辑器 = quick-reply 的 qrEditor/settings 模板已 React 化 |
| D 大骨头 | main-chat transport/generation 生命周期 + send form + message actions → `script.js` 瘦身 | **拆分为 D-core + D-remainder**。D-core = 仅发送表单（composer）迁移：React 持 `#form_create`/`#nonQRFormItems` 外壳，`send_textarea` 非受控（jQuery/QR/STscript/macros `.val()`+input 事件是契约），按钮走既有 `triggerVisibleGeneration`/`stopVisibleGeneration` command port，`Generate()`/prompt/streaming/中断恢复内部**不动**；options popper 与 stscript 按钮可作 hosted slot。D-remainder（Generate service 化、script.js 大瘦身、options 菜单、i18n 收敛）随 Phase X 再做 |

## Phase X — 收敛

- `index.html` 退役为薄启动壳；`data-i18n`/`t`` `宏给 React 侧等价实现。
- `public/css/` 归零路径：自写 css 随面删除；vendor css（fontawesome/select2/toastr/jquery-ui/cropper）逐个确认引用后删；`st-tailwind.css` 删除；`style.css` 拆分到归零。
- 主题收敛：`--SmartTheme*` + `themes/*.json` + 用户 custom CSS 保留为契约。

## 全局门禁（每个 merge 必跑）

`test:unit`、`test:integration`、`test:compat`、`tsc --noEmit`、scoped ESLint、`git diff --check`、`docs:check`；每面迁移带 e2e smoke；Phase 1 起建立 screenshot 对比断言。

## 风险清单

1. **Astryx beta**（公开 ~3 个月）：pin 版本、`swizzle` eject 兜底、token 层自控。
2. **script.js 启动顺序**：事件/hydration 顺序是隐性契约，拆分放最后并配启动探针。
3. **extensions.js 注入面**：第三方扩展向 DOM 写 HTML，该容器永远不 React 化，仅封装。
4. **source-contract 测试摩擦**：每删一面会有 stale 断言需同步更新。
5. **i18n**：`index.html` 1131 个 `data-i18n` 节点的 React 等价机制是隐藏大项，独立成任务。
6. **pnpm allowBuilds 门槛**：`pnpm-workspace.yaml` 的 protobufjs 占位导致 `pnpm run`/`install` 受阻；新依赖安装需要解开此门槛或等效手段。

## Phase 3 — Astryx 组件采纳 loop（2026-09-20 设计定稿）

目标：React 面 markup 中仍挂的 legacy utility class（`menu_button`/`text_pole`/`interactable`/`fa-solid` 等，RightNavPanel 53 处、ApiConnectionsPanel 27 处）与 legacy 面存量，逐批迁到 Astryx 组件；`style.css`/`public/css/` 随最后消费者删除收敛。

### 已批决策

- **视觉正常化**：接受 Astryx 默认外观，只保 DOM 契约（id/className/data-*/事件），不追求像素级还原。
- **范围含 legacy 面**：批次可将整个 legacy 面拉进 React+Astryx（React 化+Astryx 化同一批完成）。
- **tooltip 走 Astryx `tooltip` prop**：`BaseProps` 省略 `title`；adapter 把 `title`/`data-i18n="[title]…"` 映射为组件 tooltip prop，翻译值经 `app/compat/i18n.js` 的 `translate()` 在 render 时取（tooltip 不再是 DOM `title` 属性，observer 不适用）。
- **每批 e2e**：每批次必跑 focused jest + compat + tsc/lint + 该面相关 e2e + headless 冒烟。

### Phase 0a — adapter 基建（一次性）

- `app/components/contract/`：`ContractButton`/`ContractIconButton`/`ContractInput`/`ContractTextArea`/`ContractSelect`/`ContractCheckbox` 等薄包装——转发 `id`/`className`/`data-*`/aria/事件到 Astryx 组件（BaseProps 均支持透传），`title`→`tooltip` prop。
- theme bridge 扩展：spacing/radius/typography/motion token 映射（未定者用 Astryx 默认）。
- 契约分级清单（机械生成：grep tests/+public/ 得硬契约 = 委托事件/断言/扩展依赖的选择器；软契约 = 纯样式钩子，可删）。

### 每批 loop

1. **Inventory**：机械脚本列出该面全部元素的 contract attrs、命中 CSS 规则、绑定形态（委托/直接）、jQuery 变异点（innerHTML/val()/attr()）。
2. **Map**：元素→Astryx 组件映射表。**规则：legacy jQuery 代码会直接变异的元素（innerHTML 重写、`.val()` 注入、attr 翻转）保持 plain DOM + StyleX，不进 Astryx**——controlled 组件与外部 DOM 变异会打架。
3. **Migrate**：换 adapter 组件；残留样式进 `*.styles.ts`；跑 wave-6 死规则裁剪器删失去最后消费者的 CSS。
4. **Guard**：源契约测试改指新 owner；为 contract attrs 在新组件上的落点补断言。
5. **Verify**：focused jest + `test:compat` + lint/tsc + 该面 e2e + headless 冒烟（模块图零错误 + 真实交互路径）。
6. **Commit + 台账**：一面一提交；本文档执行记录追批次/裁剪数/契约验证。

### 批次排序（草案，开工时按依赖修正）

- **B0 pilot**：`export_format_popup`（最小面，验证 loop 机制 + ContractButton）
- **B1**：composer（`send_but`/`options_button`/stscript 组 → IconButton/TextArea；`send_textarea` 保持非受控 plain）
- **B2**：options menu / select-chat / character-popup（menu、dialog 形态 → DropdownMenu/Dialog）
- **B3**：api/ai-config 面板（TextInput/Selector/Switch 密集面）
- **B4+**：right-nav、settings、world-info、其余面板按依赖序
- **B-legacy**：剩余纯 legacy 面（React 化+Astryx 化同批）
- **收尾**：`style.css`/`public/css/` 归零路径不变（Phase X）

## 执行记录

- 2026-09-16：计划批准。Phase 0 启动。
- Phase 0 完成：StyleX unplugin 接入 workspace-panels / character-library / login 三个 Vite mode（lib 为纯 JS 边界不挂）；`@astryxdesign/core` 安装并接 `Theme` token 桥（`--SmartTheme*` 运行时变量仍是主题真相源）；各 panel bundle 的 CSS 资产由 bridge 显式 link；契约清单测试落地。
- Phase 1 完成：`app/` 存量 CSS/Tailwind 原子转换清零（settings surface、login、workspace-panels、character-library、wi-workbench 等）；`tailwindcss`/`postcss` 依赖卸载；`style.css` 中 React 自有块同步删除。
- Wave A 完成：chat-backups、data-maid、welcome panel、persona 管理抽屉、power-user `user-settings-block`（144 ID 保留）、floatingPrompt/cfgConfig/logprobsViewer 小抽屉全部 React 化；`flushSync` 保证 legacy 绑定立即可查。
- Wave B 完成：AdvancedFormatting、PromptManager popup、TagManagement、regex editor/settings/debugger/import-target、MacroBrowser（消息内 React 岛）全部迁移。
- Wave C 完成：`#WorldInfo` drawer markup → React（35 ID 保留，world-info.js 行为所有权不变）；extensions 注入容器维持既有 React host bridge + slot manager；quick-reply qrEditor/settings 模板 → React（全量 ID 一致，`qr--ctxItem` template 保留）。
- 验证基线：unit 622/622 绿、compat 107/107 绿、tsc 干净、workspace-panels bundle 构建通过。
- 2026-09-17：用户验收 A–C（本地免密环境手动测试通过）。Wave D 缩范围为 D-core（仅 composer），开工。
- D-core 完成：`#send_form` 内部 markup → `ChatComposer.tsx`（17 个契约 ID 全保留，`send_textarea` 非受控）；mount 在 jQuery ready 回调顶部、`#send_but`/`#send_textarea` 绑定之前执行；修复两处模块顶层 DOM 捕获陷阱（`optionsPopper` 改 lazy init，`RossAscends-mods.js` 的 `sendTextArea` 改为 init 时填充）。headless 验证：composer 全元素就位、options 菜单开合、send 点击无异常。D-remainder（Generate service 化、script.js 瘦身）未动。
- D-config 完成：`#rm_api_block`（API Connections，43 契约 ID）与 `#left-nav-panel`（AI Response Configuration，78 内部 ID）内部 markup → `ApiConnectionsPanel.tsx` / `AiConfigPanel.tsx`；两个 mount stage 均排在 `initSecrets`/`registerCoreModules`/`initPresetManager` 之前（secrets.js 读 provider key 输入、openai.js 绑定 preset/采样控件、PromptManager 依赖 `#completion_prompt_manager` 容器）。
- 修复 html2jsx 转换器属性破坏回归：`\bfor=` 正则误伤 `data-for`/`data-preset-manager-for`/`data-macros-autocomplete*`/`no_items_text`，影响此前各波产物（power-user/world-info/advanced-formatting/cfg-config/prompt-manager）；全部回改并新增契约断言（`data-for` 计数器、preset-manager 注册、JS-Slash-Runner `getSelectedPreset` 调用链已 headless 验证恢复）。`globals.d.ts` 为 `no_items_text` 扩类型。
- 验证基线：unit 58 套全绿、compat 全绿、tsc 干净、workspace-panels bundle 构建通过；headless 零 console 错误。
- 2026-09-17 续：`#character_popup`（Advanced Definitions，20 ID）与 `#right-nav-panel`（角色创建/编辑表单 + 角色列表 chrome，104 ID）内部 markup → React；`form="form_create"` 关联、`.rm_tag_filter`、hotswap、token strip 契约保留。
- 模块顶层 DOM 捕获系统性清理：RossAscends-mods 全部面板捕获 + rm_button_create/rm_ch_create_block 绑定改 init 时解析；BulkEditOverlay `container` 改 lazy getter（单例冻结 null 导致 bulk 崩溃）；logprobs REROLL_BUTTON 改 lazy getter（Wave A 起静默死绑定）。
- index.html 降至 ~1100 行；剩余静态内容为模板（`*_template`/`popup_template`，cloneNode 契约）、扩展 `*_container` 注入槽、动态 dialog 壳（dialogue_popup/dialogue_del_mes）、`rm_extensions_block` 回退 chrome——按设计保留静态。
- 2026-09-17 续二：`select_chat_popup`（13 ID）、`character_context_menu`（5 项）、`#options` 菜单（13 ID，含有意重复的 `option_close_chat`）、`export_format_popup` 全部 React 化；`exportPopper` 改 lazy init（`export_button` 已 React 化后顶层 createPopper 拿到 null）。
- 至此 index.html 静态 markup 迁移收尾：所有 drawer/popup/menu 内容均由 workspace-panels bundle 在早期 startup stage 挂载；templates 与扩展注入槽按契约保留静态。
- 2026-09-18 i18n 收敛：新增 `app/compat/i18n.js` 桥——经 `SillyTavern.getContext()` 惰性解析 legacy `t`/`translate`/`getCurrentLocale`（不 import i18n.js，避免 bundle 内联出第二份空 localeData）；供 React 组件编程式字符串使用，静态 markup 继续走 `data-i18n`（applyLocale + MutationObserver 覆盖 React mount 时序）。收敛既有 `commands.translate` prop 管线：ChatBackupsBrowser/DataMaidDialog 改用共享桥，mount adapter 不再注入 translate；DataMaid commands 参数随之删除。ToolbarActionButton 支持 `labelKey`/`titleKey` 并自动发 `data-i18n`（`translate()` 初值 + observer 兜底，全 mount 时序安全）；CharacterLibrary 面板空态/工具栏/状态块接桥。
- 修复 MainChatMessageRow 回归：模板 `message_template` 的 `title`/`data-i18n`/`data-tooltip` 属性在迁移中丢失（约 30 组 spec），全部按模板逐字恢复（含 `mes_prompt`/`mes_swipe_picker` 的 `display:none` 初始态——legacy `.show()`/`.toggle()` 控制）；`mes_edit_cancel` 补 `data-action="cancel-edit"`；`mes_bookmark` 补 `data-tooltip`。新增 `main-chat-message-row-i18n.test.js` 逐 spec parity 断言防再丢。
- 修复 legacy 硬编码中文：`script.js` 空回复"重新生成"按钮 `.text('重新生成')` → `translate('Regenerate')` + `data-i18n`；React 侧 `{translate('Regenerate')}`。
- 边界修正：`app/lib/` 直读 `SillyTavern.getContext()` 触发 react-runtime-boundary 违规——桥移至 `app/compat/i18n.js`（compat 目录为豁免边界层）。
- i18n 验证：zh-cn headless 探针——React composer `placeholder`/`title` 经 observer 翻译（"未连接到 API！"/"中止请求"）、动态 append 的 `data-i18n` 节点被 MutationObserver 翻译（title → "编辑"）、`getContext().translate('Regenerate')` → "重新生成"、零 console 错误；部分串保持英文系 zh-cn.json 缺键（'Chat options'/'Chat message'/'Continue last message' 等），与 legacy 行为一致。unit 626/626、compat 107/107、tsc+eslint 干净。
- 2026-09-18 world-info 深度拆分第一批：新增 `public/scripts/util/primitives.js` leaf（getStringHash/setValueByPath/getOptionId，utils.js re-export 保面）；`world-info-domain.js` 承接 `originalWIDataKeyMap`/`setWIOriginalDataValue`/`deleteWIOriginalDataValue`/`parseRegexFromString`/`isValidRegex`/`customTokenizer`/`splitKeywordsAndRegexes`/`wi_anchor_position`（domain→leaf，无 utils 图循环、无 DOM）；`world_info_position` 去重为 `WORLD_INFO_POSITION` 别名；world-info.js 全部 re-export 保公共面（JS-Slash-Runner 经 @sillytavern 引 parseRegexFromString）。world-info.js 7529→7314 行。剩余缝隙：checkWorldInfo 扫描引擎全家桶（getSortedEntries+四级 lore 源+matchKeys/checkTimedEffects 闭包链 ~1000 行）、编辑器 DOM 渲染群（getWorldEntry/createWorldEntryCard ~800 行）、initWorldInfo 绑定群 ~300 行、模块状态网（export let world_info_* 的跨模块写需要 state 模块）。
- 2026-09-18 public/css 清理第一波：style.css 死规则清除——按 selector→live-markup 引用扫描（含 dataset.camelCase/setAttribute 动态属性还原）删除 83 条永不命中的 ruleset（featherless/model-card 连接器 UI、suggested_replies、fav_chara、rm_characters_topbar、shadow_character_popup、react-main-chat-local-status 等退役面），7884→7346 行；`:not()`/`:is()`/`:has()` 函数伪类不误判、嵌套规则与 @media 内递归处理、hljs-*/paginationjs/ui-sortable-disabled 等运行时类白名单校验。vendor 清点：fontawesome/solid/brands/bright(hljs 主题)/jquery-ui/cropper/toastr/select2 全部仍在引用，保留；accounts.css 仍被 templates/admin.html 引用，保留。
- 2026-09-20 Phase 0a+B0（f14ff050b）：`app/components/contract/` adapter 层落地（ContractButton/ContractIconButton/ContractTooltip + contract-i18n + compat `useTranslated` 被动订阅）；theme bridge 扩至 spacing/radius/typography/motion；`export_format_popup` pilot → ContractButton（`.export_format`/`data-format`/委托链不变）。
- 2026-09-20 B1 composer：6 个 icon-only 控件（send_but/mes_stop/mes_continue/mes_impersonate/options_button/file_form_reset）→ ContractIconButton（真 `<button>`，id/类契约/`data-i18n`/`tabIndex` 透传，`title`→`nativeTitle` 属性由 `[title]` i18n spec + ref 写入）。**stscript_* 与 send_textarea 保持 plain DOM**（前者被 `div.stscript_btn` 标签限定嵌套 CSS 驱动，后者被 jQuery `.val()` 外部变异）。CSS 协同修复：StyleX 原子类带 `:not(#\#)`×3 特异性提升（0-4-0）压过普通规则——`body[data-generating]` 隐藏规则补 `!important`；`#rightSendForm>div`/`#leftSendForm>div` 尺寸规则扩为 `:is(div,button)`；mes_stop 初始隐藏经 `xstyle` 类级 display:none（内联 `.css()` 仍可覆盖）。发现并解决：Astryx tooltip 的 anchor-positioned 元素在屏幕右缘按钮上会撑大 scrollWidth（433>391），composer 控件统一 `nativeTitle` 规避。ContractIconButton 增 `xstyle`/`nativeTitle` 透传；`i18nSpec` 增 `[title]` 部件（仅 nativeTitle 时用，防双 tooltip）。验证：unit 626、compat 107、focused 22、streaming e2e 21/21、walkthrough 4/4、tsc+lint 干净。
- 2026-09-20 B2 menus/popups：OptionsMenu 15 项 `<a>` → ContractButton（ghost+icon+label，`.options-content a` 规则扩为 `:is(a,button)`，`#options [id]` 委托不变，含 dup option_close_chat）；SelectChatPopup 的 newChat/import/cross → Contract 按钮；CharacterPopup 的 character_cross/character_popup_ok/editor_maximize×5 → Contract 按钮（`.editor_maximize` 委托 + `data-for` 透传）。表单域（text_please/`form="form_create"`/select_chat_search/select_chat_div）保持 plain——jQuery `.val()`/序列化所有权。ContractButton 对齐 IconButton 增 `nativeTitle`/`xstyle`。验证：unit 626、compat 107、streaming 21/21、walkthrough 4/4、tsc+lint 干净、headless 冒烟（菜单开合+按钮形态+data-for）零错误。
- 2026-09-20 B3 api/ai-config 按钮层：ApiConnectionsPanel 10 控件（api_key_unified_manage/show、fallback show/save/clear、vertexai_sa_show、Connect/Cancel/Parameters/Test）+ AiConfigPanel 16 控件（preset popup 菜单×3、preset-action×3、logit_bias×4、new_entry、restore×7）→ ContractButton/ContractIconButton。跳过：`preset-menu-trigger`（button 不能嵌 popup 菜单）、`label[htmlFor]` 绑定对、lock 状态图标对、全部 text_pole 输入（jQuery 所有权）。`expectButtonAffordance` helper 支持 Contract 适配器形态（label→aria-label + 原生 button 语义）。验证：unit 626、compat 107、streaming 21/21、tsc+lint 干净、headless 19 控件 BUTTON 形态+契约类/`data-*` 透传零错误。
- 2026-09-20 B4 其余 React 面板 action chrome：RightNavPanel（rm_button_characters/stats/hideCharPanelAvatar/rm_button_back/favorite/world/advanced/char_connections/export/dupe/tags_view/creators_note_styles/spoiler_free_desc/editor_maximize×2/open_alternate_greetings + 工具栏 8 枚 icon+label 按钮）、PowerUserPanel（ui_preset×5、reload_chat/debug_menu/data_maid、editor_maximize）、PersonaManagementPanel（stats/backup/restore/create_dummy/lock×3/grid_toggle/persona_*×6/editor_maximize）、RegexSettingsPanel（open/import/debugger/bulk×7/preset×4）、RegexEditor（test_mode_toggle）、RegexDebugger（edit_rule）、QuickReplySettings（×12）、QuickReplyEditor（qr--delete/qr--ctxAdd）、AdvancedFormattingPanel（af_master import/export + data-preset-manager-*×21 + editor_maximize×3）、PromptManagerPopup（close/reset/save）、TagManagement（×4）、LogprobsViewerPanel（close）→ ContractButton/ContractIconButton。**保留**：`label htmlFor` 内的 checkbox 装饰图标（`<small><i>`/lock 对）、`character_open_media_overrides`（JS 翻转双 icon 容器）、`qr--modal-*`（组合 icon/JS 填充）、`preset-menu-trigger`（嵌套 popup）、`chartokenwarning` `<a>` 链接、React-onClick 面（DataMaid/ChatBackups/WelcomePanel/MacroBrowser/CharacterLibrary*——已是真 `<button>`+onClick，无委托契约）。`MainChatMessageRow` 的 `.mes_button` 重复模板**延后**（DOM 重量决策）。ContractButton 增 `ariaLabel`/`ariaLabelKey`/`labelClassName`；`hidden` 初始态用 `style={{display:'none'}}` 保（`.toggle()` 走内联 display）；全部迁移控件统一 `nativeTitle`（回原 `title` 契约，杜绝 tooltip 层溢出一类问题）——同时把 B2/B3 已迁控件补齐为 nativeTitle。验证：unit 626、compat 107、tsc+lint 干净、workspace-panels 构建通过、headless 冒烟 55+ 控件 BUTTON 形态/类/id/data-*/display:none/label span 全保零 console 错误、e2e panel-navigation 12/12、bulk-mode+walkthrough 7/7、settings 3/3、streaming 21/21。
