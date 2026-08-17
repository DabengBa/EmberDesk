# EmberDesk React 现代化重构路线图

## 模块职责

本文档定义 EmberDesk 从 jQuery 单体应用迁移到现代 React 生态的完整路线图。Phase 0-6 是约 18-24 个月的渐进式迁移计划，新增 Phase 7 作为 ADR-gated full owner cutover 收尾阶段；在保持产品可用性和扩展兼容性的前提下，逐步替换技术栈核心组件，并为每个 legacy owner / fallback 留出明确退出路径。

## 状态

状态：Phase 0-6 和原 Phase 7 已交付为 React guarded-island、状态和兼容性基线。2026-07-16 起，已迁移 React surface 进入新的 legacy-retirement program：React 必须在功能完整、用户操作等价、支持的扩展/自动化契约仍可用后成为唯一 runtime owner；同版本 legacy fallback、hidden host、action facade 和 flag-off path 必须删除。当前代码中仍存在的 fallback 是待替换的事实，不是最终架构。该方向由 [ADR-0012](../adr/0012-react-migrated-surface-legacy-retirement.md) 和 [Legacy Cutover Ledger](legacy-cutover-ledger.md) 记录。仍不引入 `/workspace-next`，不把未迁移 surface 纳入，也不以删除为名缩减用户能力。
创建日期：2026-06-15  
前置条件：`.docs/tech/modernization-roadmap.md` 已于 2026-06-05 冻结完成

当前决策记录：[ADR-0012: Retire Legacy Runtime Owners From Migrated React Surfaces](../adr/0012-react-migrated-surface-legacy-retirement.md)；ADR-0007 保留早期 guarded-island 基线。

本路线图不改变用户可见的产品语义。用户界面行为仍由 `.docs/db/` 拥有。

## 目标技术栈与当前采用状态

基于 `C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.docs\tech\recommended-stacks\react.md` (核对日期：2026-06-05)

| 层级 | 技术 | 当前状态 | 说明 |
|---|---|---|---|
| 框架 / 宿主 | React 19 page/panel islands | 已采用 | 早期迁移是 feature-flagged islands，不是全站 SPA cutover；边界见 [ADR-0007](../adr/0007-react-page-islands-with-legacy-fallbacks.md)。TanStack Start / SSR / Server Functions 尚未采用，未来若需要必须另起 spec/ADR。 |
| 路由 | TanStack Router | 已采用 | `app/client.tsx`、`app/router.tsx`、`app/routeTree.gen.ts` 和 `app/routes/*` 承载 `/login`、`/setup`、`/settings`。 |
| 语言 | TypeScript 7 + React 19 | 已采用 | `app/**/*.{ts,tsx}`、`src/**/*`、`public/**/*` 纳入当前 TypeScript 边界；迁移仍是渐进式。 |
| Lint/格式化 | ESLint 10 (JS) + TypeScript 7 compiler (TS/TSX) | 已采用 | `eslint.config.js` 覆盖 JavaScript，`tsc --noEmit` 覆盖 TS/TSX 严格和未使用局部变量检查；Prettier 不作为当前强制 gate。 |
| 包管理/运行 | pnpm scripts + Node.js runtime | 已采用 | pnpm 12.0.0-rc.5 是包管理器和脚本 runner；应用运行时是 Node.js 24.16.0。 |
| 构建 | Vite 8 | 已采用 | Vite 构建 `/lib.js`、共享 React app、character-library panel bundle，以及 workspace panel action-island bundle。 |
| 样式 | Tailwind CSS v4 + 既有 CSS | 已采用 | Tailwind v4 接入 React app；主工作区 legacy CSS 仍是现有页面和扩展兼容面的 owner。 |
| UI 组件 | 本地 React 组件 | 已采用 | 当前代码使用 `app/components/*` 本地组件；shadcn/ui、Ant Design 尚未进入 `package.json`，不能写成已采用依赖。 |
| API | Express 5 | 当前保留 | Express 是唯一的 runtime 和 route owner；`POST /api/moving-ui/save` 使用直接的 Express router，见 [ADR-0013](../adr/0013-remove-obsolete-web-stack-experiments.md) 与 [ADR-0010](../adr/0010-express-runtime-owner-boundary.md)。 |
| 数据获取 | TanStack Query | 已采用 | React login/setup/settings、character-library panel、workspace panel shell，以及 World Info / Background Library / Extensions Host 的 guarded React state/action surfaces 已使用 TanStack Query。 |
| 表单 | TanStack Form + Zod | 已采用 | React login/setup/settings、character-library toolbar、World Info controls、Background Library filter/sort controls 和 Extensions Host Extras controls 的 React-owned 表单/呈现态使用 TanStack Form + Zod；legacy-owned 控件可通过 host 边界保留。 |
| 列表性能 | TanStack Virtual | 已采用 | Character Library panel 在大页尺寸下用 `@tanstack/react-virtual` 限制同时挂载行数；main-chat `mainChatMessageList` island 现在也用它做 headless measurement / snapshot / restore controller，但仍不渲染第二套可见消息列表。 |
| 状态 | Zustand + compatibility contracts | 已采用 / 替代中 | Zustand 已用于 workspace panel mount/update/unmount store 和 main-chat observation store；`globalThis.SillyTavern`、`@sillytavern/*` 与 `eventSource` / `event_types` 的外部行为继续受支持，但其 legacy provider 必须在 retirement program 中被可验证的替代实现接管；`__emberDeskReactCompatibilityBridge` 明确 internal-only。 |
| 数据层 | file-backed user data + derived SQLite cache | 当前保留 | Phase 5 Sprint 2 已明确当前不采用 Drizzle；SQLite 仍只作为 derived cache，不是用户数据正本，见 [ADR-0009](../adr/0009-derived-cache-sqlite-drizzle-decision.md)。 |
| 测试 | Jest + Playwright | 当前保留 | Vitest 尚未采用；现有验证仍以 Jest unit、Playwright E2E、docs compiler 和 focused compatibility tests 为主。 |
| 工具 | ESLint / typecheck / focused proof scripts | 当前保留 | React Doctor 尚未采用；性能与逻辑证明依赖现有 runner 和 `.docs/logic-description/*_sandbox_proof.py`。 |

## 架构原则

