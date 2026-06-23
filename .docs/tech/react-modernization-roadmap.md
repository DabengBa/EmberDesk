# EmberDesk React 现代化重构路线图

## 模块职责

本文档定义 EmberDesk 从 jQuery 单体应用迁移到现代 React 生态的完整路线图。Phase 0-6 是约 18-24 个月的渐进式迁移计划，新增 Phase 7 作为 ADR-gated full owner cutover 收尾阶段；在保持产品可用性和扩展兼容性的前提下，逐步替换技术栈核心组件，并为每个 legacy owner / fallback 留出明确退出路径。

## 状态

状态：执行中；Phase 0 基础设施已落地，Phase 1 已交付，Phase 2 Sprint 1-7 已按 guarded panel island 边界交付，Phase 3 已按当前批准的 guarded hidden main-chat island scope 交付，Phase 3B Sprint 1-5 已完成 visible row / actions / composer / slash / standard direct-chat transport owner cutover；Character Library、World Info、Background Library、Extensions Host 和当前 main-chat surface 仍保留同入口 legacy fallback，flag 关闭或 bundle 缺失时不替换原 surface；所有 legacy owner / fallback 的最终退出统一进入新增 Phase 7 full owner cutover，不再悬空为泛化“未来处理”
创建日期：2026-06-15  
前置条件：`.docs/tech/modernization-roadmap.md` 已于 2026-06-05 冻结完成

当前决策记录：[ADR-0007: React page and panel islands with legacy fallbacks](../adr/0007-react-page-islands-with-legacy-fallbacks.md)

本路线图不改变用户可见的产品语义。用户界面行为仍由 `.docs/db/` 拥有。

## 目标技术栈与当前采用状态

基于 `C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.docs\tech\recommended-stacks\react.md` (核对日期：2026-06-05)

| 层级 | 技术 | 当前状态 | 说明 |
|---|---|---|---|
| 框架 / 宿主 | React 19 page/panel islands | 已采用 | 早期迁移是 feature-flagged islands，不是全站 SPA cutover；边界见 [ADR-0007](../adr/0007-react-page-islands-with-legacy-fallbacks.md)。TanStack Start / SSR / Server Functions 尚未采用，未来若需要必须另起 spec/ADR。 |
| 路由 | TanStack Router | 已采用 | `app/client.tsx`、`app/router.tsx`、`app/routeTree.gen.ts` 和 `app/routes/*` 承载 `/login`、`/setup`、`/settings`。 |
| 语言 | TypeScript 6 + React 19 | 已采用 | `app/**/*.{ts,tsx}`、`src/**/*`、`public/**/*` 纳入当前 TypeScript / ESLint 边界；迁移仍是渐进式。 |
| Lint/格式化 | ESLint 10 + typescript-eslint | 已采用 | `eslint.config.js` 覆盖 `src`、`public`、`app` 与根 JS/TS 文件；Prettier 不作为当前强制 gate。 |
| 包管理/运行 | Bun scripts + Node.js runtime | 已采用 | Bun 1.3.14 是包管理器和脚本 runner；应用运行时仍是 Node.js 26.3.0。 |
| 构建 | Vite 8 + deprecated Webpack fallback | 已采用 | Vite 构建 `/lib.js`、共享 React app、character-library panel bundle，以及 workspace panel action-island bundle；Webpack 仅保留为 `/lib.js` deprecated fallback / Docker precompile path。 |
| 样式 | Tailwind CSS v4 + 既有 CSS | 已采用 | Tailwind v4 接入 React app；主工作区 legacy CSS 仍是现有页面和扩展兼容面的 owner。 |
| UI 组件 | 本地 React 组件 | 已采用 | 当前代码使用 `app/components/*` 本地组件；shadcn/ui、Ant Design 尚未进入 `package.json`，不能写成已采用依赖。 |
| API | Express 5 | 当前保留 | Hono 属于 Phase 5 未来候选，尚未安装或接管 API；迁移前必须有 ADR 和路由兼容证明。 |
| 数据获取 | TanStack Query | 已采用 | React login/setup/settings、character-library panel、workspace panel shell，以及 World Info / Background Library / Extensions Host 的 guarded React state/action surfaces 已使用 TanStack Query。 |
| 表单 | TanStack Form + Zod | 已采用 | React login/setup/settings、character-library toolbar、World Info controls、Background Library filter/sort controls 和 Extensions Host Extras controls 的 React-owned 表单/呈现态使用 TanStack Form + Zod；legacy-owned 控件可通过 host 边界保留。 |
| 列表性能 | TanStack Virtual | 已采用 | Character Library panel 在大页尺寸下用 `@tanstack/react-virtual` 限制同时挂载行数；main-chat `mainChatMessageList` island 现在也用它做 headless measurement / snapshot / restore controller，但仍不渲染第二套可见消息列表。 |
| 状态 | Zustand + legacy compatibility globals | 已采用 / 兼容保留 | Zustand 已用于 workspace panel mount/update/unmount store 和 main-chat observation store；`globalThis.SillyTavern`、`eventSource`、`event_types` 仍是兼容 owner，最终删除/冻结归 Phase 7。 |
| 数据层 | file-backed user data + derived SQLite cache | 当前保留 | Drizzle ORM 尚未采用；SQLite 仍只作为 derived cache，不是用户数据正本。 |
| 测试 | Jest + Playwright | 当前保留 | Vitest 尚未采用；现有验证仍以 Jest unit、Playwright E2E、docs compiler 和 focused compatibility tests 为主。 |
| 工具 | ESLint / typecheck / focused proof scripts | 当前保留 | React Doctor 尚未采用；性能与逻辑证明依赖现有 runner 和 `.docs/logic-description/*_sandbox_proof.py`。 |

## 架构原则

1. **渐进式迁移**：保持 Express 后端和 jQuery 前端同时运行，逐页面/面板迁移到 React
2. **兼容性优先**：在完全迁移前，维护 `@sillytavern/*` 别名、`eventSource`、`event_types` 兼容层
3. **文件存储不变**：继续使用文件作为用户数据正本，SQLite 仅作 derived cache
4. **测试驱动**：每个迁移步骤必须有对应的单元测试或 E2E 测试
5. **性能可测**：保留 startup/interaction performance runner，迁移后性能不能劣化
6. **TanStack 收口优先**：React 页面迁移默认必须使用 TanStack Form + Zod 管理表单和校验，使用 TanStack Query 管理服务端状态；任何例外都必须在对应 spec/ADR 中说明原因和退出计划
7. **Page / panel island 优先**：Phase 1 的 React 页面和早期 Phase 2 的工作区面板都以 feature-flagged island 形式上线，必须保留 legacy fallback；扩展兼容和全局 bridge 由 Phase 4 / Phase 6 建证据，legacy fallback / full SPA workspace shell 的删除或冻结统一由 Phase 7 决策
8. **剩余项不悬空**：任何 Phase 完成时保留的 legacy owner、fallback path 或兼容边界，必须在本路线图中有后续 Phase、backlog 子阶段、ADR-only milestone 或明确退出条件；不得只写“未来处理”。
9. **Full owner cutover 必须显式排期**：guarded island / visible owner 只代表可回滚迁移完成，不代表 legacy owner 已退出；每个保留的 legacy 行为 owner、DOM fallback、public API 兼容出口和 build-missing fallback 都必须在 Phase 7 标明 cutover 条件、验证门和退出策略。

## 迁移阶段

### Phase 0: 基础设施准备（3 个月）

**目标**：搭建 React 基础设施，不改变现有功能

归档说明：Phase 0 已完成，旧开发 specs 已从 `.docs/specs` 清理；持久记录保留在本路线图、[PROJECT_HISTORY](../PROJECT_HISTORY.md) 和相关技术文档中。

