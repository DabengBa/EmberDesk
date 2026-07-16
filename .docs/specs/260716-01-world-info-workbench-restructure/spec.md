# World Info 工作台内容与结构重构

## 意图与核心流程

一句话意图：在不改变 World Info 行为内核的前提下，把当前抽屉改造成一个由 React 单独可见拥有、
桌面高密度且移动端可达的世界书编辑工作台。

主要参与者是需要同时维护全局 lorebook、单本世界书和大量 entries 的 workspace 用户；触发条件为
从当前 `/` workspace 的 World Info 入口打开抽屉，且
`features.react.shell.takeover=true`、`features.react.panels.worldInfo=true`、bundle 可加载。

主路径：

1. 用户打开 World Info；若 Character Management 已锁定，它继续可见且可操作。
2. 抽屉顶部显示“全局激活”摘要、已激活数量和一个明确的“编辑激活规则”次级入口；它不与正在编辑
   的 world book selector 混为同一选择器。
3. 用户在唯一的书本标题栏选择或创建要编辑的 book，使用同一处 search、sort 和更多操作。
4. 桌面端左侧浏览和筛选条目，右侧只编辑当前一条；移动端先浏览列表，打开条目后切到编辑视图，
   通过返回操作回列表。
5. 用户先完成常用字段；只有激活、注入、概率/时序或范围/条件需要调整时，才展开相应高级区。
6. 所有可见操作经 `public/scripts/world-info.js` facade 执行；导入、导出、保存、删除、prompt 与
   regex 行为继续使用既有实现。异常时展示可恢复状态，或在 flag-off/bundle failure 时回到完整
   legacy 抽屉。

## 范围 / 不做范围

本阶段包括：

- 修复 World Info drawer 的 DOM containment，使 `#wi-holder`、全局激活区、`#wiEditorPanel` 与
  React workbench host 形成一个正确的工作台层级；不得依赖浏览器对 malformed closing tag 的重排。
- 以受保护 React island 作为 flag-on 正常路径唯一可见 World Info workbench owner，移除可见层中
  重复的 legacy selector、search、sort、action 与 entry list；legacy DOM 只作为隐藏 adapter、
  deferred/replay 边界和 fail-closed rollback。
- 提供全局激活摘要/规则、单一 editor-book header、搜索/排序/创建/导入/导出/刷新和条目列表/
  单条编辑分栏；保留 rename、duplicate、delete、backfill、apply sorting 与多选等既有动作的
  可发现入口，不制造第二个命令集合。
- 为 entry editor 建立“基本字段 + 渐进高级区”的层级：触发与匹配、注入、概率与时序、范围与条件。
- 定义桌面与移动端的可达布局、单滚动根、键盘/屏幕阅读器焦点与本地化行为。
- 以结构、facade、compat、浏览器和 semantic-doc 证据替换仅检查源码片段的不足。

本阶段不包括：

- 不新增 route、SPA shell、新依赖、全局 feature flag 或平行 World Info state machine。
- 不改变 World Info global activation、scan、prompt injection、token budgeting、regex placement、
  slash-command、converter/import、world-book deletion cascade、character relation、API payload、
  canonical SQLite/file projection 或落盘 schema。
- 不删除 `public/scripts/world-info.js`，不把 `__emberDeskReactCompatibilityBridge` 升格为公共 API，
  不收窄 `eventSource`、`event_types`、`globalThis.SillyTavern`、`@sillytavern/*`。
- 不在 UI 中恢复 Vectorized 控件；已有 `vectorized` / `extensions.vectorized` 仅保持导入、导出和
  无关字段保存时的无损 round-trip。
- 不扩大到 Character Management、Backgrounds、Extensions 或完整 workspace shell 重排。

## 边界规则 / 验收