1. **渐进式迁移**：保持 Express 后端和 jQuery 前端同时运行，逐页面/面板迁移到 React
2. **兼容性优先**：在完全迁移前，维护 `@sillytavern/*` 别名、`eventSource`、`event_types` 兼容层
3. **文件存储不变**：继续使用文件作为用户数据正本，SQLite 仅作 derived cache
4. **测试驱动**：每个迁移步骤必须有对应的单元测试或 E2E 测试
5. **性能可测**：保留 startup/interaction performance runner，迁移后性能不能劣化
6. **TanStack 收口优先**：React 页面迁移默认必须使用 TanStack Form + Zod 管理表单和校验，使用 TanStack Query 管理服务端状态；任何例外都必须在对应 spec/ADR 中说明原因和退出计划
7. **Page / panel island 是迁移起点，不是终点**：早期 feature-flagged island 与 legacy fallback 是已交付的风险控制基线；已迁移 surface 的终点由 ADR-0012 定义为 React 唯一 owner，兼容行为由替代契约保持。
8. **剩余项不悬空**：任何 Phase 完成时保留的 legacy owner、fallback path 或兼容边界，必须在本路线图中有后续 Phase、backlog 子阶段、ADR-only milestone 或明确退出条件；不得只写“未来处理”。
9. **Full owner retirement 必须显式排期**：guarded island / visible owner 不代表 legacy owner 已退出；每个保留的行为 owner、DOM host、public contract provider 和 build-missing path 都必须在 retirement ledger 中有 React 替代、验证门和删除策略。

## 2026-07-16 Legacy Retirement Program

The next implementation work is sequenced by outcome, not by the old fallback taxonomy:

1. delete-ready standalone React pages: Login and Setup;
2. complete existing foundations: Character Library, Character/Group Authoring, Settings, World Info, Background Library, and Extensions Host;
3. complete cross-cutting extension/automation contracts while each foundation moves;
4. retire the same-entry workspace shell and main-chat legacy owners last.

No step may delete user capability, change a documented user workflow, or break a supported extension contract. Release rollback uses a prior application version; it is not a reason to keep an in-process fallback.

## 迁移阶段

### Phase 0: 基础设施准备（3 个月）

**目标**：搭建 React 基础设施，不改变现有功能

归档说明：Phase 0 已完成，旧开发 specs 已从 `.docs/specs` 清理；持久记录保留在本路线图、[PROJECT_HISTORY](../PROJECT_HISTORY.md) 和相关技术文档中。

**当前执行状态**：
- Phase 0 基础设施已落地到当前代码：`vite.config.ts` 同时承载 `/lib.js` 构建、共享 React app 构建、character-library panel bundle 和 workspace panel action-island bundle；`tsconfig.json` 覆盖 `app/**/*`、`src/**/*` 与 `public/**/*`；根 `lint` 以 ESLint 检查 JavaScript，并以 `tsc --noEmit` 检查 TS/TSX。
- React app shell 已存在于 `app/client.tsx`、`app/router.tsx`、`app/routes/*` 和 `app/routeTree.gen.ts`；Tailwind v4 通过 `tailwind.config.js`、`postcss.config.js` 与 `app/styles/globals.css` 接入 React app。
- Vite 是 `/lib.js` 的唯一构建入口。

**Sprint 列表**：
- ✅ Sprint 1: Vite 迁移（2 周，Vite 8 是 `/lib.js` 的唯一构建）
- ✅ Sprint 2: TypeScript 配置（2 周，`tsconfig.json` 与 TS7 compiler gate 已覆盖 React app）
- ✅ Sprint 3: React 开发环境（2 周，React 19 + TanStack Router app shell 已承载 `/login`、`/setup`、`/settings`）
- ✅ Sprint 4: Tailwind CSS 集成（2 周，Tailwind v4 / PostCSS 已接入 `app/styles/globals.css` 和 React route/component classes）

---

### Phase 1: 独立页面迁移（3 个月）

**目标**：迁移登录、Setup、Settings 等独立页面到 React

归档说明：Phase 1 已完成，旧开发 specs 已从 `.docs/specs` 清理；用户意图和交付记录保留在 [react-phase1-sprint2-setup-page](briefs/react-phase1-sprint2-setup-page.md)、[react-phase1-sprint3-settings-panel](briefs/react-phase1-sprint3-settings-panel.md)、[PROJECT_HISTORY](../PROJECT_HISTORY.md) 和本路线图中。

**当前执行状态**：
- `Sprint 1 / Login`：React 页面已上线并默认开启，`/login.html` 保留 legacy 回退入口；React 登录流程已按路线图完成 TanStack Form / Zod / TanStack Query 收口。
- `Sprint 2 / Setup`：React 页面已交付并由 `features.react.pages.setup` 控制，默认保持关闭；`/setup.html` 保留 legacy 回退入口；React setup 流程已按路线图完成 TanStack Form / Zod / TanStack Query 收口。
- `Sprint 3 / Settings`：React `/settings` 已交付为 sole owner。product flag 与 workspace drawer fallback 已退休；build 存在时始终服务该页，缺 build 时 HTTP 503。页面覆盖 General / Providers / UI / Advanced，含 Vertex service-account secrets、connection-profile 选择、revision conflict 与完整 document round-trip。legacy `vertexai` source 会显示为 Google + Vertex AI 并在未关闭 Vertex AI 时保存回 `vertexai`；高级 reasoning effort 值 `min` / `max` / `none` / `minimal` / `xhigh` 保持可见和可保存。用户可见语义见 [`page.settings`](../db/pages/settings.md)，当前 payload 规则见 [React settings payload processing flow](../logic-description/react_settings_payload_processing_flow.md)。

