# EmberDesk React 现代化重构路线图

## 模块职责

本文档定义 EmberDesk 从 jQuery 单体应用迁移到现代 React 生态的完整路线图。这是一个 12-18 个月的渐进式重构计划，在保持产品可用性和扩展兼容性的前提下，逐步替换技术栈核心组件。

## 状态

状态：执行中；Phase 0 基础设施已落地，Phase 1 已交付，Phase 2 Sprint 1-7 已按 guarded panel island 边界交付，Phase 3 Sprint 1-3 和 Sprint 5 已按 guarded main-chat island 边界交付；Character Library、World Info、Background Library、Extensions Host 和当前 main-chat controller 均保留同入口 legacy fallback，flag 关闭或 bundle 缺失时不替换原 surface
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
| 状态 | legacy globals / jQuery state | 当前保留 | Zustand 属于 Phase 4 未来候选，尚未进入当前依赖；`globalThis.SillyTavern`、`eventSource`、`event_types` 仍是兼容 owner。 |
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
7. **Page / panel island 优先**：Phase 1 的 React 页面和早期 Phase 2 的工作区面板都以 feature-flagged island 形式上线，必须保留 legacy fallback；全站 SPA、主工作区 shell 和扩展宿主迁移仍按后续 Phase 推进

## 迁移阶段

### Phase 0: 基础设施准备（3 个月）

**目标**：搭建 React 基础设施，不改变现有功能

📋 **详细规范**：[Phase 0 README](../specs/react-phase0-infrastructure/README.md)

**当前执行状态**：
- Phase 0 基础设施已落地到当前代码：`vite.config.ts` 同时承载 `/lib.js` 构建、共享 React app 构建、character-library panel bundle 和 workspace panel action-island bundle；`tsconfig.json` 覆盖 `app/**/*`、`src/**/*` 与 `public/**/*`；`eslint.config.js` 已把 `app/**/*.{ts,tsx}` 纳入 TS/TSX lint 边界。
- React app shell 已存在于 `app/client.tsx`、`app/router.tsx`、`app/routes/*` 和 `app/routeTree.gen.ts`；Tailwind v4 通过 `tailwind.config.js`、`postcss.config.js` 与 `app/styles/globals.css` 接入 React app。
- Webpack 只保留为 `/lib.js` deprecated fallback；当前主构建入口是 Vite。

**Sprint 列表**：
- ✅ [Sprint 1: Vite 迁移](../specs/react-phase0-infrastructure/phase0-sprint1-vite-migration.md)（2 周，Vite 8 已作为 `/lib.js` 主构建，Webpack 保留 deprecated fallback）
- ✅ [Sprint 2: TypeScript 配置](../specs/react-phase0-infrastructure/phase0-sprint2-typescript-config.md)（2 周，`tsconfig.json` 与 ESLint TS/TSX 边界已覆盖 React app）
- ✅ [Sprint 3: React 开发环境](../specs/react-phase0-infrastructure/phase0-sprint3-react-dev-env.md)（2 周，React 19 + TanStack Router app shell 已承载 `/login`、`/setup`、`/settings`）
- ✅ [Sprint 4: Tailwind CSS 集成](../specs/react-phase0-infrastructure/phase0-sprint4-tailwind-integration.md)（2 周，Tailwind v4 / PostCSS 已接入 `app/styles/globals.css` 和 React route/component classes）

---

### Phase 1: 独立页面迁移（3 个月）

**目标**：迁移登录、Setup、Settings 等独立页面到 React

📋 **详细规范**：[Phase 1 README](../specs/react-phase1-independent-pages/README.md)