R1: `#wi-holder`、`#wiEditorPanel`、React host 与 legacy adapter 的 DOM 关系必须显式正确；flag-on
正常路径中 World Info 的 global selector、editor-book selector、search、sort、toolbar actions、
entry list 和 entry editor 各只能有一个可见且可聚焦的 owner。不得让浏览器因不匹配标签重排结构，
也不得靠 CSS 隐藏一套仍可被 tab 聚焦的重复控件。

R2: 打开 workbench 时必须先给出全局激活的紧凑状态：零本时显示明确空态，非零时显示数量和名称的
可扫描摘要；“activation rules”必须是次级、默认折叠且可恢复的表面。编辑某本 book 绝不自动改变
global activation，改变 global activation 也绝不静默切换当前 editor book。

R3: 每次只存在一个可见 editor-book header，其中包含当前 book 名称/状态、选择或创建入口、search、
sort 与 actions。创建、导入、导出、rename、duplicate、delete、refresh、backfill、apply sorting
和多选继续走已有 facade 的确认、冲突、busy 与结果语义；无选中 book 时只显示有效的创建/导入恢复
动作，不能展示失效操作的假成功。

R4: 桌面宽度下 workbench 必须把条目列表与当前 entry editor 分成可独立浏览的区域；列表切换 entry
时，编辑器只显示该 entry。移动宽度下不得纵向堆叠全局规则、整份列表和完整编辑器；workbench 使用
“列表”与“编辑条目”两个明确状态，打开 entry 后将焦点置于编辑标题，返回后恢复原列表滚动位置与
触发控件。移动视口在任一状态只能有一个预期的内容滚动根，编辑器不得因上方展开内容而不可达。

R5: entry editor 默认只显示完成常见编辑所需的基本字段：状态、memo/title、主/次 keywords、内容与
最常用的注入位置。触发与匹配、注入细节、概率与时序、范围与条件分别是可展开的高级区；每个区在
收起时必须用非默认配置摘要提示已启用的关键行为。字段仅在适用时显示，但切换区、切换 entry 或保存
无关字段不得重置、丢失或错误归一化未显示字段。

R6: 可见状态必须覆盖 `loading`、`empty`、`success`、`error`、import busy、保存中与删除后选择失效：
每个状态给出用户可理解的主信息和下一步。导入继续阻止重复 picker 启动、显示进度/冲突/批量结果，
取消、解析失败或网络失败后恢复控件；保存或刷新失败时保留用户仍可恢复的上下文，不能以整页空白、
raw exception 或永久 disabled 结束。

R7: React workbench 只能通过 `public/scripts/world-info.js` 的明确 facade action/snapshot seam 读取
或改变 World Info；它不得复制 prompt activation、regex、converter/import、删除级联或 persistence
实现，也不得用 raw DOM `.click()` / `.trigger()` 旁路这些语义。flag-off、host mount failure 或 bundle
failure 时，legacy drawer 必须仍是可见、可用且唯一 owner 的完整回退路径。

R8: Workbench 的所有新增可见 copy 必须接入现有本地化机制；默认 UI 不得泄露 `legacyBoundary`、
`compatibility-facade`、`loading` 等内部迁移枚举。按钮有可辨识名称和 icon 辅助文案，展开区使用
正确的 `aria-expanded` / `aria-controls`，列表—编辑切换有可预测焦点。视觉密度遵循 `DESIGN.md`：
深色、紧凑、功能性留白、用户可调字号和既有主题变量，不能引入 dashboard 卡片或固定像素字体。

R9: 结构测试必须证明 containment、单一可见 owner 和回退边界；行为测试必须覆盖 facade action/
snapshot 及既有 import/converter/delete/compat 语义；真实浏览器必须覆盖 desktop、mobile、locked
Character Management 并存、empty/error/recovery 和本地化可见文案。`.docs/db/features/world-info-panel.md`
必须更新为新的用户可见层级和移动端流程，且 `bun run docs:check` 通过。

恢复规则：

- React island 不满足开关、导入失败或初始化失败时，不能留空 host、半隐藏控件或不可用抽屉；立刻保留
  legacy visible owner，并继续沿用其既有 deferred-panel replay。
