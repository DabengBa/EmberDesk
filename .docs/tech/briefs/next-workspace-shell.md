# Next Workspace Shell 同入口接管意图

日期：2026-07-01

## 原始请求

用户指出当前 EmberDesk 已经在使用 React 版本的工作区局部能力，因此对“另建 `/workspace-next`”没有信心。用户确认新的方向应是：在当前 `/` 工作区继续扩大 React owner 范围，分阶段接管工作区壳层，并将每个阶段拆成多个步骤分别编写 `spec.md` 开发设计文档；同时重新整理或删除旧的 `.docs/specs/260701-01-next-workspace-shell`。

## 背景

当前 React 现代化路线图已完成并进入兼容维护。生产入口 `/` 仍由 jQuery workspace shell 承载，但多个核心工作区 surface 已经是 React owner 或 React-controlled owner：

- Character Library 可见 toolbar/list/search/sort/bulk 浏览状态已由 React panel path 正常拥有。
- World Info、Background Library、Extensions Host 已通过 React host/action surfaces 和 legacy compatibility facades 运行。
- Main Chat Message List 已拥有 React row-lifecycle/windowing、safe finalized rich-body、visible composer、slash UI、message action shell、标准 OpenAI direct-chat visible transport 等边界。
- Zustand stores、global compatibility bridge、workspace panel mount result contract 和 `JS-Slash-Runner` compatibility gate 已形成证据基础。

因此本次不应再把“全面现代化”设计成旁路 route。更准确的 successor 方向是：当前 `/` 同入口逐层接管，让 React 从内部 islands 向外接管 workspace chrome、布局、导航、面板调度、聊天 canvas 和状态恢复，同时把 legacy shell 降级为兼容 substrate。

## 意图

创建一组可审批、可交付的同入口 shell takeover specs。每个 spec 都必须：

1. 仍从当前 `/` 工作区入口推进，不新增旁路工作区作为主方案。
2. 复用已交付 React surfaces，而不是重写已有 React owner。
3. 保留 legacy compatibility substrate，直到某个 surface 有单独删除/冻结证据。
4. 让用户可见体验逐步变成统一的新工作区，而不是旧壳里混着新组件。

## 分阶段交付集

### Phase A: Shell Takeover Foundation

- `260701-01-same-entry-shell-takeover-foundation`: 建立同入口 takeover 决策、feature gate、owner/fallback marker 和诊断 vocabulary。
- `260701-02-react-workspace-chrome`: 让 React 接管当前 `/` 的外层 workspace chrome 与全局状态条，但不移动高风险消息/扩展 DOM。

### Phase B: Workspace Coordination

- `260701-03-panel-dock-and-drawer-coordination`: 让 React 统一调度角色库、World Info、Backgrounds、Extensions 的入口、dock/drawer 状态和 fallback。
- `260701-04-main-chat-layout-and-composer-shell`: 让 React 统一主聊天布局、composer/action rail 和局部状态区，继续保留 protected message row 和 excluded transport fallback。

### Phase C: Interaction Hardening

- `260701-05-responsive-and-recovery-hardening`: 统一 desktop/mobile 行为、面板折叠、错误恢复和局部 loading/empty/error 状态。

### Phase D: Default Owner Gate

- `260701-06-default-owner-gate-and-adr-package`: 汇总证据，准备是否把 React shell 作为 `/` 默认外层 owner 的 ADR update；不在证据不足时删除兼容 substrate。

## 结果约束

- 用户仍打开当前 `/` 工作区；改造后应逐步感到“同一个工作区变现代”，而不是“另一个实验工作区”。
- 任何阶段失败都不能破坏当前可用的聊天、角色库、World Info、Backgrounds、Extensions、slash、regex 或第三方扩展能力。
- 新 shell 必须遵循 `DESIGN.md` 的 “The Workshop at Midnight” 方向：暗色、功能密度、低疲劳、紧凑控制、blur/tint depth、稀疏语义色。
- 每个阶段必须有 focused proof；涉及兼容面必须跑 `bun run test:compat`。

## 非目标

- 不新增 `/workspace-next` 作为主要交付路径。
- 不替换 Express 5 runtime owner。
- 不改变 canonical user data 的 file-backed 模型。
- 不引入 shadcn/ui、Ant Design 或其他 UI 组件库作为第一阶段前提。
- 不公开 `__emberDeskReactCompatibilityBridge` 给第三方 extension。
- 不把 Canvas / Artifacts / RAG / MCP / code execution / automation 混入 shell takeover。

## Intent Domains

### Domain 1: 从旁路改为同入口

- **用户期望**：承认当前 React 工作区已经在生产路径中，不要再另起 `/workspace-next`。
- **设计结论**：删除旧旁路 spec，改成当前 `/` 的 same-entry takeover spec set。
- **当前状态**：Phase A foundation 已交付同入口 takeover feature payload、诊断 marker 和 owner/failure vocabulary；未新增 `/workspace-next`。
- **变更历史**：
  - 2026-07-01: 第一阶段实现落地到 `src/workspace-react-features.js`、`public/scripts/workspace-shell-takeover-contract.js`、`public/script.js` 和对应 focused tests。
  - 2026-07-01: 第二阶段实现同入口 React workspace chrome；仍未新增 `/workspace-next`。