**当前执行状态**：
- `Sprint 1 / Login`：React 页面已上线并默认开启，`/login.html` 保留 legacy 回退入口；React 登录流程已按路线图完成 TanStack Form / Zod / TanStack Query 收口。
- `Sprint 2 / Setup`：React 页面已交付并由 `features.react.pages.setup` 控制，默认保持关闭；`/setup.html` 保留 legacy 回退入口；React setup 流程已按路线图完成 TanStack Form / Zod / TanStack Query 收口。
- `Sprint 3 / Settings`：React `/settings` 已交付并由 `features.react.pages.settings` 控制；flag 开启且 React build 存在时进入独立 Settings 页面，关闭或缺 build 时回退到 legacy `/` 工作区；本 Sprint 已严格采用 TanStack Form / Zod / TanStack Query，覆盖更广的 General 控制、fallback / Vertex AI / prompt post-processing、更多 UI 设置，以及 Advanced 中的大部分 power-user 设置面。legacy `vertexai` source 会显示为 Google + Vertex AI 并在未关闭 Vertex AI 时保存回 `vertexai`；高级 reasoning effort 值 `min` / `max` / `none` / `minimal` / `xhigh` 保持可见和可保存。用户可见语义见 [`page.settings`](../db/pages/settings.md)，当前 payload 规则见 [React settings payload processing flow](../logic-description/react_settings_payload_processing_flow.md)。

**Sprint 列表**：
- ✅ [Sprint 1: Login 页面 React 重写](../specs/react-phase1-independent-pages/phase1-sprint1-login-page.md)（2 周，React 实现已上线并默认开启 feature flag；TanStack Form / Zod / Query 已完成收口）
- ✅ [Sprint 2: Setup 页面 React 重写](../specs/react-phase1-independent-pages/phase1-sprint2-setup-page.md)（2 周，React 实现已交付并挂在 `features.react.pages.setup` 下；`/setup.html` 保留 legacy 回退入口；TanStack Form / Zod / Query 已完成收口）
- ✅ [Sprint 3: Settings 面板 React 重写](../specs/react-phase1-independent-pages/phase1-sprint3-settings-panel.md)（4 周，React `/settings` 已交付并挂在 `features.react.pages.settings` 下；覆盖 General / Providers / User Interface / Advanced 的 Sprint 3 设置切片；TanStack Form / Zod / Query 已完成收口）

---

### Phase 2: 侧边栏和面板迁移（5 个月）

**目标**：迁移角色库、世界信息、背景库、扩展宿主面板等主工作区侧边栏/面板到 React

📋 **详细规范**：[Phase 2 README](../specs/react-phase2-sidebars/README.md)