- 任何 facade action 失败时，workbench 显示可读错误和适当的重试/返回/刷新入口；它不能擅自重放
  destructive action，也不能把失败推断为已保存。
- 当前 book、当前 entry 或导入结果在 refresh/delete 后失效时，清除其可见编辑上下文并进入明确 empty
  或选择状态；不得显示另一本 book 的陈旧 entry。

## 架构 / 约束

- 保持 ADR-0007 的同入口 guarded island：只有 `features.react.shell.takeover` 与
  `features.react.panels.worldInfo` 同时为真且 bundle 可加载时，React 才拥有正常可见路径。否则
  不创建空 React host，不隐藏 legacy controls。
- `public/scripts/world-info.js` 是高风险行为唯一 compatibility facade，继续拥有 prompt activation、
  regex placement、converter/import outcomes、delete cascade、persistence、legacy exports 和
  deferred-panel replay。为 workbench 增补的 bridge 只能是窄的“已消毒 view snapshot + 显式 facade
  action”接口，不能泄漏 mutable store 或变成第三方公共 replacement API。
- React workbench 的可见层可拆出专用组件和样式文件，但不能把现有 `app/workspace-panels.tsx` 中的
  面板状态/动作复制成另一份业务逻辑。React 负责布局、状态呈现、焦点和表单交互；facade 负责语义。
- Legacy DOM 在 flag-on 路径可继续存在以满足 Select2、deferred loader、replay 或兼容 selector，
  但必须从 a11y tree、tab order、pointer interaction 与视觉流中排除；它不是第二个 UI。
- Workbench 层级固定为：抽屉标题/全局摘要 -> editor-book header -> desktop list/editor 或 mobile
  list/editor state。`activation rules`不参与默认阅读主线；destructive actions 在更多菜单或明确
  确认路径中，不与主要 create/import/save CTA 并列抢占注意力。
- 移动布局使用 drawer 内明确的 flex/min-size/overflow 边界，避免目前只让 `#wi-holder` 滚动的假设。
  仅活动的 list 或 editor body 拥有纵向滚动；viewport、drawer、隐藏 adapter 不形成竞争性滚动容器。
- 所有样式使用既有 CSS variables、`--mainFontSize` / `--fontScale` 和紧凑 spacing vocabulary；
  不使用破坏用户主题或字号的固定设计 token。

## 数据 / 集成

- 不新增 API、数据库表、文件格式、World Info schema 或迁移。World Info 的 canonical SQLite authority
  与 JSON projection（若已启用）继续位于 facade/endpoint 既有边界，workbench 对两者呈现同一流程。
- Snapshot 只提供可见层所需的 book 列表、global activation 摘要、当前 editor book、entry summaries、
  selected entry、search/sort、action capability、busy/error 与恢复信息；它不提供可由 UI 直接写入的
  内部缓存或 prompt state。
- Action seam 使用命名 action 和严格 payload，例如选择 book、设置搜索/排序、打开/返回 entry、
  创建 book/entry、请求导入、导出、refresh 与已有更多操作；动作仍调用现有导出 helper，不允许
  React 伪造 DOM events。
- 条目所有现有字段继续按原 schema 保存；渐进披露只改变显示和编辑分组，不是 schema 转换。
  条件隐藏的字段必须被原值保留。`vectorized` / `extensions.vectorized` 继续 round-trip，但不出现
  “可向量化”或等价能力宣称。
- 既有 `.json`、`.lorebook`、`.png` 导入、冲突确认、批处理限制、取消和最终汇总继续由
  `world-info.js` 及 converter/result helpers 处理；React 只呈现状态与调用入口。

## 验证

实施时至少执行：

```bash
bun run --cwd tests test:unit -- world-info-card-rendering.test.js world-info-shell-context.test.js world-info-import-feedback.test.js world-info-converters.test.js worldinfo-delete-cascade.test.js react-workspace-panels-helpers.test.js --runInBand
bun run test:compat
bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js world-info-workbench.e2e.js --workers=1
bun run build:react:workspace-panels
bun run docs:check
```