**当前执行状态**：
- Phase 0 基础设施已落地到当前代码：`vite.config.ts` 同时承载 `/lib.js` 构建、共享 React app 构建、character-library panel bundle 和 workspace panel action-island bundle；`tsconfig.json` 覆盖 `app/**/*`、`src/**/*` 与 `public/**/*`；`eslint.config.js` 已把 `app/**/*.{ts,tsx}` 纳入 TS/TSX lint 边界。
- React app shell 已存在于 `app/client.tsx`、`app/router.tsx`、`app/routes/*` 和 `app/routeTree.gen.ts`；Tailwind v4 通过 `tailwind.config.js`、`postcss.config.js` 与 `app/styles/globals.css` 接入 React app。
- Webpack 只保留为 `/lib.js` deprecated fallback；当前主构建入口是 Vite。

**Sprint 列表**：
- ✅ Sprint 1: Vite 迁移（2 周，Vite 8 已作为 `/lib.js` 主构建，Webpack 保留 deprecated fallback）
- ✅ Sprint 2: TypeScript 配置（2 周，`tsconfig.json` 与 ESLint TS/TSX 边界已覆盖 React app）
- ✅ Sprint 3: React 开发环境（2 周，React 19 + TanStack Router app shell 已承载 `/login`、`/setup`、`/settings`）
- ✅ Sprint 4: Tailwind CSS 集成（2 周，Tailwind v4 / PostCSS 已接入 `app/styles/globals.css` 和 React route/component classes）

---

### Phase 1: 独立页面迁移（3 个月）

**目标**：迁移登录、Setup、Settings 等独立页面到 React

归档说明：Phase 1 已完成，旧开发 specs 已从 `.docs/specs` 清理；用户意图和交付记录保留在 [react-phase1-sprint2-setup-page](briefs/react-phase1-sprint2-setup-page.md)、[react-phase1-sprint3-settings-panel](briefs/react-phase1-sprint3-settings-panel.md)、[PROJECT_HISTORY](../PROJECT_HISTORY.md) 和本路线图中。

**当前执行状态**：
- `Sprint 1 / Login`：React 页面已上线并默认开启，`/login.html` 保留 legacy 回退入口；React 登录流程已按路线图完成 TanStack Form / Zod / TanStack Query 收口。
- `Sprint 2 / Setup`：React 页面已交付并由 `features.react.pages.setup` 控制，默认保持关闭；`/setup.html` 保留 legacy 回退入口；React setup 流程已按路线图完成 TanStack Form / Zod / TanStack Query 收口。
- `Sprint 3 / Settings`：React `/settings` 已交付并由 `features.react.pages.settings` 控制；flag 开启且 React build 存在时进入独立 Settings 页面，关闭或缺 build 时回退到 legacy `/` 工作区；本 Sprint 已严格采用 TanStack Form / Zod / TanStack Query，覆盖更广的 General 控制、fallback / Vertex AI / prompt post-processing、更多 UI 设置，以及 Advanced 中的大部分 power-user 设置面。legacy `vertexai` source 会显示为 Google + Vertex AI 并在未关闭 Vertex AI 时保存回 `vertexai`；高级 reasoning effort 值 `min` / `max` / `none` / `minimal` / `xhigh` 保持可见和可保存。用户可见语义见 [`page.settings`](../db/pages/settings.md)，当前 payload 规则见 [React settings payload processing flow](../logic-description/react_settings_payload_processing_flow.md)。

**Sprint 列表**：
- ✅ Sprint 1: Login 页面 React 重写（2 周，React 实现已上线并默认开启 feature flag；TanStack Form / Zod / Query 已完成收口）
- ✅ Sprint 2: Setup 页面 React 重写（2 周，React 实现已交付并挂在 `features.react.pages.setup` 下；`/setup.html` 保留 legacy 回退入口；TanStack Form / Zod / Query 已完成收口）
- ✅ Sprint 3: Settings 面板 React 重写（4 周，React `/settings` 已交付并挂在 `features.react.pages.settings` 下；覆盖 General / Providers / User Interface / Advanced 的 Sprint 3 设置切片；TanStack Form / Zod / Query 已完成收口）

---

### Phase 2: 侧边栏和面板迁移（5 个月）

**目标**：迁移角色库、世界信息、背景库、扩展宿主面板等主工作区侧边栏/面板到 React

归档说明：Phase 2 已完成，旧开发 specs 已从 `.docs/specs` 清理；用户意图和交付记录保留在 [react-phase2-character-library-panel-sprints-1-3](briefs/react-phase2-character-library-panel-sprints-1-3.md)、[PROJECT_HISTORY](../PROJECT_HISTORY.md) 和本路线图中。

**当前执行状态**：
- `Sprint 1-3 / Character Library`：已作为同一条交付路径收束为受 `features.react.panels.characterLibrary` 控制的 React character-library panel island。flag 开启且 bundle 可用时，用户仍从原工作区入口打开角色库，但 toolbar/list surface 改为 React island；flag 关闭或 build 缺失时继续走 legacy panel fallback。
- 当前交付保持现有 pagination shell、`entitiesFilter` / `getEntitiesList()` 语义、bulk delete / bulk tag 流程、delete dialog 和受保护 DOM 选择器；只把列表渲染、搜索/排序视图状态和 bulk 呈现收口到 React。
- TanStack 收口状态：`/api/characters/all` 的读取与 mount-time refresh 由 TanStack Query 承接；搜索 / 排序 / bulk toolbar 呈现态由 TanStack Form + Zod 承接；标签过滤继续复用 legacy tag controls 与 `entitiesFilter` 语义，并通过 `LegacyElementHost` 挂入 React toolbar，tag 选择值不进入当前 TanStack Form / Zod schema；当前页 rows 在 `1000 / 页` 下通过 `@tanstack/react-virtual` 保持可见窗口挂载，而不是一次性挂载整页角色。React island 同步会按完整 normalized character payload 判断是否需要更新 legacy `characters` 数组，并保留 `/api/characters/all` 的结构化 overflow 错误给既有提示路径；当前规则见 [React character-library sync processing flow](../logic-description/react_character_library_sync_processing_flow.md)。
- `Sprint 4-5 / World Info`：已交付为 `features.react.panels.worldInfo` 控制的 guarded React workspace panel island。React host 在 legacy World Info editor 内显示 global/editor selector readiness、当前 world、entry count、search/sort 控件、创建/导入/导出/刷新入口和 entry 快捷入口；这些 React controls 通过 bridge 调用 legacy DOM actions，World Info scanning、prompt injection、regex placement、converter/import result handling 和 world-book delete cascade 仍由 legacy owner 执行。
- `Sprint 6 / Background Library`：已交付为 `features.react.panels.backgroundLibrary` 控制的 guarded React workspace panel island。React host 显示 loading/empty/success/error 状态、filter/sort controls、global/chat gallery counts 和背景动作入口；filter/sort/upload/select/lock/unlock/auto/refresh 通过 bridge 调用 legacy background controls，`/api/backgrounds/*`、thumbnail/lazy-load、文件夹、选择、lock 和 slash-command 行为仍由 legacy owner 执行。
- `Sprint 7 / Extensions Host`：已交付为 `features.react.panels.extensionsHost` 控制的 guarded React workspace panel island。React host 显示 notify updates、Manage、Install、Extras API URL/API key/autoconnect/connect controls、loader state 和 protected mount-point readiness；这些 controls 通过 bridge 调用 `public/scripts/extensions.js` 的既有 DOM actions，`#extensions_settings`、`#extensions_settings2`、`#regex_container`、`#extensionsMenuButton`、`#extensionsMenu`、Tavern Helper、regex extension、install/update/delete protocol 和 `@sillytavern/*` 兼容面保持 legacy owner。

**Sprint 列表**：
- ✅ Sprint 1: 角色库面板 - 列表基础（3 周，已交付为 guarded React panel island；保留 row DOM 合约，并在 `1000 / 页` 下验证虚拟滚动窗口挂载）
- ✅ Sprint 2: 角色库面板 - 搜索过滤（2 周，已交付；搜索、排序、标签过滤在同一工作区入口可用，并继续复用现有 folder / bogus-folder / group 混排语义）
- ✅ Sprint 3: 角色库面板 - 批量操作（2 周，已交付；bulk 选择/删除/标签流程继续复用现有确认对话框和 overlay 链路，`Del` 在无选中项时保持 disabled）
- ✅ Sprint 4: 世界信息面板 - 编辑器（3 周，已交付 guarded React host/editor controls；legacy prompt/regex/delete 语义保留）
- ✅ Sprint 5: 世界信息面板 - 导入导出（2 周，已交付 React import/export/create/refresh entry points；legacy converter/import 结果链路保留）
- ✅ Sprint 6: 背景库面板（2 周，已交付 React status/filter/gallery/action island；legacy background file/API/slash 行为保留）
- ✅ Sprint 7: Extensions 面板宿主（3 周，已交付 Extensions drawer 宿主 controls；保留 `#extensions_settings` / `#extensions_settings2` / `#regex_container` / wand menu 等受保护挂载点）