- **实现追踪**：第一阶段和第二阶段均已开发完成并进入 wrap-up；持久事实见 `.docs/PROJECT_HISTORY.md` 的 2026-07-01 same-entry shell takeover foundation 与 same-entry React workspace chrome 记录。

### Domain 2: 继续接管而不是重做

- **用户期望**：已有 React surface 应继续向外接管，形成统一体验。
- **设计结论**：每个 spec 优先复用现有 React panel/main-chat owner，不引入第二套角色库、第二套消息列表或第二套扩展协议。
- **当前状态**：第一阶段发布隐藏诊断和决策契约；第二阶段在 `features.react.shell.takeover=true` 时让 React 接管可见外层 chrome、当前上下文摘要、shell 状态和主导航入口。Legacy drawer 内容、chat、composer 和 protected extension mount points 仍保留为兼容 substrate。
- **变更历史**：
  - 2026-07-01: 明确 fallback 不是开发通过条件；dev/CI/test strict 失败和 production safety fallback 被拆成不同语义。
  - 2026-07-01: 真实浏览器 smoke 发现旧 `Character Management` 和 `Extensions` 主入口仍与 React chrome 竞争；已通过 `body[data-react-workspace-shell-chrome="mounted"]` 隐藏 legacy primary entry buttons，同时保留 drawer content。
- **实现追踪**：`reactShell.strict` 由 bootstrap payload 暴露，CI 或非 production 环境在 takeover 开启时默认 strict；production 默认保留 safety fallback。React chrome 代码路径为 `public/script.js`、`public/scripts/workspace-panels-react-bridge.js`、`app/workspace-panels.tsx`、`public/style.css`。

### Domain 3: 阶段化证明

- **用户期望**：每个阶段再分多个步骤，有独立 spec 开发文档。
- **设计结论**：6 个 specs 按 foundation、chrome、panel coordination、main-chat shell、responsive/recovery、ADR gate 排列。
- **当前状态**：第一阶段 foundation 和第二阶段 React chrome 已通过 focused unit、compat、React workspace panel build、semantic docs build/check、layout E2E，以及 takeover=true 的真实浏览器 smoke；后续 03-06 specs 仍是待批准输入。
- **变更历史**：
  - 2026-07-01: 第一阶段 review 修复了 failure vocabulary 过窄、strict mode 未进入 bootstrap payload、早期 body 缺失会抛原始错误的问题。
- **实现追踪**：验证面包括 `workspace-react-panel-flags.test.js`、`react-workspace-panels-helpers.test.js`、`chat-workspace-structure.test.js`、`bun run test:compat`、`bun run build:react:workspace-panels`、`bun run docs:build`、`PLAYWRIGHT_CHROME_EXECUTABLE=/opt/google/chrome/chrome bun run --cwd tests test:e2e -- chat-message-layout.e2e.js --workers=1`，以及 2026-07-01 takeover=true smoke（chrome/takeover status `ready`，visible legacy primary entries `0`，composer not overlapped，no `/workspace-next`）。

## 源证据链

- `.docs/project-overview.md`: 当前项目定位、React islands 状态、file-backed data、compatibility facade 边界。
- `.docs/PROJECT_HISTORY.md`: 2026-06-23 到 2026-06-30 的 React owner cutover、workspace panel contract、shell freeze 记录。
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`: 旧决策和 Phase 7 Sprint 7 shell/global closeout；本组 specs 是重开该边界的 successor 输入。
- `.docs/tech/react-modernization-roadmap.md`: 当前 React 现代化已完成、未来重开 shell/global 必须新开 spec/ADR 的要求。
- `.docs/tech/third-party-extension-compatibility.md`: `JS-Slash-Runner` primary compatibility gate、protected mount points、slash/regex/event/global surfaces。
- `.docs/db/pages/chat-workspace.md`: 当前 `/` 工作区语义、状态、面板、main-chat 迁移边界。
- `DESIGN.md`: 当前 EmberDesk 视觉系统和 UI 风格约束。
- `app/workspace-panels.tsx`, `public/scripts/workspace-panels-react-bridge.js`, `public/scripts/workspace-panel-host-controller.js`: 当前 workspace panel React bridge 和 mount result contract。
- `src/workspace-react-features.js`: 现有 workspace React feature bootstrap payload。

## 变更历史

- 2026-07-01: 创建 `Next Workspace Shell` 意图记录，原方案为 opt-in `/workspace-next`。
- 2026-07-01: 按用户反馈改为当前 `/` 同入口继续接管；删除旧旁路 route spec，改成 6 个 same-entry takeover specs。
- 2026-07-01: 交付第一阶段 same-entry shell takeover foundation；同入口 feature payload、strict/safety 决策、hidden marker 和 semantic docs 已落地。
- 2026-07-01: 交付第二阶段 React workspace chrome；同入口 React chrome、role/name 主导航、legacy primary entry 隐藏、semantic feature doc 和 browser smoke 已落地。
