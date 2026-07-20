# Settings 工作区 Overlay 打开路径 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260720-01-settings-workspace-overlay.md`
Doc IDs: page.settings, page.chat_workspace, feature.next_workspace_shell, page.api_configuration

## Tasks

### Task 1: 抽取可由完整页与工作区复用的 Settings surface
- [x] **Done**
- **Reqs:** R4, R5, R7
- **Kind:** behavior
- **Scope:** `app/routes/settings.tsx`, 新/现有 `app/components/settings/*`、`app/styles/globals.css`，必要时 shared props/types
- **Proof:** command: bun run --cwd tests test:unit -- settings-react-route.test.js --runInBand && bun run build:react
- **PM:** 直达 `/settings?tab=providers`，编辑一项安全 UI/provider 字段并保存，再触发既有 conflict/reload 路径 -> 完整页仍使用唯一 Settings 表单、保存与错误状态保持原语义
- **Doc IDs:** page.settings
- **Evidence:** evidence/task-01.md
- **Notes:** 从路由抽出可注入 initial tab / close affordance 的 surface；不得复制字段映射、secret 或 save 流。

### Task 2: 在 workspace shell 挂载独立 Settings overlay
- [x] **Done**
- **Reqs:** R1, R2, R3, R6, R8
- **Kind:** behavior
- **Scope:** `app/workspace-panels.tsx`, `public/script.js`, `app/stores/workspace-panel-store.js`（仅若现有 store 需最小扩展）、workspace-compatible CSS / Settings overlay CSS
- **Proof:** command: bun run build:react:workspace-panels && bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js --runInBand
- **PM:** 在 `/` 依次点 Settings、AI Config、Formatting -> URL 不变，overlay 分别落在 General、Providers、Advanced；关闭按钮/Esc/同入口再次点击 -> overlay 关闭，composer 继续可用；窄屏不出现顶栏横向滚动
- **Doc IDs:** page.chat_workspace, feature.next_workspace_shell, page.settings
- **Evidence:** evidence/task-02.md
- **Notes:** 默认独立 overlay 层，不占 child-slot pin，不强制 unmount 其它 panel；legacy toggle 进入同一同页策略，绝不恢复 legacy Settings drawer。

### Task 3: 保留完整页深链、路由与兼容失败语义
- [x] **Done**
- **Reqs:** R4, R5
- **Kind:** behavior
- **Scope:** `app/routes/settings.tsx`, route middleware/feature serve tests（若需），`public/script.js` legacy route handoff，`tests/settings-react-route.test.js`, `tests/settings.e2e.js`
- **Proof:** command: bun run --cwd tests test:unit -- settings-react-route.test.js react-workspace-panels-helpers.test.js --runInBand && bun run build:react
- **PM:** 新标签访问 `/settings?tab=providers` 和 `/settings?tab=advanced` -> 完整页显示对应 tab；模拟/验证缺 page build -> HTTP 503 rebuild 指引且没有 legacy drawer fallback
- **Doc IDs:** page.settings, page.api_configuration
- **Evidence:** evidence/task-03.md
- **Notes:** 完整页不是日常 shell 路径，但仍是深链、刷新、分享与 503 契约。

### Task 4: 用浏览器证明 overlay 交互与完整页回归
- [x] **Done**
- **Reqs:** R1, R2, R3, R4, R6, R7, R8
- **Kind:** behavior
- **Scope:** `tests/workspace-shell-panel-navigation.e2e.js`, `tests/settings.e2e.js`，必要时新增专用 Settings overlay E2E
- **Proof:** command: bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js settings.e2e.js --workers=1
- **PM:** 浏览器登录后从 shell 打开三个入口，验证 active tab、关闭与聊天可达；再直达 `/settings` 完成一条既有保存/冲突检查 -> overlay 主路径与完整页均可用
- **Doc IDs:** page.settings, page.chat_workspace, feature.next_workspace_shell, page.api_configuration
- **Evidence:** evidence/task-04.md

### Task 5: 更新语义文档并验证 Doc ID 契约
- [x] **Done**
- **Reqs:** R9
- **Kind:** non-behavior
- **Scope:** `.docs/db/pages/settings.md`, `.docs/db/pages/chat-workspace.md`, `.docs/db/features/next-workspace-shell.md`, `.docs/db/pages/api-configuration.md`，必要时 `.docs/tech/legacy-cutover-ledger.md` / `.docs/PROJECT_HISTORY.md`
- **Proof:** command: bun run docs:check
- **PM:** 审阅 `page.settings`、`page.chat_workspace`、`feature.next_workspace_shell`、`page.api_configuration` -> 文档明确同一 React Settings owner 的 overlay 主入口、完整页深链和无 legacy drawer fallback
- **Doc IDs:** page.settings, page.chat_workspace, feature.next_workspace_shell, page.api_configuration
- **Evidence:** evidence/task-05.md

### Task 6: Settings Overlay UI 约束落地核查
- [x] **Done**
- **Reqs:** R1, R3, R8, R9
- **Kind:** non-behavior
- **Scope:** overlay 容器 CSS（`.settings-overlay` / `.settings-overlay-backdrop`）、overlay header 条件渲染、`app/styles/globals.css` overlay 变体、`design-guidance.md` 对照
- **Proof:** manual: 对照 design-guidance U1–U9：overlay header 无 `.settings-page-summary`；关闭按钮替代 workspace link；窄屏无顶栏横向滚动；shell active pressed 与 reduced-motion 静默
- **PM:** 打开 Settings/AI Config/Formatting overlay 与完整页并排观察 -> overlay 精简 chrome、完整页保留 summary/返回链接，且不引入状态徽章噪音
- **Doc IDs:** page.settings, page.chat_workspace, feature.next_workspace_shell
- **Evidence:** evidence/task-06.md
- **Notes:** 不改字段/API；只落实 design-guidance 的结构与样式约束。

## Review

- [x] Review complete

### Residual risks
- Overlay close by same shell entry requires shell chrome z-index above the dialog; validated in e2e.
- Full WAI-ARIA modal scroll/background inert is partial (body overflow hidden + Tab cycle + Esc); not a second settings owner.
- Dirty overlay close still discards unsaved local draft by design for this slice.