**当前执行状态**：
- `Sprint 1-3 / Character Library`：已作为同一条交付路径收束为受 `features.react.panels.characterLibrary` 控制的 React character-library panel island。flag 开启且 bundle 可用时，用户仍从原工作区入口打开角色库，但 toolbar/list surface 改为 React island；flag 关闭或 build 缺失时继续走 legacy panel fallback。
- 当前交付保持现有 pagination shell、`entitiesFilter` / `getEntitiesList()` 语义、bulk delete / bulk tag 流程、delete dialog 和受保护 DOM 选择器；只把列表渲染、搜索/排序视图状态和 bulk 呈现收口到 React。
- TanStack 收口状态：`/api/characters/all` 的读取与 mount-time refresh 由 TanStack Query 承接；搜索 / 排序 / bulk toolbar 呈现态由 TanStack Form + Zod 承接；标签过滤继续复用 legacy tag controls 与 `entitiesFilter` 语义，并通过 `LegacyElementHost` 挂入 React toolbar，tag 选择值不进入当前 TanStack Form / Zod schema；当前页 rows 在 `1000 / 页` 下通过 `@tanstack/react-virtual` 保持可见窗口挂载，而不是一次性挂载整页角色。React island 同步会按完整 normalized character payload 判断是否需要更新 legacy `characters` 数组，并保留 `/api/characters/all` 的结构化 overflow 错误给既有提示路径；当前规则见 [React character-library sync processing flow](../logic-description/react_character_library_sync_processing_flow.md)。
- `Sprint 4-5 / World Info`：已交付为 `features.react.panels.worldInfo` 控制的 guarded React workspace panel island。React host 在 legacy World Info editor 内显示 global/editor selector readiness、当前 world、entry count、search/sort 控件、创建/导入/导出/刷新入口和 entry 快捷入口；这些 React controls 通过 bridge 调用 legacy DOM actions，World Info scanning、prompt injection、regex placement、converter/import result handling 和 world-book delete cascade 仍由 legacy owner 执行。
- `Sprint 6 / Background Library`：已交付为 `features.react.panels.backgroundLibrary` 控制的 guarded React workspace panel island。React host 显示 loading/empty/success/error 状态、filter/sort controls、global/chat gallery counts 和背景动作入口；filter/sort/upload/select/lock/unlock/auto/refresh 通过 bridge 调用 legacy background controls，`/api/backgrounds/*`、thumbnail/lazy-load、文件夹、选择、lock 和 slash-command 行为仍由 legacy owner 执行。
- `Sprint 7 / Extensions Host`：已交付为 `features.react.panels.extensionsHost` 控制的 guarded React workspace panel island。React host 显示 notify updates、Manage、Install、Extras API URL/API key/autoconnect/connect controls、loader state 和 protected mount-point readiness；这些 controls 通过 bridge 调用 `public/scripts/extensions.js` 的既有 DOM actions，`#extensions_settings`、`#extensions_settings2`、`#regex_container`、`#extensionsMenuButton`、`#extensionsMenu`、Tavern Helper、regex extension、install/update/delete protocol 和 `@sillytavern/*` 兼容面保持 legacy owner。

**Sprint 列表**：
- ✅ [Sprint 1: 角色库面板 - 列表基础](../specs/react-phase2-sidebars/phase2-sprint1-character-library-list.md)（3 周，已交付为 guarded React panel island；保留 row DOM 合约，并在 `1000 / 页` 下验证虚拟滚动窗口挂载）
- ✅ [Sprint 2: 角色库面板 - 搜索过滤](../specs/react-phase2-sidebars/phase2-sprint2-character-library-search.md)（2 周，已交付；搜索、排序、标签过滤在同一工作区入口可用，并继续复用现有 folder / bogus-folder / group 混排语义）
- ✅ [Sprint 3: 角色库面板 - 批量操作](../specs/react-phase2-sidebars/phase2-sprint3-character-library-bulk.md)（2 周，已交付；bulk 选择/删除/标签流程继续复用现有确认对话框和 overlay 链路，`Del` 在无选中项时保持 disabled）
- ✅ [Sprint 4: 世界信息面板 - 编辑器](../specs/react-phase2-sidebars/phase2-sprint4-world-info-editor.md)（3 周，已交付 guarded React host/editor controls；legacy prompt/regex/delete 语义保留）
- ✅ [Sprint 5: 世界信息面板 - 导入导出](../specs/react-phase2-sidebars/phase2-sprint5-world-info-import.md)（2 周，已交付 React import/export/create/refresh entry points；legacy converter/import 结果链路保留）
- ✅ [Sprint 6: 背景库面板](../specs/react-phase2-sidebars/phase2-sprint6-background-library.md)（2 周，已交付 React status/filter/gallery/action island；legacy background file/API/slash 行为保留）
- ✅ [Sprint 7: Extensions 面板宿主](../specs/react-phase2-sidebars/phase2-sprint7-extensions-host.md)（3 周，已交付 Extensions drawer 宿主 controls；保留 `#extensions_settings` / `#extensions_settings2` / `#regex_container` / wand menu 等受保护挂载点）

**Phase 1 Sprint 3 后续边界**：`World Info`、`Backgrounds`、`Extensions` 没有混入 React `/settings`。它们按路线图进入 Phase 2：World Info 在 Sprint 4-5，Backgrounds 在 Sprint 6，Extensions drawer 宿主在 Sprint 7；第三方扩展 API、挂载兼容和迁移指南仍由 Phase 4 / Phase 6 负责。