自动化证据必须证明：

- 正确 DOM containment，flag-on 无重复可见/可聚焦的 selector、search、sort、actions 或 editor，
  flag-off/build failure 恢复完整 legacy owner。
- facade seam 的 action 与 snapshot 不绕过 `world-info.js`，且现有 World Info import、converter、
  delete cascade、shell-context 和第三方兼容测试继续通过。
- global activation 与 editor selection 保持独立；未选 book、无 entries、已删除 selected entry、
  import busy/error 和 refresh error 都有确定性可见状态。
- mobile workbench 在 list/editor 两状态只有一个活动滚动根，切换后焦点和列表滚动恢复正确。
- `vectorized` 兼容字段通过 import/export/保存不丢失，且可见 UI 不暴露该能力。

人工 / 浏览器检查：

1. 在 desktop 打开 World Info，确认全局摘要、单一 book header、条目列表和单条编辑器同时可扫描，
   且没有第二套 legacy toolbar。
2. 锁定 Character Management 后打开 World Info，确认两个面板同时可用。
3. 在 mobile viewport 中展开 activation rules、选择 book、打开一条 entry、编辑后返回列表；确认
   编辑器始终可达、滚动不嵌套竞争、焦点和原列表位置恢复。
4. 导入包含冲突的 `.json` / `.lorebook` / `.png`，分别完成覆盖、跳过、取消和失败路径；确认进度、
   决策、汇总和恢复都保留现有含义。
5. 切换为 flag-off 或模拟 bundle failure，确认 legacy World Info 仍可独立打开、编辑和导入。

## Doc ID 契约

- `feature.world_info_panel`
  - Owner：`.docs/db/features/world-info-panel.md`
  - 绑定点：World Info drawer 的全局激活摘要、editor-book header、entry list/editor、移动端
    list/editor 状态、导入恢复和 guarded React fallback。
  - 预期：文档明确全局激活与编辑选择分离、一个可见 workbench owner、渐进高级字段、移动端流程，
    同时保留 locked Character Management 并存和 import/delete 的既有语义。
- `page.chat_workspace`
  - Owner：`.docs/db/pages/chat-workspace.md`
  - 绑定点：同入口 World Info 打开/关闭、locked drawer coexistence、flagged React island 与 legacy
    fallback。
  - 预期：文档说明 workspace 内 World Info 工作台仍从现有入口打开，不建立独立 route，且 locked
    Character Management 不会被关闭。

验证要求：`bun run docs:check` 必须确认 Doc ID 稳定、引用拓扑与代码绑定无断链；实施证据必须对应
本 spec 的 R1–R9，而非只证明 React host 已挂载。

## 参考资料

- `DESIGN.md`
- `public/index.html`
- `public/panels/world-info-body.html`
- `public/css/world-info.css`
- `public/script.js`
- `public/scripts/world-info.js`
- `public/scripts/world-info-shell-context.js`
- `public/scripts/world-info-converters.js`
- `public/scripts/world-info-import-results.js`
- `app/workspace-panels.tsx`
- `tests/world-info-card-rendering.test.js`
- `tests/world-info-shell-context.test.js`
- `tests/world-info-import-feedback.test.js`
- `tests/world-info-converters.test.js`
- `tests/worldinfo-delete-cascade.test.js`
- `tests/react-workspace-panels-helpers.test.js`
- `.docs/db/features/world-info-panel.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/legacy-cutover-ledger.md`
- `.docs/tech/third-party-extension-compatibility.md`
- Inference：移动端“列表/编辑两个状态而非纵向堆叠”来自当前 `#wi-holder` 单独滚动造成编辑区
  不可达的本地实现证据，以及 `DESIGN.md` 对高密度、功能性留白和 drawer-first layout 的约束；
  它不引入新的导航或数据模型。