**Phase 1 Sprint 3 后续边界**：`World Info`、`Backgrounds`、`Extensions` 没有混入 React `/settings`。它们按路线图进入 Phase 2：World Info 在 Sprint 4-5，Backgrounds 在 Sprint 6，Extensions drawer 宿主在 Sprint 7；第三方扩展 API、挂载兼容和迁移指南仍由 Phase 4 / Phase 6 负责。

**Sprint 4-7 当前边界**：
- Sprint 4-7 已完成本阶段的 guarded island 交付：共享 `app/workspace-panels.tsx` bundle 提供 TanStack Query shell，并为 World Info、Background Library、Extensions Host 提供 TanStack Form + Zod 控制面、action mutation bridge、status rows 和 safe legacy-slot markers。
- `public/scripts/workspace-panels-react-bridge.js` 继续负责按 flag、host container、bridge state/action 和 bundle import 成功与否返回 mounted/fallback 结果。bundle import 失败时结果为 fallback，legacy 控制仍是行为 owner。
- World Info React island 当前接管宿主壳、world select、search/sort、create/import/export/refresh buttons 和 entry shortcut 呈现；World Info prompt activation、regex engine、converter/import result semantics 和 deletion cascade 仍由 `public/scripts/world-info.js` 及相关 legacy modules 拥有。
- Background Library React island 当前接管宿主壳、filter/sort controls、gallery presentation 和 upload/select/lock/unlock/auto/refresh entry points；background file APIs、thumbnail/lazy-load、folder state、selection effects 和 slash commands 仍由 `public/scripts/backgrounds.js` / `public/scripts/background-panel-controller.js` 拥有。
- Extensions Host React island 当前接管宿主壳、notify/manage/install/Extras API host controls 和 protected mount-point status presentation；extension discovery、manifest loading、script/style injection、Tavern Helper、regex extension、wand menu templates、install/update/delete protocols 和 `@sillytavern/*` aliases 仍由 legacy extension compatibility boundary 拥有。第三方扩展 API 和迁移指南仍由 Phase 4 / Phase 6 处理。

**Phase 2 后 full owner cutover 归属**：

| Surface | 当前 Phase 2 完成定义 | 仍保留的 legacy owner / fallback | Full owner cutover 归属 |
|---|---|---|---|
| Character Library | React toolbar/list/search/sort/bulk 呈现、TanStack Query refresh、TanStack Form + Zod toolbar state、虚拟滚动窗口 | legacy tag controls、`entitiesFilter`、`characters` global array sync、delete dialog、bulk delete/tag side effects、protected row selectors、flag/build fallback | `Phase 7 Sprint 1: Character Library full owner cutover` |
| World Info | React host、world select、search/sort、create/import/export/refresh entry points、entry shortcut 呈现 | prompt activation、regex engine、converter/import result semantics、delete cascade、legacy DOM action bridge、flag/build fallback | `Phase 7 Sprint 2: World Info full owner cutover` |
| Background Library | React host、filter/sort、gallery presentation、upload/select/lock/unlock/auto/refresh entry points | `/api/backgrounds/*` action semantics、thumbnail/lazy-load、folder state、selection effects、slash commands、legacy background controller、flag/build fallback | `Phase 7 Sprint 3: Background Library full owner cutover` |
| Extensions Host | React drawer host、notify/manage/install/Extras controls、mount readiness presentation | extension discovery、manifest loading、script/style injection、Tavern Helper、regex extension、wand menu templates、install/update/delete protocols、`@sillytavern/*` aliases、protected mount-point lifecycle、flag/build fallback | `Phase 7 Sprint 4: Extensions Host full owner cutover`，并依赖 Phase 6 兼容验证 |

**Sprint 4-7 验证门**：
```powershell
bun run --cwd tests test:unit -- world-info-card-rendering.test.js world-info-import-feedback.test.js world-info-converters.test.js worldinfo-delete-cascade.test.js background-panel-controller.test.js thumbnail-placeholder-background.test.js workspace-react-panel-flags.test.js react-workspace-panels-helpers.test.js --runInBand
bun run build:react:workspace-panels
bun run test:compat
uv run python .docs/logic-description/react_workspace_panel_flags_sandbox_proof.py
bun run docs:check
```

---

### Phase 3: 主聊天工作区迁移（6 个月，最高风险）

**目标**：迁移核心聊天界面到 React，这是整个迁移最复杂的部分

归档说明：Phase 3 / 3B 已完成，旧开发 specs 已从 `.docs/specs` 清理；持久 traceability 保留在 Phase 3/3B briefs、[PROJECT_HISTORY](../PROJECT_HISTORY.md)、logic-description docs 和本路线图中。