**Sprint 4-7 当前边界**：
- Sprint 4-7 已完成本阶段的 guarded island 交付：共享 `app/workspace-panels.tsx` bundle 提供 TanStack Query shell，并为 World Info、Background Library、Extensions Host 提供 TanStack Form + Zod 控制面、action mutation bridge、status rows 和 safe legacy-slot markers。
- `public/scripts/workspace-panels-react-bridge.js` 继续负责按 flag、host container、bridge state/action 和 bundle import 成功与否返回 mounted/fallback 结果。bundle import 失败时结果为 fallback，legacy 控制仍是行为 owner。
- World Info React island 当前接管宿主壳、world select、search/sort、create/import/export/refresh buttons 和 entry shortcut 呈现；World Info prompt activation、regex engine、converter/import result semantics 和 deletion cascade 仍由 `public/scripts/world-info.js` 及相关 legacy modules 拥有。
- Background Library React island 当前接管宿主壳、filter/sort controls、gallery presentation 和 upload/select/lock/unlock/auto/refresh entry points；background file APIs、thumbnail/lazy-load、folder state、selection effects 和 slash commands 仍由 `public/scripts/backgrounds.js` / `public/scripts/background-panel-controller.js` 拥有。
- Extensions Host React island 当前接管宿主壳、notify/manage/install/Extras API host controls 和 protected mount-point status presentation；extension discovery、manifest loading、script/style injection、Tavern Helper、regex extension、wand menu templates、install/update/delete protocols 和 `@sillytavern/*` aliases 仍由 legacy extension compatibility boundary 拥有。第三方扩展 API 和迁移指南仍由 Phase 4 / Phase 6 处理。

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

📋 **详细规范**：[Phase 3 README](../specs/react-phase3-main-chat/README.md)