**Sprint 列表**：
- ✅ Sprint 1: Login 页面 React 重写（2 周，React 实现已上线并默认开启 feature flag；TanStack Form / Zod / Query 已完成收口）
- ✅ Sprint 2: Setup 页面 React 重写（2 周，React 实现已交付并挂在 `features.react.pages.setup` 下；`/setup.html` 保留 legacy 回退入口；TanStack Form / Zod / Query 已完成收口）
- ✅ Sprint 3: Settings 面板 React 重写（4 周，React `/settings` 已交付为 sole owner；product flag 与 drawer fallback 已退休；覆盖 General / Providers / User Interface / Advanced；TanStack Form / Zod / Query 已完成收口）

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
- `Sprint 7 / Extensions Host`：已退休为 React sole owner。React host 拥有 notify updates、Manage、Install、Extras API URL/API key/autoconnect/connect、loader/error/retry 与 protected mount lifecycle；framework-neutral domain/service 模块与 `public/scripts/extensions.js` 薄 barrel 拥有 discovery/activation/operations/Extras。`#extensions_settings`、`#extensions_settings2`、`#regex_container`、`#extensionsMenuButton`、`#extensionsMenu`、Tavern Helper、regex extension、install/update/delete protocol 和 `@sillytavern/*` 保持 freeze-supported 兼容契约，不再作为第二可见 host。

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
- `public/scripts/workspace-panel-host-controller.js` 现在把 World Info、Background Library、Extensions Host 和 `mainChatMessageList` 的共享 host lifecycle 收口到一个内部 seam：flag-off cleanup、container gate、drawer reopen remount、state-change resample 和 action-settle remount 走同一条路径，从而修复“锁定 Character Management 后打开 World Info 仍会把角色面板挤掉”的回归类问题，同时不改变 `mountWorkspacePanel(kind, container, options)` 的外部兼容语义。
- World Info React island 当前接管宿主壳、world select、search/sort、create/import/export/refresh buttons 和 entry shortcut 呈现；World Info prompt activation、regex engine、converter/import result semantics 和 deletion cascade 仍由 `public/scripts/world-info.js` 及相关 legacy modules 拥有。
- `public/scripts/world-info-shell-context.js` 现在由 `public/script.js` 在启动时注册默认 shell context；`public/scripts/world-info.js` 继续作为 World Info compatibility facade，但它读取 shell-owned settings/request/event/chat/character capabilities 时不再直接批量依赖 `../script.js`。该 context 必须对稍后初始化的 shell 常量保持 lazy access，并在代理 `eventSource` 方法时保留原 emitter binding，避免启动顺序和事件契约回归。
- Background Library React island 当前接管宿主壳、filter/sort controls、gallery presentation 和 upload/select/lock/unlock/auto/refresh entry points；background file APIs、thumbnail/lazy-load、folder state、selection effects 和 slash commands 仍由 `public/scripts/backgrounds.js` / `public/scripts/background-panel-controller.js` 拥有。
- Extensions Host React 现为 sole visible owner：宿主壳、notify/manage/install/Extras、loader/retry 与 slot lifecycle 属于 React + host services；`extensions.js` 为 public barrel。Tavern Helper、regex extension、wand menu templates、install/update/delete protocols 和 `@sillytavern/*` aliases 保持 freeze-supported。第三方扩展 API 与迁移指南仍由 Phase 4 / Phase 6 兼容文档拥有。

**Phase 2 后 full owner cutover 归属**：

| Surface | 当前 Phase 2 完成定义 | 仍保留的 legacy owner / fallback | Full owner cutover 归属 |
|---|---|---|---|
| Character Library | React toolbar/list/search/sort/bulk 呈现、TanStack Query refresh、TanStack Form + Zod toolbar state、虚拟滚动窗口 | legacy tag controls、`entitiesFilter`、`characters` global array sync、delete dialog、bulk delete/tag side effects、protected row selectors、flag/build fallback | `Phase 7 Sprint 1: Character Library full owner cutover` |
| World Info | React host、world select、search/sort、create/import/export/refresh entry points、entry shortcut 呈现 | prompt activation、regex engine、converter/import result semantics、delete cascade、legacy DOM action bridge、flag/build fallback | `Phase 7 Sprint 2: World Info full owner cutover` |
| Background Library | React host、filter/sort、gallery presentation、upload/select/lock/unlock/auto/refresh entry points | `/api/backgrounds/*` action semantics、thumbnail/lazy-load、folder state、selection effects、slash commands、legacy background controller、flag/build fallback | `Phase 7 Sprint 3: Background Library full owner cutover` |
| Extensions Host | React sole-owner host、notify/manage/install/Extras、loader/retry、mount lifecycle | extension discovery/activation services、Tavern Helper、regex extension、wand menu templates、install/update/delete protocols、`@sillytavern/*` aliases、freeze-supported protected mount IDs | `sole-owner retirement complete`; residual work is freeze-supported contract maintenance |

**Sprint 4-7 验证门**：
```bash
pnpm --dir tests run test:unit -- world-info-card-rendering.test.js world-info-import-feedback.test.js world-info-converters.test.js worldinfo-delete-cascade.test.js background-panel-controller.test.js thumbnail-placeholder-background.test.js workspace-react-panel-flags.test.js react-workspace-panels-helpers.test.js --runInBand
pnpm run build:react:workspace-panels
pnpm run test:compat
pnpm run docs:check
```

---

### Phase 3: 主聊天工作区迁移（6 个月，最高风险）

**目标**：迁移核心聊天界面到 React，这是整个迁移最复杂的部分

归档说明：Phase 3 / 3B 的历史 hidden-island 与可见消息行切片已交付；React Runtime Boundary 收口仍由 ADR-0012 addendum 和本节当前执行状态定义，旧开发 specs 已从 `.docs/specs` 清理。

