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