**当前执行状态**：
- `Sprint 1 / Main Chat Message List Basic`：已交付为受 `features.react.panels.mainChatMessageList` 控制的 guarded React controller island。flag 开启且 workspace-panels bundle 可用时，React 会在 `#chat` 内挂载隐藏 host，并根据 legacy bridge state 保持 `#show_more_messages` 与可见 `.mes[mesid]` 直接子节点的顺序稳定；flag 关闭、bundle 缺失或挂载失败时自动 fail-closed 到 legacy message rendering。
- `Sprint 2 / Main Chat Rich Message Bodies`：已交付为同一 `mainChatMessageList` island 的 finalized rich-body contract boundary。React 通过 `public/script.js` rich-body snapshot bridge 和 `app/workspace-panels.tsx` 的 Zod schema 校验 visible / finalized / non-editing rows，并在可认领的既有 `.mes_block` 内插入 hidden per-row owner markers；flag 关闭、bundle 缺失、snapshot 缺失/不合法或 row 状态不安全时，该行继续完全由 legacy rich-body 路径拥有。
- `Sprint 3 / Main Chat Scroll And Positioning`：已交付为同一 `mainChatMessageList` island 的 current-session scroll restore boundary。React 现在按 `chatId` 记录阅读锚点、scroll offset、已展开历史窗口和 headless virtual measurements；用户切回 long chat 时，controller 会先通过 `dispatchAction('loadMoreUntilMessage', { anchorMessageId })` 复用 legacy `showMoreMessages()` 语义把历史窗口重新展开到包含保存锚点，再恢复原阅读区域。flag 关闭、bundle 缺失、snapshot 不安全或恢复失败时，主聊天继续回退到 legacy 默认打开结果。
- `Sprint 5 / Main Chat Streaming Control State`：已交付为同一 `mainChatMessageList` island 的 visible generation-control bridge。React hidden controller 现在消费 Zod 校验后的 `generationControl` payload，覆盖 `idle`、`streaming`、`recoveringPrimary`、`recoveringFallback`、`stopped`、`completed`、`error` phase；`public/script.js` 仍拥有 `Generate()`、`StreamingProcessor`、token append、stop、auto-recovery status、final retry、`#mes_continue` 和 `.generation_failure_retry` handlers。处理规则见 [Main Chat Generation Control Bridge Processing Flow](../logic-description/main_chat_generation_control_bridge_processing_flow.md)。
- `Sprint 8 / Main Chat Message Actions Bridge`：已交付为同一 `mainChatMessageList` island 的 hidden message-action snapshot boundary。`public/script.js` 现在为安全的 visible rows 输出 `messageActionSnapshots`，`app/workspace-panels.tsx` 用 Zod 校验后只在既有 `.mes_buttons` 里附加 hidden action owner marker；`public/scripts/chat-message-actions-controller.js`、copy/edit/delete/retry/swipe/reasoning handlers 和 visible `.extraMesButtonsHint` / `.extraMesButtons` 仍由 legacy 路径拥有，review 还补上了 open/close 后 `expanded` snapshot 的同步触发点。处理规则见 [Main Chat Message Actions Bridge Processing Flow](../logic-description/main_chat_message_actions_bridge_processing_flow.md)。
- 当前交付刻意不重写 `messageFormatting()`、`updateMessageElement()`、`appendMediaToMessage()`、`StreamingProcessor`、provider transport、token append、composer、slash-command、visible message-action buttons 或 load-more 算法。Sprint 2 迁移的是 finalized rich-body bridge / owner split，不是新增 Markdown、代码高亮、LaTeX、媒体或文件能力；Sprint 5 迁移的是 control-state bridge / schema boundary，不是 provider pause/resume 或 SSE/EventSource transport rewrite；Sprint 8 迁移的是 hidden action snapshot / owner-marker boundary，不是 visible action menu ownership cutover。
- TanStack 收口状态：当前 main-chat React slice 复用共享 `app/workspace-panels.tsx` bundle 与 TanStack Query shell，在 rich-body、scroll-restore、generation-control 和 message-action bridge 输入边界使用 Zod schema，并通过 `@tanstack/react-virtual` 落地 headless measurement / snapshot / restore controller；本阶段仍未引入新的 MessageRow JSX owner、React provider transport owner、TanStack Form-owned main-chat composer 或 TanStack Virtual visible message-window renderer，长聊天窗口语义继续由 legacy `chat_truncation` + `#show_more_messages` 控制。

**Sprint 列表**：
- ✅ [Sprint 1: 消息列表 - 基础渲染](../specs/react-phase3-main-chat/phase3-sprint1-message-list-basic.md)（3 周，已交付 guarded React message-list controller island；保持 direct-child `.mes[mesid]`、stored-chat rendering 和 long-chat load-more 语义）
- ✅ [Sprint 2: 消息列表 - Rich Message Body](../specs/react-phase3-main-chat/phase3-sprint2-message-list-rich.md)（2 周，已交付 finalized rich-body bridge / hidden owner-marker boundary；不是新增 Markdown/媒体能力；实施与验证以 dated spec `260620-02-react-phase3-sprint2-main-chat-rich-message-bodies/spec.md` 为准）
- ✅ [Sprint 3: 消息列表 - 滚动和定位](../specs/react-phase3-main-chat/phase3-sprint3-message-list-scroll.md)（2 周，已交付 current-session per-chat 阅读位置恢复、expanded-history window restore 和 headless TanStack Virtual controller；实施与验证以 dated spec `260620-03-react-phase3-sprint3-main-chat-scroll-and-positioning/spec.md` 为准）
- 📋 [Sprint 4: 流式生成 - SSE 连接](../specs/react-phase3-main-chat/phase3-sprint4-streaming-sse.md)（2 周）
- ✅ [Sprint 5: 流式生成 - 控制状态](../specs/react-phase3-main-chat/phase3-sprint5-streaming-control.md)（2 周，已交付 generation-control bridge/state snapshot；不迁移 provider transport、token append 或 provider pause/resume）
- 📋 [Sprint 6: 输入框 - 基础功能](../specs/react-phase3-main-chat/phase3-sprint6-input-basic.md)（2 周）
- 📋 [Sprint 7: 输入框 - 斜杠命令](../specs/react-phase3-main-chat/phase3-sprint7-input-slash.md)（3 周）
- ✅ [Sprint 8: 消息操作 - 菜单](../specs/react-phase3-main-chat/phase3-sprint8-message-actions.md)（2 周，已交付 hidden message-action snapshot / owner-marker boundary；不迁移 visible action buttons 或 handlers owner）
- 📋 [Sprint 9: 整合测试](../specs/react-phase3-main-chat/phase3-sprint9-integration.md)（2 周）