**当前执行状态**：
- `Sprint 1 / Main Chat Message List Basic`：已完成 sole-owner 收口。React 在 `#chat` 内挂载 controller host，拥有可见 `.mes[mesid]` 顺序、`#show_more_messages`、windowing/restore 与 row lifecycle；`mainChatMessageList` 产品 dual-path flag 已退役，缺失 bundle 以可见 build error fail-closed，回滚为部署上一版本。
- `Sprint 2 / Main Chat Rich Message Bodies`：React 现在直接从 `public/scripts/main-chat-store-projection.js` 消费 framework-neutral rich-body 结果并输出 `.mes_text`、reasoning/media/file/bias shells；不再接收 legacy `messageNodes`、DOM HTML 或 per-row DOM snapshots。
- `Sprint 3 / Main Chat Scroll And Positioning`：`app/stores/main-chat-store.ts` 保存完整消息顺序和可见窗口，React 直接渲染 `#show_more_messages` 与 `.mes[mesid]` direct children；load-earlier 和 reading-position restore 通过 named commands 协调，不再使用通用 `dispatchAction`。
- `Sprint 4 / Main Chat Streaming Transport Boundary`：provider transport、`Generate()`、`StreamingProcessor` 和 token append 仍由 framework-neutral legacy service 拥有；React 只消费 typed generation/streaming snapshots，React Runtime Boundary 不把 observation 误写成 transport owner。
- `Sprint 5 / Main Chat Streaming Control State`：generation stop/recovery/failure 状态通过 typed projection 驱动 React row/status output；React-owned row updates 在无 legacy message row 时仍通过 store refresh 完成。
- `Sprint 6 / Main Chat Composer Basic Bridge`：可见 send/stop/continue/regenerate/Enter 事件已通过 named command port 捕获，保留稳定 `#send_textarea` / `#send_but` 选择器；composer value 的最终写 owner 仍是 legacy DOM，不能宣称 store-owned composer 已完成。
- `Sprint 7 / Main Chat Slash Command Bridge`：React 从 typed snapshot 渲染 autocomplete 和 paused/aborted/error status shell；slash parser、registry、executor 和 public exports 继续由兼容模块拥有，React 不读取公共 globals/events。
- `Sprint 8 / Main Chat Message Actions Bridge`：React MessageRow 输出 action and reasoning shells，并通过 `MainChatCommands` 暴露 copy/edit/delete/move/retry/swipe/open-close 和 reasoning expand/copy/edit/delete/collapse 命令；reasoning parser/templates and third-party mutation zones remain independent compatibility boundaries.
- `Sprint 9 / Main Chat Integration Closure`：当前收口主题是 React Runtime Boundary，而不是 full SPA rewrite。静态门禁、store/projection unit proof、消息行结构 proof，以及 reasoning edit/delete reopen browser proof 已建立；composer write owner、provider transport、slash internals 和 extension mutation protocol 仍需分别完成。
- TanStack 收口状态：Zustand vanilla store 是消息状态 owner，React 通过 `useSyncExternalStore` 订阅；React 组件不保存 `HTMLElement`、DOM 查询结果或从 DOM 提取的 HTML。主聊天 composer 尚未完成真正的 React-rendered/store-owned 输入迁移，不能以旧 hidden bridge 文档代替该缺口。
- Phase 3 / Phase 3B 边界：历史 hidden/visible slices 保留为 traceability；当前 owner 事实以 ADR-0012 的 React Runtime Boundary addendum 和本节为准。

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
- `Sprint 1 / Visible MessageRow Renderer` 已交付：`app/stores/main-chat-store.ts` 和 `MainChatMessageRow` 直接输出 stable `.mes[mesid]` rows；projection 只处理 typed chat records 和 framework-neutral render results。
- `Sprint 2 / Visible Message Actions Owner` 已交付 command boundary：Copy / Edit / Delete / Move / Retry / Swipe 通过 `MainChatCommands` 暴露；React row action shells 是输出 DOM，legacy public handlers/services 仍是命令实现。
- `Sprint 3 / Visible Composer` 只完成 command-owner 边界：capture handlers 将 Enter、send、stop、continue、regenerate 路由到 named commands，稳定 DOM 节点不被替换；store 仍从既有 textarea snapshot 接收 value，尚未完成 composer write-owner replacement。
- `Sprint 4 / Visible Slash Autocomplete And Parser UI` 已由 React 输出 typed autocomplete/status DOM；slash compatibility module 继续拥有 parser/registry/executor and public exports。
- `Sprint 5 / Provider Transport And Token Append Owner` 当前不宣称 React transport ownership；framework-neutral generation service 仍是 provider attempt、streaming token append、stop/recovery/finalization owner，React 通过 typed snapshots 和 named commands接入。
- `public/scripts/main-chat-bridge-contract.js` 的旧 DOM snapshot chain 已从 main-chat React path 删除；当前边界由 `app/compat/runtime-port.ts`、`app/compat/workspace-commands.ts`、`app/stores/main-chat-store.ts` 和 `public/scripts/main-chat-store-projection.js` 组成。
- `Phase 3B` 的 message-row/store/window/command and reasoning row-control boundaries can be marked complete; composer write owner、provider transport、slash internals、reasoning parser/templates and extension mutation protocol remain independent closure items.
- `Phase 3B` 继续以当前 Phase 3 hidden-island 完成态为前置基线，不回写既有 Phase 3 已完成结论。
- 本阶段所有 React-owned 表单和输入面必须严格采用 TanStack Form + Zod；所有 provider-backed 查询或提交路径必须优先采用 TanStack Query；任何仍保留 legacy compatibility adapter 的 sprint 都必须写清 owner split 和退出计划。
- 本阶段不允许把这 5 个剩余 gap 合并成单个“大主聊天重写”任务；必须逐 sprint 切 visible owner，并在每步保留 guarded rollout / rollback 能力。

**Sprint 列表**：
- ✅ [`Sprint 1 / Visible MessageRow Renderer`](briefs/react-phase3b-visible-message-row-renderer.md)（3 周，已交付 safe stored / finalized / non-editing rows 的 visible owner marker / row-shell cutover；editing rows、unsafe rows、streaming in-flight rows 和结构不安全行继续 fallback）
- ✅ `Sprint 2 / Visible Message Actions Owner`（2 周，已交付 React-owned visible action shell；保留 protected selectors / hooks、legacy handlers 和 per-row fallback）
- ✅ `Sprint 3 / Visible Composer command boundary`（capture 入口和 named commands 已交付；store-owned composer write path 未完成）
- ✅ `Sprint 4 / Visible Slash status boundary`（typed status projection 已交付；parser/registry/executor/autocomplete owner 保持兼容模块）
- ✅ `Sprint 5 / Provider Transport boundary`（统一 generation service 已交付；provider transport/token append 仍由 framework-neutral legacy owner 负责）

**Phase 3B 验证门**：
```bash
pnpm --dir tests run test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-streaming.e2e.js
pnpm run test:compat
pnpm run perf:interaction
pnpm run docs:check
```

**Phase 3 / 3B 后剩余项归属表**：

| 剩余项 | 后续归属 | 当前路线图处理 |
|---|---|---|
| `non-OpenAI` / group / dry-run / nested visible transport | `Phase 4A` 补齐能力，`Phase 7 Sprint 5` 完成 full owner cutover | Phase 3B closure 后的第一批 main-chat backlog；进入实现前必须单独写 spec，继续使用 guarded request-level fallback；Phase 4A 证明所有 transport path 可由 React owner 承担后，Phase 7 才能移除 fallback。 |
| `quiet` / background generation transport | `Phase 4A` 补齐能力，`Phase 7 Sprint 5` 完成 full owner cutover | 与标准 visible direct-chat 分开处理；只有在 background / quiet 行为、provider side effects 和 recovery 语义有独立 proof 后才能迁入 React owner；最终 fallback 退出归 Phase 7。 |
| legacy `messageFormatting()` / rich media / file / LaTeX / code-block formatter owner | `Phase 4B` 抽取 renderer contract，`Phase 7 Sprint 6` 完成 full owner cutover | 当前 Phase 3B 复用 legacy formatted DOM；Phase 4B 先抽取 formatter contract 并保护扩展挂钩，Phase 7 再切 React renderer full owner。 |
| legacy `chat_truncation` / `#show_more_messages` load-more 算法 | `Phase 4B` 抽取 windowing contract，`Phase 7 Sprint 6` 完成 full owner cutover | 当前 React 只做 headless measurement / restore；Phase 4B 先证明 long-chat performance 和 compatibility，Phase 7 再移除 legacy load-more owner。 |
| `globalThis.SillyTavern`、`eventSource`、`event_types`、jQuery globals | Phase 4 / Phase 6 建兼容层，Phase 7 已完成 closeout | 当前结论已关闭为 ledger/ADR 策略：`globalThis.SillyTavern` 与 `eventSource` / `event_types` 不再是默认 deletion candidates；未来若要缩窄，必须新开 spec/ADR。 |
| third-party extension API、mount compatibility、migration guide | Phase 4 / Phase 6 建桥和维护，Phase 7 已完成 owner/fallback closeout | Extensions Host 的可见宿主已切换，但 protected mount points 和扩展兼容面已转入 freeze-supported / compatibility-facade policy，而不是继续作为未判定旧债。 |
| Express route owner / typed API / derived-cache ORM | Phase 5（Sprint 1-3 已完成） | 已移除 Hono route-island 实验；Drizzle 当前不采用；Express 继续保留为唯一 runtime owner。 |
| 移除 guarded island fallback 或切 full SPA workspace | Phase 7 已完成 closeout | 当前不保留一个开放式“继续删 fallback”待办；具体 surface 以 `legacy-cutover-ledger.md` 为准，separate-route/full SPA shell 需要未来新 spec/ADR。 |