**当前执行状态**：
- `Sprint 1 / Main Chat Message List Basic`：已交付为受 `features.react.panels.mainChatMessageList` 控制的 guarded React controller island。flag 开启且 workspace-panels bundle 可用时，React 会在 `#chat` 内挂载隐藏 host，并根据 legacy bridge state 保持 `#show_more_messages` 与可见 `.mes[mesid]` 直接子节点的顺序稳定；flag 关闭、bundle 缺失或挂载失败时自动 fail-closed 到 legacy message rendering。
- `Sprint 2 / Main Chat Rich Message Bodies`：已交付为同一 `mainChatMessageList` island 的 finalized rich-body contract boundary。React 通过 `public/script.js` rich-body snapshot bridge 和 `app/workspace-panels.tsx` 的 Zod schema 校验 visible / finalized / non-editing rows，并在可认领的既有 `.mes_block` 内插入 hidden per-row owner markers；flag 关闭、bundle 缺失、snapshot 缺失/不合法或 row 状态不安全时，该行继续完全由 legacy rich-body 路径拥有。
- `Sprint 3 / Main Chat Scroll And Positioning`：已交付为同一 `mainChatMessageList` island 的 current-session scroll restore boundary。React 现在按 `chatId` 记录阅读锚点、scroll offset、已展开历史窗口和 headless virtual measurements；用户切回 long chat 时，controller 会先通过 `dispatchAction('loadMoreUntilMessage', { anchorMessageId })` 复用 legacy `showMoreMessages()` 语义把历史窗口重新展开到包含保存锚点，再恢复原阅读区域。flag 关闭、bundle 缺失、snapshot 不安全或恢复失败时，主聊天继续回退到 legacy 默认打开结果。
- `Sprint 4 / Main Chat Streaming Transport Boundary`：已收敛并交付为同一 `mainChatMessageList` island 的 hidden streaming transport snapshot boundary，而不是 React-owned SSE/EventSource rewrite。`public/script.js` 继续拥有 `Generate()`、`StreamingProcessor`、provider transport 和 `.mes_text` token append；React 只消费 Zod 校验后的 `streamingTransport` payload，观察 transport phase、active message id、token/chunk count、fallback attempt、stop/error/completed terminal snapshot。处理规则见 [Main Chat Streaming Transport Bridge Processing Flow](../logic-description/main_chat_streaming_transport_bridge_processing_flow.md)。
- `Sprint 5 / Main Chat Streaming Control State`：已交付为同一 `mainChatMessageList` island 的 visible generation-control bridge。React hidden controller 现在消费 Zod 校验后的 `generationControl` payload，覆盖 `idle`、`streaming`、`recoveringPrimary`、`recoveringFallback`、`stopped`、`completed`、`error` phase；`public/script.js` 仍拥有 `Generate()`、`StreamingProcessor`、token append、stop、auto-recovery status、final retry、`#mes_continue` 和 `.generation_failure_retry` handlers。处理规则见 [Main Chat Generation Control Bridge Processing Flow](../logic-description/main_chat_generation_control_bridge_processing_flow.md)。
- `Sprint 6 / Main Chat Composer Basic Bridge`：已交付 hidden composer snapshot boundary。React 观察 textarea length、empty、focus、disabled/generating、sendability 和 active context；`#send_textarea`、`#send_but`、Enter/Shift+Enter、textarea clear、user-row append 和 submit/generation path 仍由 legacy owner 驱动，不把 prompt 原文放进 React marker。处理规则见 [Main Chat Composer Bridge Processing Flow](../logic-description/main_chat_composer_bridge_processing_flow.md)。
- `Sprint 7 / Main Chat Slash Command Bridge`：已交付 hidden slash-command snapshot boundary。React 观察 slash active/query length、autocomplete visibility、executing、paused、aborted 和 error label；`public/scripts/slash-commands.js` 继续拥有 parser、registry、execution、pause/continue/abort controller、autocomplete DOM 和 public exports。处理规则见 [Main Chat Slash Command Bridge Processing Flow](../logic-description/main_chat_slash_command_bridge_processing_flow.md)。
- `Sprint 8 / Main Chat Message Actions Bridge`：已交付为同一 `mainChatMessageList` island 的 hidden message-action snapshot boundary。`public/script.js` 现在为安全的 visible rows 输出 `messageActionSnapshots`，`app/workspace-panels.tsx` 用 Zod 校验后只在既有 `.mes_buttons` 里附加 hidden action owner marker；`public/scripts/chat-message-actions-controller.js`、copy/edit/delete/retry/swipe/reasoning handlers 和 visible `.extraMesButtonsHint` / `.extraMesButtons` 仍由 legacy 路径拥有，review 还补上了 open/close 后 `expanded` snapshot 的同步触发点。处理规则见 [Main Chat Message Actions Bridge Processing Flow](../logic-description/main_chat_message_actions_bridge_processing_flow.md)。
- `Sprint 9 / Main Chat Integration Closure`：当前完成定义为 approved guarded hidden-island scope complete，不等于 full SPA main chat rewrite。integration proof 覆盖 stored/long/mobile/streaming stop/retry/fallback/composer/slash/actions 的核心路径，文档记录 remaining visible-owner work，并把 provider transport / token append owner、visible composer、visible slash autocomplete/parser UI、visible MessageRow renderer 和 visible action menu owner 正式转入新增 Phase 3B。
- 当前交付刻意不重写 `messageFormatting()`、`updateMessageElement()`、`appendMediaToMessage()`、provider transport、token append、visible composer DOM、slash parser/autocomplete UI、visible message-action buttons 或 load-more 算法。Sprint 2 迁移的是 finalized rich-body bridge / owner split，不是新增 Markdown、代码高亮、LaTeX、媒体或文件能力；Sprint 4/5 迁移的是 streaming/generation observation schema boundary，不是 provider transport rewrite 或 provider pause/resume；Sprint 6/7 迁移的是 composer/slash hidden state observation，不是 visible input/autocomplete ownership cutover；Sprint 8 迁移的是 hidden action snapshot / owner-marker boundary，不是 visible action menu ownership cutover。
- TanStack 收口状态：当前 main-chat React slice 复用共享 `app/workspace-panels.tsx` bundle 与 TanStack Query shell，在 rich-body、scroll-restore、streaming transport、generation-control、composer、slash-command 和 message-action bridge 输入边界使用 Zod schema，并通过 `@tanstack/react-virtual` 落地 headless measurement / snapshot / restore controller；本阶段仍未引入新的 MessageRow JSX owner、React provider transport owner、TanStack Form-owned visible main-chat composer、TanStack Query-owned provider mutation, 或 TanStack Virtual visible message-window renderer，长聊天窗口语义继续由 legacy `chat_truncation` + `#show_more_messages` 控制。
- Phase 3 / Phase 3B 边界：Phase 3 已完成 hidden owner / observation / marker / fail-closed island 闭环；后续任何 visible-owner cutover 都应计入 Phase 3B，而不是回写 Phase 3 完成定义。