---

### Phase 4: 状态管理迁移（3 个月）

**目标**：用 Zustand 替代全局对象，建立可预测的状态管理

📋 **详细规范**：[Phase 4 README](../specs/react-phase4-state-management/README.md)

**Sprint 列表**：
- 📋 [Sprint 1: Zustand stores 创建](../specs/react-phase4-state-management/phase4-sprint1-zustand-stores.md)（3 周）
- 📋 [Sprint 2: 兼容层建立](../specs/react-phase4-state-management/phase4-sprint2-compat-bridge.md)（3 周）
- 📋 [Sprint 3: 扩展迁移指南](../specs/react-phase4-state-management/phase4-sprint3-extension-guide.md)（2 周）

**验证门**：
```powershell
bun run test:compat
```

---

### Phase 5: 后端 API 现代化（3 个月）

**目标**：用 Hono 替代 Express，建立类型安全的 API 层

📋 **详细规范**：[Phase 5 README](../specs/react-phase5-backend-api/README.md)

**Sprint 列表**：
- 📋 [Sprint 1: Hono 路由搭建](../specs/react-phase5-backend-api/phase5-sprint1-hono-routes.md)（3 周）
- 📋 [Sprint 2: Drizzle ORM 集成](../specs/react-phase5-backend-api/phase5-sprint2-drizzle-orm.md)（3 周）
- 📋 [Sprint 3: Express 完全切换](../specs/react-phase5-backend-api/phase5-sprint3-express-sunset.md)（2 周）

---

### Phase 6: 扩展兼容性演进（持续）

**目标**：维护第三方扩展兼容性，提供迁移指南

📋 **详细规范**：[Phase 6 README](../specs/react-phase6-extension-compat/README.md)

**持续工作**（非 Sprint 结构）：
- 兼容层维护期（至少 6 个月）
- 废弃警告和迁移文档
- 扩展市场审核和社区支持

说明：`Extensions` 作为用户可见 drawer 宿主的 React UI 迁移属于 Phase 2；第三方扩展 API、挂载兼容、迁移指南和社区支持仍由 Phase 4 / Phase 6 负责。

---

## 验证矩阵

| 变更表面 | 最低验证要求 |
|---|---|
| 构建工具 | `bun run build:lib`；React page/panel 变更另跑 `bun run build:react`、`bun run build:react:character-library` 或 `bun run build:react:workspace-panels` |
| TypeScript 配置 | `bun run lint` + `bun run test:unit` |
| React 页面迁移 | 对应页面的 E2E 测试通过 |
| 角色库迁移 | `character-list-*.test.js` + `bun run test:compat` |
| 主聊天迁移 | `chat-*.e2e.js` + `bun run perf:interaction` |
| API 路由迁移 | 对应 endpoint 单元测试 + Postman/curl 手动验证 |
| 扩展兼容性 | `bun run test:compat` + 手动测试 3-5 个常用扩展 |
| 性能回归 | `bun run perf:startup` + `bun run perf:interaction` |

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|---|---|---|---|
| React 迁移导致扩展失效 | 高 | 中 | 保持兼容层 6 个月，提前与扩展作者沟通 |
| 性能劣化 | 中 | 中 | 虚拟滚动 + 性能基准测试，每个 Phase 运行 perf runner |
| 用户数据丢失 | 极高 | 低 | 保持文件存储不变，充分测试迁移脚本 |
| 开发成本超支 | 中 | 高 | 渐进式迁移，每个 Phase 可独立交付和暂停 |
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