---

### Phase 4: 状态管理迁移（3 个月）

**目标**：引入 Zustand-backed state foundation 和 allowlisted compatibility bridge，收束 React-owned slice 的可观察状态，并把 Phase 3 / 3B 留下的 main-chat compatibility transport / renderer extraction backlog 固化为可审计证据，供 Phase 7 full owner cutover 使用

📦 **持久归档**：[React Phase 4 state-management archive brief](briefs/react-phase4-state-management-sequenced-specs.md) · [Main-chat streaming transport bridge processing flow](../logic-description/main_chat_streaming_transport_bridge_processing_flow.md) · [Main-chat rendering call chain](main-chat-rendering-call-chain.md) · [Third-party extension compatibility](third-party-extension-compatibility.md)

**Main-chat backlog 子阶段**：
- `Phase 4A / Main-chat compatibility transport expansion`：已建立 visible transport support classifier，标准 OpenAI direct-chat request 可归入 React-owned path；non-OpenAI、group、dry-run、nested visible、quiet/background generation 继续登记为 legacy fallback 或 unsupported-with-reason，最终退出归 Phase 7 Sprint 5。
- `Phase 4B / Main-chat renderer extraction`：已抽取 renderer/windowing current-behavior contract。safe finalized rows 是 Phase 7 renderer candidate；editing、streaming、extension-mutated、unsafe 和 missing `.mes_text` rows 继续 legacy fallback；long-chat windowing owner 仍是 legacy `chat_truncation` + `#show_more_messages`，最终退出归 Phase 7 Sprint 6。

**Sprint 列表**：
- ✅ [Sprint 1: Zustand stores 创建](briefs/react-phase4-state-management-sequenced-specs.md)（3 周，已交付 workspace panel store 和 main-chat observation store）
- ✅ [Sprint 2: 兼容层建立](briefs/react-phase4-state-management-sequenced-specs.md)（3 周，已交付 global compatibility bridge；legacy globals 不被替换）
- ✅ [Sprint 3: 扩展迁移指南](briefs/react-phase4-state-management-sequenced-specs.md)（2 周，已更新第三方扩展兼容矩阵）
- ✅ [Phase 4A: Main-chat compatibility transport expansion](briefs/react-phase4-state-management-sequenced-specs.md)（已建立 transport support/fallback classifier；不等于 Phase 7 full owner cutover）
- ✅ [Phase 4B: Main-chat renderer extraction](briefs/react-phase4-state-management-sequenced-specs.md)（已建立 renderer/windowing contract 和 long-chat/extension proof；不等于 Phase 7 full owner cutover）

**验证门**：
```bash
pnpm run test:compat
pnpm --dir tests run test:unit -- main-chat-visible-transport-owner.test.js chat-generation-lifecycle.test.js react-workspace-panels-helpers.test.js --runInBand
pnpm --dir tests run test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-streaming.e2e.js
pnpm run perf:interaction
```

**Phase 7 handoff 条件**：
- `Phase 4A` 已登记 transport support/fallback 分类；Phase 7 Sprint 5 必须在删除 request-level fallback 前补齐 provider matrix、stop/retry/fallback、token append/finalization 和 rollback ADR。
- `Phase 4B` 已登记 renderer/windowing contract；Phase 7 Sprint 6 必须在删除 formatter/windowing fallback 前补齐 `.mes_text` / extension mutation / editing / streaming / long-chat performance 和 rollback ADR。
- Zustand/global bridge sprints 不得顺手迁移 provider transport 或 renderer owner；删除或冻结这些 owner 只能通过 Phase 7 cutover specs 完成。

---

### Phase 5: Typed API 与后端边界评估（3 个月）

**目标**：评估 typed API / route boundary 工具是否值得保留；当前结论是 Express 5 保持唯一 runtime 和 route owner

📋 **归档记录**：[ADR-0013](../adr/0013-remove-obsolete-web-stack-experiments.md) · [ADR-0009](../adr/0009-derived-cache-sqlite-drizzle-decision.md) · [ADR-0010](../adr/0010-express-runtime-owner-boundary.md)

**当前执行状态**：
- `Sprint 1 / route-boundary experiment`：已完成并清理。`POST /api/moving-ui/save` 由直接的 Express router 拥有；Hono route-island 与桥接层已删除。见 [ADR-0013](../adr/0013-remove-obsolete-web-stack-experiments.md)。
- `Sprint 2 / Drizzle decision gate`：已完成，结论为当前不采用 Drizzle。`character-index.sqlite` 继续使用 handwritten `node:sqlite` helper，derived-cache rebuild / fallback / reset-threshold contract 不变。见 [ADR-0009](../adr/0009-derived-cache-sqlite-drizzle-decision.md)。
- `Sprint 3 / Express runtime owner gate`：已完成，结论为继续保留 Express 5 为唯一 backend runtime owner。见 [ADR-0010](../adr/0010-express-runtime-owner-boundary.md)。

**Sprint 列表**：
- ✅ Sprint 1: route-boundary experiment cleanup（移除 `moving-ui/save` Hono route island，保留直接 Express router，见 [ADR-0013](../adr/0013-remove-obsolete-web-stack-experiments.md)）
- ✅ [Sprint 2: Drizzle derived-cache decision gate](../tech/briefs/react-phase5-sprint2-drizzle-derived-cache-decision-gate.md)（3 周；结论为当前不采用，见 [ADR-0009](../adr/0009-derived-cache-sqlite-drizzle-decision.md)）
- ✅ [Sprint 3: Express retention / sunset decision gate](../tech/briefs/react-phase5-sprint3-express-retention-or-sunset-decision-gate.md)（2 周；结论为保留 Express runtime owner，见 [ADR-0010](../adr/0010-express-runtime-owner-boundary.md)）