**Sprint 列表**：
- ✅ Sprint 1: 消息列表 - 基础渲染（3 周，已交付 guarded React message-list controller island；保持 direct-child `.mes[mesid]`、stored-chat rendering 和 long-chat load-more 语义）
- ✅ Sprint 2: 消息列表 - Rich Message Body（2 周，已交付 finalized rich-body bridge / hidden owner-marker boundary；不是新增 Markdown/媒体能力；归档 traceability 保留在 briefs / PROJECT_HISTORY）
- ✅ Sprint 3: 消息列表 - 滚动和定位（2 周，已交付 current-session per-chat 阅读位置恢复、expanded-history window restore 和 headless TanStack Virtual controller；归档 traceability 保留在 briefs / PROJECT_HISTORY）
- ✅ [Sprint 4: 流式生成 - Transport Boundary](briefs/react-phase3-remaining-main-chat-sprints.md#domain-sprint-4-streaming-transport-boundary)（2 周，已收敛并交付 hidden `streamingTransport` snapshot；不迁移 provider transport、SSE/EventSource owner 或 `.mes_text` token append）
- ✅ Sprint 5: 流式生成 - 控制状态（2 周，已交付 generation-control bridge/state snapshot；不迁移 provider transport、token append 或 provider pause/resume）
- ✅ [Sprint 6: 输入框 - 基础功能](briefs/react-phase3-remaining-main-chat-sprints.md#domain-sprint-6-basic-composer-bridge)（2 周，已交付 hidden composer snapshot；不迁移 visible textarea/send owner，不暴露 prompt 原文）
- ✅ [Sprint 7: 输入框 - 斜杠命令](briefs/react-phase3-remaining-main-chat-sprints.md#domain-sprint-7-slash-command-bridge)（3 周，已交付 hidden slash-command snapshot；不迁移 parser/registry/executor/autocomplete owner，不暴露 command text/args）
- ✅ Sprint 8: 消息操作 - 菜单（2 周，已交付 hidden message-action snapshot / owner-marker boundary；不迁移 visible action buttons 或 handlers owner）
- ✅ [Sprint 9: 整合测试](briefs/react-phase3-remaining-main-chat-sprints.md#domain-sprint-9-integration-closure)（2 周，当前 guarded hidden-island scope 已闭环；remaining visible-owner work 已正式转入 Phase 3B）

---

### Phase 3B: 主聊天可见 Owner 迁移（4 个月，最高风险）

**目标**：在当前 Phase 3 hidden-island 基线上，把主聊天剩余的 visible owner 逐项迁移到 React / TanStack surface，而不是把所有缺口合并成一次性 rewrite

📋 **详细规范**：Sprint 1 的归档 traceability 见 [react-phase3b-visible-message-row-renderer](briefs/react-phase3b-visible-message-row-renderer.md)；后续 sprint 进入实现前按各自边界单独创建 spec / brief，保持可回滚边界

**当前执行状态**：
- `Sprint 1 / Visible MessageRow Renderer` 已交付：`public/script.js` 现在为 safe stored / finalized / non-editing rows 输出 Zod 校验的 `messageRowSnapshots`，`app/workspace-panels.tsx` 在现有 `.mes[mesid]` root 上附加 visible React owner marker，并在同一 chat window 内允许 safe rows React-owned、editing/streaming/unsafe rows fail-closed 回退到 legacy。当前切口仍复用 legacy formatter / rich-body DOM / action shell / load-more 算法，而不是引入第二套 Markdown 或 provider renderer。
- `Sprint 2 / Visible Message Actions Owner` 已交付：safe visible rows 的 Copy / Edit / Delete / Retry / Swipe / Reasoning 等 action shell 现在由 React 可见 surface 承载，但它继续通过 legacy bridge 调用既有 handlers，并在编辑态或 unsafe row 上逐行 fail-closed 回退。
- `Sprint 3 / Visible Composer` 已交付：`#send_textarea` / `#send_but` 现在由 React visible composer owner 承载，并按 TanStack Form + Zod 维持 Enter、Shift+Enter、empty-submit、single-submit 和 mobile reachability 语义；provider transport 仍在后续 Sprint 5 切换。
- `Sprint 4 / Visible Slash Autocomplete And Parser UI` 已交付：主聊天 slash autocomplete、selection、paused / error status UI 现在由 React visible owner 承载；legacy parser / registry / executor / public exports 继续通过 compatibility adapter 保持稳定。
- `Sprint 5 / Provider Transport And Token Append Owner` 已按当前 closure spec 收口：标准 visible OpenAI direct-chat 的 `submitComposer`、`continueLast`、regenerate/retry 和 swipe request classification、provider attempt sequencing、token append、stop/fallback sequencing 与 assistant row finalization 由 React visible transport mutation 承载；non-OpenAI / group / dry-run / nested-visible 以及 quiet/background 兼容路径继续按 request 级别 fail-closed 回退 legacy，但它们不再阻止 Phase 3B 闭环宣称。
- `Phase 3B` 现在可以按“标准 visible OpenAI direct-chat transport 全部 React-owned”这个完成定义宣称已交付；这不等于要求 quiet/background 或其他兼容路径在同一阶段一并 React 化。
- `Phase 3B` 继续以当前 Phase 3 hidden-island 完成态为前置基线，不回写既有 Phase 3 已完成结论。
- 本阶段所有 React-owned 表单和输入面必须严格采用 TanStack Form + Zod；所有 provider-backed 查询或提交路径必须优先采用 TanStack Query；任何仍保留 legacy compatibility adapter 的 sprint 都必须写清 owner split 和退出计划。
- 本阶段不允许把这 5 个剩余 gap 合并成单个“大主聊天重写”任务；必须逐 sprint 切 visible owner，并在每步保留 guarded rollout / rollback 能力。

**Sprint 列表**：
- ✅ [`Sprint 1 / Visible MessageRow Renderer`](briefs/react-phase3b-visible-message-row-renderer.md)（3 周，已交付 safe stored / finalized / non-editing rows 的 visible owner marker / row-shell cutover；editing rows、unsafe rows、streaming in-flight rows 和结构不安全行继续 fallback）
- ✅ `Sprint 2 / Visible Message Actions Owner`（2 周，已交付 React-owned visible action shell；保留 protected selectors / hooks、legacy handlers 和 per-row fallback）
- ✅ `Sprint 3 / Visible Composer`（2 周，已交付 TanStack Form + Zod visible composer owner；保留 compatibility submit bridge，并在 rapid submit 上维持 legacy single-submit 语义）
- ✅ `Sprint 4 / Visible Slash Autocomplete And Parser UI`（3 周，已交付 React-owned visible slash autocomplete / status UI；legacy parser / registry / executor / public exports 保持稳定）
- ✅ `Sprint 5 / Provider Transport And Token Append Owner`（4 周，已完成标准 visible OpenAI direct-chat transport closure：React-owned visible transport 支持 `submitComposer` / `continueLast` / regenerate / retry / swipe；excluded compatibility path 继续 legacy fallback）

**Phase 3B 验证门**：
```powershell
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-streaming.e2e.js
bun run test:compat
bun run perf:interaction
bun run docs:check
```

**Phase 3 / 3B 后剩余项归属表**：

| 剩余项 | 后续归属 | 当前路线图处理 |
|---|---|---|
| `non-OpenAI` / group / dry-run / nested visible transport | `Phase 4A` 补齐能力，`Phase 7 Sprint 5` 完成 full owner cutover | Phase 3B closure 后的第一批 main-chat backlog；进入实现前必须单独写 spec，继续使用 guarded request-level fallback；Phase 4A 证明所有 transport path 可由 React owner 承担后，Phase 7 才能移除 fallback。 |
| `quiet` / background generation transport | `Phase 4A` 补齐能力，`Phase 7 Sprint 5` 完成 full owner cutover | 与标准 visible direct-chat 分开处理；只有在 background / quiet 行为、provider side effects 和 recovery 语义有独立 proof 后才能迁入 React owner；最终 fallback 退出归 Phase 7。 |
| legacy `messageFormatting()` / rich media / file / LaTeX / code-block formatter owner | `Phase 4B` 抽取 renderer contract，`Phase 7 Sprint 6` 完成 full owner cutover | 当前 Phase 3B 复用 legacy formatted DOM；Phase 4B 先抽取 formatter contract 并保护扩展挂钩，Phase 7 再切 React renderer full owner。 |
| legacy `chat_truncation` / `#show_more_messages` load-more 算法 | `Phase 4B` 抽取 windowing contract，`Phase 7 Sprint 6` 完成 full owner cutover | 当前 React 只做 headless measurement / restore；Phase 4B 先证明 long-chat performance 和 compatibility，Phase 7 再移除 legacy load-more owner。 |
| `globalThis.SillyTavern`、`eventSource`、`event_types`、jQuery globals | Phase 4 / Phase 6 建兼容层，`Phase 7 Sprint 7` 审核是否可退出 | 通过 Zustand stores 和兼容层逐步收口；兼容 exports 在 Phase 6 维护期内保留，Phase 7 只能在常用扩展验证和废弃周期完成后决定删除、冻结或长期保留。 |
| third-party extension API、mount compatibility、migration guide | Phase 4 / Phase 6 建桥和维护，`Phase 7 Sprint 4 / Sprint 7` 完成 owner/fallback 退出判断 | Phase 4 建兼容桥和迁移指南，Phase 6 维护废弃警告、社区迁移和常用扩展验证；Extensions Host full owner cutover 不得先于这些证据完成。 |
| Express route owner / typed API / derived-cache ORM | Phase 5 | Hono / Drizzle 仍是后端现代化阶段，不与 Phase 3B 主聊天 UI closure 混合。 |
| 移除 guarded island fallback 或切 full SPA workspace | `Phase 7: Full owner cutover and legacy fallback retirement` | 不再悬空为泛化 Future；Phase 7 各 sprint 逐面移除 fallback，full SPA workspace shell 仍必须有 ADR，证明扩展兼容、性能和 rollback 策略。 |

---

### Phase 4: 状态管理迁移（3 个月）

**目标**：用 Zustand 替代全局对象，建立可预测的状态管理，并承接 Phase 3 / 3B 留下的 main-chat compatibility transport / renderer extraction backlog，为 Phase 7 full owner cutover 提供状态和兼容前置

📋 **详细规范**：[Phase 4 README](../specs/react-phase4-state-management/README.md)

**Main-chat backlog 子阶段**：
- `Phase 4A / Main-chat compatibility transport expansion`：已建立 visible transport support classifier，标准 OpenAI direct-chat request 可归入 React-owned path；non-OpenAI、group、dry-run、nested visible、quiet/background generation 继续登记为 legacy fallback 或 unsupported-with-reason，最终退出归 Phase 7 Sprint 5。
- `Phase 4B / Main-chat renderer extraction`：已抽取 renderer/windowing current-behavior contract。safe finalized rows 是 Phase 7 renderer candidate；editing、streaming、extension-mutated、unsafe 和 missing `.mes_text` rows 继续 legacy fallback；long-chat windowing owner 仍是 legacy `chat_truncation` + `#show_more_messages`，最终退出归 Phase 7 Sprint 6。

**Sprint 列表**：
- ✅ [Sprint 1: Zustand stores 创建](../specs/react-phase4-state-management/phase4-sprint1-zustand-stores.md)（3 周，已交付 workspace panel store 和 main-chat observation store）
- ✅ [Sprint 2: 兼容层建立](../specs/react-phase4-state-management/phase4-sprint2-compat-bridge.md)（3 周，已交付 global compatibility bridge；legacy globals 不被替换）
- ✅ [Sprint 3: 扩展迁移指南](../specs/react-phase4-state-management/phase4-sprint3-extension-guide.md)（2 周，已更新第三方扩展兼容矩阵）
- ✅ [Phase 4A: Main-chat compatibility transport expansion](../specs/react-phase4-state-management/phase4a-main-chat-transport-expansion.md)（已建立 transport support/fallback classifier；不等于 Phase 7 full owner cutover）
- ✅ [Phase 4B: Main-chat renderer extraction](../specs/react-phase4-state-management/phase4b-main-chat-renderer-extraction.md)（已建立 renderer/windowing contract 和 long-chat/extension proof；不等于 Phase 7 full owner cutover）

**验证门**：
```powershell
bun run test:compat
bun run --cwd tests test:unit -- main-chat-visible-transport-owner.test.js chat-generation-lifecycle.test.js react-workspace-panels-helpers.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-streaming.e2e.js
bun run perf:interaction
```

**Phase 7 handoff 条件**：
- `Phase 4A` 已登记 transport support/fallback 分类；Phase 7 Sprint 5 必须在删除 request-level fallback 前补齐 provider matrix、stop/retry/fallback、token append/finalization 和 rollback ADR。
- `Phase 4B` 已登记 renderer/windowing contract；Phase 7 Sprint 6 必须在删除 formatter/windowing fallback 前补齐 `.mes_text` / extension mutation / editing / streaming / long-chat performance 和 rollback ADR。
- Zustand/global bridge sprints 不得顺手迁移 provider transport 或 renderer owner；删除或冻结这些 owner 只能通过 Phase 7 cutover specs 完成。

---

### Phase 5: 后端 API 现代化（3 个月）

**目标**：用 Hono 替代 Express，建立类型安全的 API 层

📋 **详细规范**：[Phase 5 README](../specs/react-phase5-backend-api/README.md)

**Sprint 列表**：
- 📋 [Sprint 1: Hono 路由搭建](../specs/react-phase5-backend-api/phase5-sprint1-hono-routes.md)（3 周）
- 📋 [Sprint 2: Drizzle derived cache](../specs/react-phase5-backend-api/phase5-sprint2-drizzle-derived-cache.md)（3 周）
- 📋 [Sprint 3: Express sunset gate](../specs/react-phase5-backend-api/phase5-sprint3-express-sunset-gate.md)（2 周）

**进入条件与边界**：
- Hono 接管前必须先有 ADR，证明 Express middleware order、sessions、CSRF、auth wall、static/public routes、private endpoints、uploads、error/404 handlers 的兼容策略。
- Drizzle 只能先接管 derived SQLite cache；file-backed user data 仍是正本。任何把 SQLite 升级为 canonical storage 的方案必须另起 ADR。
- Express sunset 不得在 Hono route parity、middleware-order proof、API compatibility tests、startup proof 和 rollback plan 完成前开始。

**验证门**：
```powershell
bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand
bun run test:unit
bun run test:compat
bun run docs:check
```

---

### Phase 6: 扩展兼容性演进（持续）

**目标**：维护第三方扩展兼容性，提供迁移指南

📋 **详细规范**：[Phase 6 README](../specs/react-phase6-extension-compat/README.md)

**持续工作**（非 Sprint 结构）：
- 兼容层维护期（至少 6 个月）
- 废弃警告和迁移文档
- 扩展市场审核和社区支持

说明：`Extensions` 作为用户可见 drawer 宿主的 React UI 迁移属于 Phase 2；第三方扩展 API、挂载兼容、迁移指南和社区支持仍由 Phase 4 / Phase 6 负责。

**退出条件**：
- Phase 6 的完成不等于兼容层删除；它只提供 Phase 7 cutover 的前置证据。
- 兼容层废弃、冻结或删除前必须有常用扩展验证清单、迁移指南、废弃警告周期、用户可回滚方案和 `bun run test:compat` 通过记录。
- `globalThis.SillyTavern`、`eventSource` / `event_types`、`@sillytavern/*` alias 的任一破坏性变更都必须走 Phase 6 兼容评审和 Phase 7 cutover gate，不得作为 Phase 4/5 的顺手清理。

---

### Phase 7: Full owner cutover and legacy fallback retirement（4-6 个月，ADR-gated）

**目标**：在 Phase 1-6 的 React islands、visible owners、Zustand/global bridge、typed API、extension compatibility 证据齐备后，逐面完成 full owner cutover，移除或冻结 legacy owner / guarded fallback / build-missing fallback，而不是继续保留双 owner。

📋 **详细规范**：[Phase 7 README](../specs/react-phase7-full-owner-cutover/README.md)

**进入条件**：
- Phase 1-3B 对应 surface 的 guarded island / visible owner 已开启并通过回归门。
- Phase 4A / 4B 对 main-chat transport、formatter、windowing 的 excluded paths 已完成独立 spec 和 proof。
- Phase 5 对需要 typed API / route owner 的 surface 已完成 route parity、middleware-order proof 和 rollback plan。
- Phase 6 对 extension API、mount compatibility、Tavern Helper、regex extension、`@sillytavern/*` alias 和常用扩展验证已完成维护期证据。
- 每个 sprint 必须有 ADR 或 ADR update，说明本次移除 fallback 的范围、回滚策略、用户数据风险、扩展兼容风险和性能证据。

**Sprint 列表**：
- 📋 [Sprint 1: Character Library full owner cutover](../specs/react-phase7-full-owner-cutover/phase7-sprint1-character-library-full-owner-cutover.md)（2-3 周）
  React 接管 tag filtering、bulk side effects、delete confirmation integration、legacy `characters` global sync replacement 和 list lifecycle；移除 character-library panel 的 legacy fallback 前必须保留 protected selectors 或提供兼容 shim。
- 📋 [Sprint 2: World Info full owner cutover](../specs/react-phase7-full-owner-cutover/phase7-sprint2-world-info-full-owner-cutover.md)（3-4 周）
  React 接管 World Info prompt activation、regex placement UI handoff、converter/import result handling、delete cascade 和 entry lifecycle；legacy `public/scripts/world-info.js` 只保留兼容出口或被明确废弃。
- 📋 [Sprint 3: Background Library full owner cutover](../specs/react-phase7-full-owner-cutover/phase7-sprint3-background-library-full-owner-cutover.md)（3 周）
  React 接管 background file actions、thumbnail/lazy-load lifecycle、folder state、selection/lock side effects 和 background slash command handoff；legacy background controller fallback 退出。
- 📋 [Sprint 4: Extensions Host full owner cutover](../specs/react-phase7-full-owner-cutover/phase7-sprint4-extensions-host-full-owner-cutover.md)（4-6 周）
  React 接管 extension discovery/status presentation、manifest lifecycle orchestration、install/update/delete UI protocol 和 mount readiness owner；第三方 extension execution、Tavern Helper、regex extension 和 `@sillytavern/*` alias 的删除/冻结必须由 Phase 6 证据决定，不能直接移除。
- 📋 [Sprint 5: Main-chat transport full owner cutover](../specs/react-phase7-full-owner-cutover/phase7-sprint5-main-chat-transport-full-owner-cutover.md)（4-6 周）
  React transport owner 覆盖 OpenAI、non-OpenAI、group、dry-run、nested visible、quiet/background generation、stop/retry/fallback/token append/finalization；移除 request-level legacy fallback 前必须通过 provider matrix proof。
- 📋 [Sprint 6: Main-chat renderer and windowing full owner cutover](../specs/react-phase7-full-owner-cutover/phase7-sprint6-main-chat-renderer-windowing-full-owner-cutover.md)（4-6 周）
  React renderer owner 覆盖 formatter、rich media/file/LaTeX/code blocks、long-chat load-more/windowing、editing/unsafe/streaming row transitions；移除 `.mes_text` legacy formatter owner 前必须通过 extension compatibility 和 long-chat performance proof。
- 📋 [Sprint 7: Workspace shell and global compatibility retirement decision](../specs/react-phase7-full-owner-cutover/phase7-sprint7-workspace-shell-global-compatibility-decision.md)（3-4 周）
  决定 full SPA workspace shell、legacy jQuery shell、`globalThis.SillyTavern`、`eventSource`、`event_types`、`@sillytavern/*` 的最终形态：删除、冻结为 compatibility facade，或进入长期支持。该 sprint 不能在 Phase 6 维护期证据不足时强行删除兼容面。

**Full owner cutover 验证门**：
```powershell
bun run build:lib
bun run build:react
bun run build:react:character-library
bun run build:react:workspace-panels
bun run test:unit
bun run test:compat
bun run --cwd tests test:e2e -- login.e2e.js chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-streaming.e2e.js
bun run perf:startup
bun run perf:interaction
bun run docs:check
```

**退出条件**：
- 每个 migrated surface 只有一个明确 runtime owner；legacy owner 若保留，必须是 documented compatibility facade，而不是可竞争的第二实现。
- Guarded fallback、build-missing fallback 和 legacy DOM bridge 要么删除，要么在 ADR 中冻结为长期兼容策略并有测试覆盖。
- 所有语义 Doc ID、tech docs、logic-description docs、PROJECT_HISTORY 和 ADR 都反映最终 owner split。

---

## 验证矩阵

| 变更表面 | 最低验证要求 |
|---|---|
| 构建工具 | `bun run build:lib`；React page/panel 变更另跑 `bun run build:react`、`bun run build:react:character-library` 或 `bun run build:react:workspace-panels` |
| TypeScript 配置 | `bun run lint` + `bun run test:unit` |
| React 页面迁移 | 对应页面的 E2E 测试通过 |
| 角色库迁移 | `character-list-*.test.js` + `bun run test:compat` |
| 主聊天迁移 | `chat-*.e2e.js` + `bun run test:compat` + `bun run perf:interaction` |
| Phase 4A transport expansion | focused provider/transport unit tests + `chat-message-streaming.e2e.js` + `bun run test:compat` + rollback/fallback proof |
| Phase 4B renderer extraction | `chat-message-rendering.e2e.js` + `chat-message-layout.e2e.js` + long-chat performance proof + extension compatibility proof |
| Zustand/global bridge | store unit tests + compatibility bridge tests + `bun run test:compat` |
| API 路由迁移 | 对应 endpoint 单元测试 + Postman/curl 手动验证 |
| 扩展兼容性 | `bun run test:compat` + 手动测试 3-5 个常用扩展 |
| Phase 7 full owner cutover | 对应 surface focused unit/E2E + `bun run build:lib` + `bun run build:react` + `bun run build:react:character-library` / `bun run build:react:workspace-panels` + `bun run test:compat` + startup/interaction perf + docs/ADR cutover checklist |
| 性能回归 | `bun run perf:startup` + `bun run perf:interaction` |

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|---|---|---|---|
| React 迁移导致扩展失效 | 高 | 中 | 保持兼容层至少 6 个月，提前与扩展作者沟通；任何破坏性删除必须进入 Phase 7 Sprint 4 / Sprint 7 gate |
| 性能劣化 | 中 | 中 | 虚拟滚动 + 性能基准测试，每个 Phase 运行 perf runner |
| 用户数据丢失 | 极高 | 低 | 保持文件存储不变，充分测试迁移脚本 |
| 开发成本超支 | 中 | 高 | 渐进式迁移，每个 Phase 可独立交付和暂停 |
| 双 owner 长期共存导致行为漂移 | 高 | 中 | 每个 legacy owner / fallback 必须登记到 Phase 7 sprint；未能删除的兼容面必须 ADR-frozen 并有测试覆盖 |
| 技术栈过时 | 低 | 低 | TanStack 生态活跃，React 19 稳定，定期更新依赖 |

## ADR 需求

以下变更需要独立 ADR 批准：

1. **[ADR-0007: React page and panel islands with legacy fallbacks](../adr/0007-react-page-islands-with-legacy-fallbacks.md)**
   - 决策：先以 feature-flagged React islands 迁移 `/login`、`/setup`、`/settings`，以及像 character library 这样的早期工作区 panel
   - 理由：降低早期 React 化风险，保持 legacy rollback、扩展兼容边界和同入口迁移体验
   - 权衡：短期保留 React/jQuery 双实现、共享 build fallback，以及面板 bridge 复杂度

2. **ADR-YYYY: 从 Express 迁移到 Hono**
   - 决策：用 Hono 替代 Express 作为 API 框架
   - 理由：类型安全、性能、现代化
   - 权衡：生态成熟度、现有中间件迁移成本

3. **ADR-ZZZZ: 引入 Drizzle ORM**
   - 决策：用 Drizzle 管理 SQLite derived cache
   - 理由：类型安全、迁移管理、查询构建
   - 权衡：学习曲线、对现有 SQL 查询的重写成本

4. **ADR-AAAA: Phase 7 full owner cutover / guarded fallback retirement**
   - 决策：逐 surface 判断是否删除 guarded island fallback、build-missing fallback、legacy DOM bridge，或冻结为长期 compatibility facade；full SPA workspace shell 也必须在此 ADR 家族下决策
   - 理由：只有当扩展兼容、性能、路由、rollback、用户数据安全和对应 Phase 7 sprint checklist 均有证明时才允许推进
   - 权衡：更少 legacy 复杂度和更清晰 owner split vs. 更高上线、扩展破坏和回滚成本
   - 覆盖：Character Library、World Info、Background Library、Extensions Host、main-chat transport、main-chat renderer/windowing、workspace shell/global compatibility exports 必须分别有 ADR 或 ADR update

5. **ADR-BBBB: Canonical storage 变更**
   - 决策：是否让 SQLite / ORM 从 derived cache 进入用户数据正本路径
   - 理由：当前路线图明确 file-backed user data 是正本，任何改变都超出 Phase 5 默认边界
   - 权衡：查询能力和类型安全 vs. 数据迁移、备份、回滚和用户数据丢失风险

## 里程碑时间线

```
2026 Q2 (月 4-6)：Phase 0 基础设施准备
  ├─ 月 4: Vite 替换 Webpack
  ├─ 月 5: TypeScript 配置 + React 开发环境
  └─ 月 6: Tailwind CSS 集成 + 首个 React 页面 demo

2026 Q3 (月 7-9)：Phase 1 独立页面迁移
  ├─ 月 7: Login 页面 React 重写
  ├─ 月 8: Setup 页面 React 重写
  └─ 月 9: Settings 面板 React 重写

2026 Q4 - 2027 Q1 (月 10-2)：Phase 2 侧边栏和面板迁移
  ├─ 月 10: 角色库面板 React island（列表/搜索/批量，含虚拟滚动）
  ├─ 月 11: 世界信息面板 React 重写
  ├─ 月 12: 背景库面板 React 重写
  └─ 月 2: Extensions 面板宿主 React 重写

2027 Q1-Q2 (月 1-6)：Phase 3 主聊天 hidden-island 迁移
  ├─ 月 1-2: 消息列表承载层、rich-body bridge 和 scroll restore
  ├─ 月 3: streaming transport / generation-control observation
  ├─ 月 4: composer / slash hidden-state observation
  ├─ 月 5: message-action snapshot boundary
  └─ 月 6: hidden-island integration closure

2027 Q3-Q4 (月 7-10)：Phase 3B 主聊天 visible-owner 迁移
  ├─ 月 7: visible MessageRow renderer
  ├─ 月 8: visible message actions owner
  ├─ 月 9: visible composer + slash autocomplete/parser UI
  └─ 月 10: provider transport / token append owner + Phase 3B closure

2027 Q4 - 2028 Q1 (月 11-1)：Phase 4 状态管理迁移
  ├─ 月 11: Zustand stores 搭建
  ├─ 月 12: 全局兼容层建立
  ├─ 月 1: 扩展迁移指南 + 兼容性验证
  └─ 后续 backlog: Phase 4A transport expansion + Phase 4B renderer extraction（按独立 spec 分批执行）

2028 Q1-Q2 (月 2-4)：Phase 5 后端 API 现代化
  ├─ 月 2: Hono API 路由搭建
  ├─ 月 3: Drizzle ORM 集成
  └─ 月 4: Express → Hono 完全切换

2028 Q2+：Phase 6 扩展兼容性演进（持续）
  ├─ 维护期: 常用扩展验证、迁移指南、废弃警告
  └─ 输出: Phase 7 Sprint 4 / Sprint 7 所需的删除、冻结或长期支持证据

2028 Q3-Q4：Phase 7 full owner cutover and legacy fallback retirement（ADR-gated）
  ├─ Sprint 1-3: Character Library / World Info / Background Library full owner cutover
  ├─ Sprint 4: Extensions Host full owner cutover
  ├─ Sprint 5-6: Main-chat transport / renderer / windowing full owner cutover
  └─ Sprint 7: workspace shell 和 global compatibility retirement decision
```

## 成功标准

迁移完成后，EmberDesk 应达到：

✅ **功能完整性**：所有现有功能在 React 版本中可用  
✅ **性能提升**：启动时间 < 当前基准，交互响应 < 100ms  
✅ **扩展兼容性**：至少 80% 常用扩展无需修改即可工作  
✅ **测试覆盖率**：单元测试覆盖率 > 70%，E2E 覆盖核心流程  
✅ **类型安全**：TypeScript 严格模式，前后端类型共享  
✅ **开发体验**：HMR < 200ms，类型提示完整，构建 < 30s  
✅ **Owner 清晰**：每个迁移 surface 只有一个 runtime owner；legacy 代码若保留，必须是 documented compatibility facade
✅ **Fallback 有归属**：guarded fallback、build-missing fallback、legacy DOM bridge、global compatibility exports 均已删除或由 ADR 冻结为长期支持面
✅ **文档完备**：用户迁移指南、扩展开发文档、ADR 记录、Phase 7 cutover checklist 和最终 owner split 均已更新

## 退出策略

如果迁移过程中遇到无法解决的问题，应：

1. **回退方案**：保持 jQuery 版本可用，通过 feature flag 切换
2. **部分迁移**：仅迁移低风险页面（Login、Setup、Settings），保留主聊天为 jQuery
3. **冻结路线图**：记录当前进度和阻塞原因，等待技术债偿还或外部条件变化

## 相关语义 ID 和代码绑定点

语义 ID：
- `page.chat_workspace`
- `page.login`
- `page.setup`
- `page.settings`
- `feature.character_library_panel`
- `feature.chat_message_rendering`
- `feature.chat_message_actions`
- `feature.world_info_panel`
- `feature.background_library_panel`
- `feature.extension_panel_open`
- `term.shared_browser_library`

当前稳定性敏感绑定点：
- `app/client.tsx`, `app/router.tsx`, `app/routeTree.gen.ts` (共享 React app shell 和 TanStack Router route tree)
- `app/routes/login.tsx`, `app/routes/setup.tsx`, `app/routes/settings.tsx` (已交付 React page islands)
- `app/components/settings/*`, `app/lib/settings-helpers.js` (React Settings 字段、payload 和 coverage ledger)
- `app/character-library-panel.tsx`, `app/components/character-library/*`, `app/lib/character-library-helpers.ts` (React character-library panel island)
- `src/react-login-feature.js`, `src/react-setup-feature.js`, `src/react-settings-feature.js`, `src/react-character-library-feature.js`, `src/workspace-react-features.js` (feature flag 和 workspace panel bootstrap；当前 payload 包含 `characterLibrary`、`mainChatMessageList`、`worldInfo`、`backgroundLibrary`、`extensionsHost`)
- `public/script.js`, `public/scripts/backgrounds.js`, `public/scripts/extensions.js`, `public/scripts/character-library-react-sync.js`, `public/scripts/workspace-panels-react-bridge.js` (legacy workspace bridge、main-chat/background/extensions host state event、character-library sync、workspace-panel fail-closed bundle loader 和 fallback path)
- `src/users.js`, `src/server-main.js`, `src/middleware/react-login-serve.js` (React route hosting、build-missing fallback 和 legacy redirect)
- `app/workspace-panels.tsx` (workspace panel bundle；提供 TanStack Query provider shell、World Info editor/import/export controls、Background Library filter/gallery/action controls、Extensions Host notify/manage/install/Extras controls，以及 main-chat direct-child message-window controller、finalized rich-body snapshot/owner-marker boundary、current-session scroll restore、visible row/actions/composer/slash owners 与标准 direct-chat visible transport mutation；legacy formatter、quiet/background generation、excluded compatibility transport paths 和 slash registry/executor 仍留在原 owner)
- `default/config.yaml` (当前 `features.react.pages.*` 和 `features.react.panels.*` 默认值)
- `globalThis.SillyTavern`, `eventSource` / `event_types`, `@sillytavern/*` (兼容层保持)

未来规划绑定点：
- future React-owned main-chat modules under `app/components/main-chat/*`, `app/lib/main-chat/*` and the matching TanStack Form / Query integration layer（Phase 4A / 4B 的 excluded transport expansion、formatter extraction、long-chat renderer/windowing extraction；exact file map to be fixed per-sprint spec）
- `app/stores/*` (Phase 4 Zustand stores)
- `app/server/routes/*` (Phase 5 Hono API)
- `app/compat/globalBridge.ts` (Phase 4 全局兼容层)
- Phase 7 cutover specs / ADR updates will bind final owner exits for character library, World Info, background library, extensions host, main-chat transport, main-chat renderer/windowing, workspace shell, and global compatibility exports; exact file map must be fixed per sprint before deleting or freezing any fallback.

## 相关文档

- [原现代化路线图](modernization-roadmap.md) - 已于 2026-06-05 冻结
- [主聊天后继者范围](main-chat-successor-scope.md) - 主聊天 UX 北极星
- [前端 jQuery 切片迁移](frontend-jquery-slice-migration.md) - 原 page controller 模式
- [第三方扩展兼容性](third-party-extension-compatibility.md) - 兼容性保护表面
- [React settings payload processing flow](../logic-description/react_settings_payload_processing_flow.md) - React `/settings` form defaults、save payload、legacy Vertex AI round-trip 与 advanced reasoning effort 兼容规则
- [React character-library sync processing flow](../logic-description/react_character_library_sync_processing_flow.md) - React character-library island 与 legacy `characters` 状态同步规则
- [React workspace panel flags processing flow](../logic-description/react_workspace_panel_flags_processing_flow.md) - workspace React feature payload、HTML bootstrap 注入和 workspace-panel host/status bridge 边界
- [Background Library Panel](../db/features/background-library-panel.md) - Phase 2 Sprint 6 当前 guarded action island 与 legacy-owned 行为边界
- [Extensions Panel Open](../db/features/extension-panel-open.md) - Phase 2 Sprint 7 当前 guarded action island 与 legacy-owned 扩展行为边界
- [ADR-0007: React page and panel islands with legacy fallbacks](../adr/0007-react-page-islands-with-legacy-fallbacks.md) - Phase 0-3B guarded island / fallback 基线；Phase 7 cutover ADR update 必须显式说明哪些 fallback 被删除、冻结或长期支持
- React 推荐技术栈：`C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.docs\tech\recommended-stacks\react.md` - 技术选型来源

## 下一步行动

1. **保持 Phase 3 / 3B 回归门常跑**：后续 Phase 4+ 变更继续以 `chat-message-rendering.e2e.js`、`chat-message-layout.e2e.js`、`chat-message-streaming.e2e.js` 和 `bun run test:compat` 保护当前 hidden/visible owner split，不回退已完成的 main-chat closure。
2. **继续执行 TanStack 约束**：后续任何 React-owned main-chat 查询、mutation 或表单输入仍默认使用 TanStack Query + TanStack Form + Zod，除非新的 spec/ADR 明确记录例外和退出计划。
3. **执行 Phase 4A / 4B backlog**：quiet/background、non-OpenAI、group、dry-run、nested transport 进入 `Phase 4A`；legacy formatter、media/file/code/LaTeX rich body 和 long-chat load-more/windowing 进入 `Phase 4B`。每项必须单独立 spec、保留 guarded fallback，并且不得重写已完成的 Phase 3 / 3B 结论。
4. **准备 Phase 7 cutover specs 和 ADR update**：Character Library、World Info、Background Library、Extensions Host、main-chat transport、main-chat renderer/windowing、workspace shell/global compatibility exports 都必须在实现前列出当前 legacy owner、fallback path、删除/冻结条件、回滚方案和验证门。
5. **把未删除 fallback 登记为长期兼容策略**：任何 Phase 7 后仍保留的 `globalThis.SillyTavern`、`eventSource`、`event_types`、`@sillytavern/*`、legacy DOM bridge 或 build-missing fallback，必须有 ADR 冻结理由和持续测试覆盖，不能继续作为未排期债务存在。