2027 Q1-Q2 (月 1-6)：Phase 3 主聊天工作区迁移
  ├─ 月 1-2: 聊天消息列表 React 重写（含虚拟滚动）
  ├─ 月 3: 聊天流式生成 React 重写
  ├─ 月 4: 聊天输入框和斜杠命令 React 重写
  ├─ 月 5: 消息操作菜单 React 重写
  └─ 月 6: 主聊天整合测试 + 性能优化

2027 Q3 (月 7-9)：Phase 4 状态管理迁移
  ├─ 月 7: Zustand stores 搭建
  ├─ 月 8: 全局兼容层建立
  └─ 月 9: 扩展迁移指南 + 兼容性验证

2027 Q4 (月 10-12)：Phase 5 后端 API 现代化
  ├─ 月 10: Hono API 路由搭建
  ├─ 月 11: Drizzle ORM 集成
  └─ 月 12: Express → Hono 完全切换

2028 Q1+：Phase 6 扩展兼容性演进（持续）
```

## 成功标准

迁移完成后，EmberDesk 应达到：

✅ **功能完整性**：所有现有功能在 React 版本中可用  
✅ **性能提升**：启动时间 < 当前基准，交互响应 < 100ms  
✅ **扩展兼容性**：至少 80% 常用扩展无需修改即可工作  
✅ **测试覆盖率**：单元测试覆盖率 > 70%，E2E 覆盖核心流程  
✅ **类型安全**：TypeScript 严格模式，前后端类型共享  
✅ **开发体验**：HMR < 200ms，类型提示完整，构建 < 30s  
✅ **文档完备**：用户迁移指南、扩展开发文档、ADR 记录

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
- `app/workspace-panels.tsx` (workspace panel bundle；提供 TanStack Query provider shell、World Info editor/import/export controls、Background Library filter/gallery/action controls、Extensions Host notify/manage/install/Extras controls，以及 main-chat direct-child message-window controller、finalized rich-body snapshot/owner-marker boundary、current-session scroll restore 和 generation-control state snapshot；不迁移 legacy formatter/provider transport/token append/input/action owners)
- `default/config.yaml` (当前 `features.react.pages.*` 和 `features.react.panels.*` 默认值)
- `globalThis.SillyTavern`, `eventSource` / `event_types`, `@sillytavern/*` (兼容层保持)

未来规划绑定点：
- `app/stores/*` (Phase 4 Zustand stores)
- `app/server/routes/*` (Phase 5 Hono API)
- `app/compat/globalBridge.ts` (Phase 4 全局兼容层)

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
- React 推荐技术栈：`C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.docs\tech\recommended-stacks\react.md` - 技术选型来源

## 下一步行动

1. **进入 Phase 3 准备**：以当前 page/panel islands 和 legacy fallback 规则为前提，推进主聊天工作区迁移前的 rendering、streaming、input 和 message-action proof。
2. **收敛 workspace bridge**：把 page/panel island 的共享挂载、feature flag、asset fallback、action bridge 和 rollback 规则沉淀成稳定约束，避免每个新面板各自复制一套桥接。
3. **保持 TanStack 约束**：后续 React 页面/面板默认继续用 TanStack Form + Zod + TanStack Query；任何偏离都要在 spec/ADR 中说明原因和退出计划。
4. **等待清理时机**：只有在更多 workspace 面板完成迁移且兼容证据充足后，才讨论移除 legacy panel fallback 或把主工作区推进到更重的 SPA shell。