**进入条件与边界**：
- Phase 5 先回答“值不值得做”和“能不能少做”。当前不保留第二个路由框架；typed API 价值不等于引入新框架。
- Drizzle 只能先接管 derived SQLite cache；file-backed user data 仍是正本。任何把 SQLite 升级为 canonical storage 的方案必须另起 ADR。
- Express sunset 不是默认结果；若 route parity、rollback、plugin mounting 或 security middleware proof 不足，Phase 5 的有效结论可以是“保留 Express runtime owner，延期 sunset”。
- `tests/express5-route-compatibility.test.js` 是 Express 宿主链保护门；`tests/moving-ui-express-route.test.js` 保护直接路由的登录墙、验证和写入行为。

**Phase 5 当前结论**：
- EmberDesk 已删除 Hono route-island 实验和 Webpack fallback；现有需求由 Vite 与 Express 直接满足。
- EmberDesk 当前没有证据证明 Drizzle 在 `character-index.sqlite` derived-cache 切片上值得引入。
- EmberDesk 当前没有证据证明 Express runtime owner 已可 sunset；后续若再讨论，只能以新 spec/ADR 和更宽的 parity proof 重新开启。

**验证门**：
```bash
pnpm --dir tests run test:unit -- express5-route-compatibility.test.js --runInBand
pnpm run test:unit
pnpm run test:compat
pnpm run docs:check
```

---

### Phase 6: 扩展兼容性演进（持续）

**目标**：维护第三方扩展兼容性，提供迁移指南

📋 **持久入口**：[Phase 6 archive brief](briefs/react-phase6-extension-compat-sequenced-specs.md)

**持续工作**（非 Sprint 结构）：
- `JS-Slash-Runner` 作为 primary compatibility gate；任何会破坏其 import、mount、event、slash-command、regex 或必需 global/export surface 的 candidate，都必须先被证明可迁移且可回滚
- 兼容层维护期（至少 6 个月）
- 废弃警告和迁移文档
- 扩展市场审核和社区支持

归档说明：Phase 6 dated delivery specs 已完成并清理；当前持久追溯由 archive brief、third-party compatibility owner doc、project history 和 project overview 承接。保留的 `specs/react-phase6-extension-compat/README.md` 仅作为旧链接兼容的最小 archive redirect。

说明：`Extensions` 作为用户可见 drawer 宿主的 React UI 迁移属于 Phase 2；第三方扩展 API、挂载兼容、迁移指南和社区支持仍由 Phase 4 / Phase 6 负责。

**退出条件**：
- Phase 6 的完成不等于兼容层删除；它只提供 Phase 7 cutover 的前置证据。
- 兼容层废弃、冻结或删除前必须有以 `JS-Slash-Runner` 为首要样本的扩展验证清单、迁移指南、废弃警告周期、用户可回滚方案和 `pnpm run test:compat` 通过记录。
- `globalThis.SillyTavern`、`eventSource` / `event_types`、`@sillytavern/*` alias 的任一破坏性变更都必须走 Phase 6 兼容评审和 Phase 7 cutover gate，不得作为 Phase 4/5 的顺手清理。

---

### Phase 7: Full owner cutover and legacy fallback retirement（已关闭，进入兼容维护）

**结果**：Phase 7 已按 surface 完成 cutover 判定。当前不再把所有保留的 legacy 路径统称为“以后再删”，而是按实际证据分流为 documented compatibility facade、freeze-supported surface 或 blocked deletion candidate。维护者应以后续 ledger 为准，而不是把本节当作待办池。

📋 **持久入口**：[Legacy Cutover Ledger](legacy-cutover-ledger.md)

**当时进入条件**：
- Phase 1-3B 对应 surface 的 guarded island / visible owner 已开启并通过回归门。
- Phase 4A / 4B 对 main-chat transport、formatter、windowing 的 excluded paths 已完成独立 spec 和 proof。
- Phase 5 对需要 typed API / route owner 的 surface 已完成 route parity、middleware-order proof 和 rollback plan。
- Phase 6 对 extension API、mount compatibility、`JS-Slash-Runner` primary gate、regex extension、`@sillytavern/*` alias 和所需次级扩展验证已完成维护期证据。
- 每个 sprint 必须有 ADR 或 ADR update，说明本次移除 fallback 的范围、回滚策略、用户数据风险、扩展兼容风险和性能证据。

**Sprint 列表**：
- ✅ [Sprint 1: Character Library full owner cutover](../specs/react-phase7-full-owner-cutover/phase7-sprint1-character-library-full-owner-cutover.md)（已交付）
  React 现在是 Character Library 可见 toolbar/list/search/sort/bulk 浏览状态的唯一正常 runtime owner；同入口 legacy path 只保留为 documented emergency compatibility facade / rollback owner。
- ✅ [Sprint 2: World Info full owner cutover](../specs/react-phase7-full-owner-cutover/phase7-sprint2-world-info-full-owner-cutover.md)（已交付）
  React 可见 action path 现在通过 `public/scripts/world-info.js` helper facade 路由，World Info prompt/regex/converter/delete semantics 保持单一兼容 owner，而不是竞争实现。
- ✅ [Sprint 3: Background Library full owner cutover](../specs/react-phase7-full-owner-cutover/phase7-sprint3-background-library-full-owner-cutover.md)（已交付）
  React 可见 action path 现在通过 `public/scripts/backgrounds.js` helper facade 路由；legacy background path 只保留为 documented compatibility owner / rollback，不再是未决迁移债务。
- ✅ [Sprint 4: Extensions Host full owner cutover](../specs/react-phase7-full-owner-cutover/phase7-sprint4-extensions-host-full-owner-cutover.md)（已交付）
  React 接管 Extensions Host 可见 notify/manage/install/Extras 壳层，但 protected mount points、Tavern Helper、regex extension、install/update/delete protocol 和 `@sillytavern/*` aliases 被冻结为兼容边界，而不是删除候选。
- ✅ [Sprint 5: Main-chat transport full owner cutover](../specs/react-phase7-full-owner-cutover/phase7-sprint5-main-chat-transport-full-owner-cutover.md)（已交付）
  React visible transport owner 只覆盖标准 OpenAI direct-chat send/continue/regenerate/retry/swipe；quiet/background、non-OpenAI、group、dry-run 和 nested-visible paths 被明确 ADR-frozen 在 legacy compatibility owner，而不是继续作为含糊 fallback。
- ✅ [Sprint 6: Main-chat renderer and windowing full owner cutover](../specs/react-phase7-full-owner-cutover/phase7-sprint6-main-chat-renderer-windowing-full-owner-cutover.md)（已交付）
  React 现在是 safe finalized row rich-body、row-lifecycle policy 和 reading-position restore 的单一 owner；editing/streaming/unsafe/extension-mutated rows 与 `showMoreMessages()` 被明确冻结在 documented legacy facades。
- ✅ [Sprint 7: Workspace shell and global compatibility retirement decision](../specs/react-phase7-full-owner-cutover/phase7-sprint7-workspace-shell-global-compatibility-decision.md)（已交付）
  当前 roadmap 的关闭结论是不推进 separate-route/full SPA shell；2026-07-01 successor 已把当前 `/` 重新打开为 same-entry React shell takeover path。该 successor 允许 React chrome/layout 接管外层可见框架，但 legacy drawer contents、message rows、extension mount points、slash/regex/event surfaces 和 rollback substrate 仍保留。`globalThis.SillyTavern` 与 `@sillytavern/*` 被冻结为 documented public compatibility facades，`eventSource` / `event_types` 保持长期支持，`__emberDeskReactCompatibilityBridge` 明确 internal-only。

**关闭后验证门**：
```bash
pnpm run build:lib
pnpm run build:react
pnpm run build:react:character-library
pnpm run build:react:workspace-panels
pnpm run test:unit
pnpm run test:compat
pnpm --dir tests run test:e2e -- login.e2e.js chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-streaming.e2e.js
pnpm run perf:startup
pnpm run perf:interaction
pnpm run docs:check
```

**关闭后策略**：
- 每个 migrated surface 只有一个明确 runtime owner；legacy owner 若保留，必须是 documented compatibility facade，而不是可竞争的第二实现。
- Guarded fallback、build-missing fallback 和 legacy DOM bridge 不再默认视为待删项；它们要么已经删除，要么已经在 ADR 或 ledger 中冻结/分级。
- 所有语义 Doc ID、tech docs、logic-description docs、PROJECT_HISTORY 和 ADR 都应反映最终 owner split。
- 任何未来想重开 same-entry shell replacement、删除公共 globals/events/import aliases、或缩窄 protected extension/renderer contracts 的工作，都必须新开 spec 和 ADR，不能复用本阶段“顺手继续清理”的名义推进。

---

## 验证矩阵

| 变更表面 | 最低验证要求 |
|---|---|
| 构建工具 | `pnpm run build:lib`；React page/panel 变更另跑 `pnpm run build:react`、`pnpm run build:react:character-library` 或 `pnpm run build:react:workspace-panels` |
| TypeScript 配置 | `pnpm run lint` + `pnpm run test:unit` |
| React 页面迁移 | 对应页面的 E2E 测试通过 |
| 角色库迁移 | `character-list-*.test.js` + `pnpm run test:compat` |
| 主聊天迁移 | `chat-*.e2e.js` + `pnpm run test:compat` + `pnpm run perf:interaction` |
| Phase 4A transport expansion | focused provider/transport unit tests + `chat-message-streaming.e2e.js` + `pnpm run test:compat` + rollback/fallback proof |
| Phase 4B renderer extraction | `chat-message-rendering.e2e.js` + `chat-message-layout.e2e.js` + long-chat performance proof + extension compatibility proof |
| Zustand/global bridge | store unit tests + compatibility bridge tests + `pnpm run test:compat` |
| API 路由迁移 | 对应 endpoint 单元测试 + Postman/curl 手动验证 |
| 扩展兼容性 | `pnpm run test:compat` + 手动测试 3-5 个常用扩展 |
| Phase 7 full owner cutover | 对应 surface focused unit/E2E + `pnpm run build:lib` + `pnpm run build:react` + `pnpm run build:react:character-library` / `pnpm run build:react:workspace-panels` + `pnpm run test:compat` + startup/interaction perf + docs/ADR cutover checklist |
| 性能回归 | `pnpm run perf:startup` + `pnpm run perf:interaction` |

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

1. **[ADR-0012: Retire Legacy Runtime Owners From Migrated React Surfaces](../adr/0012-react-migrated-surface-legacy-retirement.md)**
   - 决策：已迁移 React surface 在功能完整和兼容行为可验证后删除 legacy runtime，而不是永久保留 fallback
   - 理由：结束双 owner、hidden host 和 action facade 的长期复杂度，同时保持产品与扩展行为
   - 权衡：部分 guarded island 需要继续功能迁移，主聊天和 shell 必须最后处理

2. **[ADR-0007: React page and panel islands with legacy fallbacks](../adr/0007-react-page-islands-with-legacy-fallbacks.md)**
   - 决策：先以 feature-flagged React islands 迁移 `/login`、`/setup`、`/settings`，以及像 character library 这样的早期工作区 panel
   - 理由：降低早期 React 化风险，保持 legacy rollback、扩展兼容边界和同入口迁移体验
   - 权衡：短期保留 React/jQuery 双实现、共享 build fallback，以及面板 bridge 复杂度

3. **[ADR-0013: Remove obsolete web stack experiments](../adr/0013-remove-obsolete-web-stack-experiments.md)**
   - 决策：删除 Webpack fallback 和 Hono route island；Vite 与 Express 分别成为唯一构建和路由实现
   - 理由：当前需求不需要双栈，直接实现更小、更易验证
   - 权衡：构建产物缺失直接 404，未来引入第二路由框架必须重新决策

4. **[ADR-0009: Derived cache SQLite Drizzle decision](../adr/0009-derived-cache-sqlite-drizzle-decision.md)**
   - 决策：当前不为 `character-index.sqlite` derived-cache slice 引入 Drizzle，继续保留 handwritten `node:sqlite` helper
   - 理由：保持 derived cache 可重建、可回滚，同时避免为简单 sidecar 查询引入额外抽象
   - 权衡：schema tooling 和迁移管理 vs. 学习曲线、额外依赖、对现有 `node:sqlite` helper 的重写成本

5. **[ADR-0010: Express runtime owner boundary](../adr/0010-express-runtime-owner-boundary.md)**
   - 决策：继续保留 Express 作为 backend runtime owner；未来若讨论 sunset，必须先补齐 middleware-order、plugin mount、proxy/upload/error/404、startup split 和 rollback proof
   - 理由：route-island proof 不等于 whole-runtime parity；当前宿主链仍承载生产关键边界
   - 权衡：保留成熟宿主与回滚确定性 vs. 持续承受双栈渐进现代化成本

6. **React legacy-retirement program**
   - 决策：由 ADR-0012 和 [Legacy Cutover Ledger](legacy-cutover-ledger.md) 记录已迁移 surface 的替代、验证、删除顺序。
   - 理由：guarded-island closeout 是历史基线，不是永久双实现策略。
   - 权衡：每个 surface 都必须完成行为和兼容替代，不能以删除为名缩减产品能力。

7. **ADR-BBBB: Canonical storage 变更**
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

2028 Q1-Q2 (月 2-4)：Phase 5 Typed API 与后端边界评估
  ├─ 月 2: Express-hosted Hono route island 试点
  ├─ 月 3: Drizzle derived-cache decision gate
  └─ 月 4: Express retention or sunset ADR decision

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
✅ **Owner 清晰**：每个已迁移 surface 只有一个 React runtime owner；不再保留同版本 legacy behavior owner
✅ **Compatibility 可验证**：guarded fallback、build-missing fallback、legacy DOM bridge 已删除；支持的 globals、events、aliases、selectors 和 automation 行为由明确替代契约提供
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
- `app/stores/workspace-panel-store.js`, `app/stores/main-chat-observation-store.js`, `app/compat/global-compatibility-bridge.js` (Phase 4 Zustand stores、allowlisted compatibility snapshot/export bridge)
- `src/react-feature-flags.js`, `src/react-login-feature.js`, `src/react-setup-feature.js`, `src/react-settings-feature.js`, `src/react-character-library-feature.js`, `src/workspace-react-features.js` (shared React feature-flag resolution plus workspace panel bootstrap；当前 payload 包含 `characterLibrary`、`mainChatMessageList`、`worldInfo`、`backgroundLibrary`、`extensionsHost`)
- `public/script.js`, `public/scripts/backgrounds.js`, `public/scripts/extensions.js`, `public/scripts/character-library-react-sync.js`, `public/scripts/workspace-panels-react-bridge.js`, `public/scripts/workspace-panel-host-controller.js`, `public/scripts/world-info-shell-context.js`, `public/scripts/main-chat-bridge-contract.js` (legacy workspace facade、main-chat/background/extensions host state event、character-library sync、workspace-panel fail-closed bundle loader、shared host lifecycle seam、World Info shell-context seam 和 main-chat contract constants)
- `src/users.js`, `src/server-main.js`, `src/middleware/react-login-serve.js` (React route hosting、build-missing fallback 和 legacy redirect)
- `app/workspace-panels.tsx` (workspace panel bundle；提供 TanStack Query provider shell、World Info editor/import/export controls、Background Library filter/gallery/action controls、Extensions Host notify/manage/install/Extras controls，以及 main-chat direct-child message-window controller、finalized rich-body snapshot/owner-marker boundary、current-session scroll restore、visible row/actions/composer/slash owners 与标准 direct-chat visible transport mutation；legacy formatter、quiet/background generation、excluded compatibility transport paths 和 slash registry/executor 仍留在原 owner)
- `default/config.yaml` (当前 `features.react.pages.*` 和 `features.react.panels.*` 默认值)
- `globalThis.SillyTavern`, `eventSource` / `event_types`, `@sillytavern/*`（最终策略已冻结：前两类为 frozen facade / long-term support，internal bridge 不替代它们）

未来规划绑定点：
- future React-owned main-chat modules under `app/components/main-chat/*`, `app/lib/main-chat/*` and the matching TanStack Form / Query integration layer（Phase 4A / 4B 的 archived proof已经固定当前 owner split；exact file map for full cutover must be fixed by the Phase 7 transport / renderer specs and ADR updates）
- `src/endpoints/*`（Express 是唯一后端路由框架；任何引入第二路由框架的提案必须重新取得 ADR 批准）
- Any future work that reopens character library, World Info, background library, extensions host, main-chat transport, main-chat renderer/windowing, workspace shell, or global compatibility exports must start from the completed Phase 7 ADR closeout and the 2026-07-01 Next Workspace Shell successor notes instead of treating those owner splits as unfinished roadmap debt.

## 相关文档

- [原现代化路线图](modernization-roadmap.md) - 已于 2026-06-05 冻结
- [主聊天后继者范围](main-chat-successor-scope.md) - 主聊天 UX 北极星
- [前端 jQuery 切片迁移](frontend-jquery-slice-migration.md) - 原 page controller 模式
- [第三方扩展兼容性](third-party-extension-compatibility.md) - 兼容性保护表面
- [React settings payload processing flow](../logic-description/react_settings_payload_processing_flow.md) - React `/settings` form defaults、save payload、legacy Vertex AI round-trip 与 advanced reasoning effort 兼容规则
- [React character-library sync processing flow](../logic-description/react_character_library_sync_processing_flow.md) - React character-library island 与 legacy `characters` 状态同步规则
- [React workspace shell child-slot processing flow](../logic-description/react_workspace_panel_flags_processing_flow.md) - always-on React shell、child-slot lifecycle 与 React-owned pin authority
- [Workspace shell child-slot coordination](workspace-shell-panel-dock-coordination.md) - same-entry React shell 如何管理 registry、local recovery 与 child-host projection
- [Background Library Panel](../db/features/background-library-panel.md) - Phase 2 Sprint 6 当前 guarded action island 与 legacy-owned 行为边界
- [Extensions Panel Open](../db/features/extension-panel-open.md) - Phase 2 Sprint 7 当前 guarded action island 与 legacy-owned 扩展行为边界
- [ADR-0007: React page and panel islands with legacy fallbacks](../adr/0007-react-page-islands-with-legacy-fallbacks.md) - Phase 0-3B guarded island / fallback 基线；Phase 7 cutover ADR update 必须显式说明哪些 fallback 被删除、冻结或长期支持
- React 推荐技术栈：`C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.docs\tech\recommended-stacks\react.md` - 技术选型来源

## 下一步行动

1. **持续跑回归门**：后续维护继续以 `chat-message-rendering.e2e.js`、`chat-message-layout.e2e.js`、`chat-message-streaming.e2e.js`、focused unit proof、`pnpm run test:compat`、`pnpm run perf:startup` 和 `pnpm run perf:interaction` 保护已冻结的 owner split。
2. **把当前 shell/global 结论当作基线而不是 backlog**：若未来有人想重开 separate-route/full SPA shell、删除 `globalThis.SillyTavern`、缩减 `eventSource` / `event_types`、或收窄 `@sillytavern/*`，必须新开 spec/ADR，并提供 replacement、migration note、rollback 与 `JS-Slash-Runner` 级证据。当前已批准的 Next Workspace Shell 是当前 `/` 的 same-entry takeover，不是 full SPA 旁路。
3. **继续执行 TanStack 和兼容边界约束**：后续任何新增 React-owned 查询、mutation 或表单输入仍默认使用 TanStack Query + TanStack Form + Zod，且不得顺手扩张 `__emberDeskReactCompatibilityBridge` 或新增未文档化 public compatibility surface。
