# React 现代化重构意图

日期：2026-06-15

## 原始请求

用户要求基于参考技术栈 `C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.docs\tech\recommended-stacks\react.md`，为 EmberDesk 编写从 jQuery 迁移到 React 生态的完整现代化路线图。

用户进一步要求为路线图中的每个 Sprint 编写独立的 `spec.md` 文档，并与主路线图建立双向链接。

## 意图

从 jQuery 单体应用（13,583 行 `public/script.js`）渐进式迁移到现代 React 生态，在 12-18 个月内完成以下目标：

1. **前端现代化**：用 React 19 + TanStack Router 的 feature-flagged page/panel islands 逐步替代低风险 jQuery surface，建立组件化、类型安全的前端架构
2. **构建工具升级**：用 Vite 承接 `/lib.js` 主构建、共享 React app 和 panel bundles；Webpack 只保留为 deprecated fallback / Docker precompile path
3. **类型安全**：渐进式引入 TypeScript，前后端类型共享
4. **状态管理**：后续 Phase 4 再评估用 Zustand 替代 `globalThis.SillyTavern` 全局对象；当前代码仍保留 legacy globals 兼容面
5. **后端 API 现代化**：后续 Phase 5 再评估用 Hono 替代 Express；当前代码仍以 Express 5 为 API owner
6. **性能优化**：虚拟滚动优化长列表，启动时间和交互响应不劣化
7. **扩展兼容性**：保持 `@sillytavern/*`、`eventSource`、`event_types` 兼容层 ≥6 个月

## 结果约束

### 功能完整性

- 所有现有功能在 React 版本中可用
- 用户数据（文件存储）保持不变，SQLite 仅作 derived cache
- 第三方扩展至少 80% 无需修改即可工作

### 性能目标

- 启动时间 ≤ 当前 jQuery 版本基准
- 交互响应 < 100ms（关键路径）
- 1000 条消息滚动流畅（60fps）

### 迁移模式

- **渐进式迁移**：React 和 jQuery 共存，通过 feature flag 控制
- **Page-by-Page**：每次迁移一个完整页面，不做半成品
- **灰度发布**：Beta 用户验证 → 全量发布 → 清理旧代码

### 架构约束

- 保持文件作为用户数据正本（不迁移到数据库优先）
- 保持 Node.js 26.3.0 作为运行时（Bun 仅作包管理器）
- 保持 Playwright E2E 测试框架
- 不引入 React 以外的前端框架（如 Vue、Svelte）

## 约束

- 不破坏现有扩展兼容性表面（至少维护 6 个月兼容层）
- 不改变 API 端点契约（URL、请求体、响应格式）
- 不改变用户可见的产品语义（`.docs/db/` 拥有）
- 不在单个 Sprint 内混合多个高风险变更（如同时迁移前端框架和后端框架）
- 每个 Sprint 必须可独立交付和验证

## 源证据链

- `C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.docs\tech\recommended-stacks\react.md`: 技术栈选型依据（核对日期 2026-06-05）
- `.docs/tech/modernization-roadmap.md`: 原 jQuery 现代化路线图（已于 2026-06-05 冻结）
- `.docs/tech/modernization-phase1-complexity-map.md`: 复杂度分析，`public/script.js` 13,583 行是核心瓶颈
- `.docs/tech/frontend-jquery-slice-migration.md`: 已有的 page controller 模式（login、setup）
- `.docs/tech/third-party-extension-compatibility.md`: 扩展兼容性保护表面
- `AGENTS.md`: 项目约束（不引入 SPA 框架需明确批准、保持文件存储）
- TanStack Router 文档 (https://tanstack.com/router/latest): 当前 React page islands 的路由基础
- React 19 文档 (https://react.dev/): Server Components、Actions
- Vite 8 文档 (https://vite.dev/): 快速构建工具
- Hono 文档 (https://hono.dev/): Phase 5 未来 API 候选，不是当前已采用依赖

## 假设

- 用户已批准从 jQuery 迁移到 React 生态；早期迁移边界已由 [ADR-0007](../../adr/0007-react-page-islands-with-legacy-fallbacks.md) 正式确认
- 团队具备 React 19、TypeScript、TanStack 生态的技能储备（或愿意培训）
- 12-18 个月的迁移周期可接受
- 迁移期间 React 和 jQuery 共存的复杂性可管理
- 第三方扩展开发者愿意配合兼容性迁移（6 个月窗口期）

## Spec 文档组织结构

采用**混合方案**：Phase 作为目录，Sprint 作为独立 spec。

```
.docs/specs/
├─ react-phase0-infrastructure/
│  ├─ README.md                              # Phase 0 概览
│  ├─ phase0-sprint1-vite-migration.md       # Sprint 1: Vite 替换 Webpack
│  ├─ phase0-sprint2-typescript-config.md    # Sprint 2: TypeScript 配置
│  ├─ phase0-sprint3-react-dev-env.md        # Sprint 3: React 开发环境
│  └─ phase0-sprint4-tailwind-integration.md # Sprint 4: Tailwind CSS 集成
├─ react-phase1-independent-pages/
│  ├─ README.md
│  ├─ phase1-sprint1-login-page.md           # Sprint 5: Login 页面
│  ├─ phase1-sprint2-setup-page.md           # Sprint 7: Setup 页面
│  └─ phase1-sprint3-settings-panel.md       # Sprint 9: Settings 面板
├─ react-phase2-sidebars/
│  ├─ README.md
│  ├─ phase2-sprint1-character-library-list.md
│  ├─ phase2-sprint2-character-library-search.md
│  ├─ phase2-sprint3-character-library-bulk.md
│  ├─ phase2-sprint4-world-info-editor.md
│  ├─ phase2-sprint5-world-info-import.md
│  ├─ phase2-sprint6-background-library.md
│  └─ phase2-sprint7-extensions-host.md
├─ react-phase3-main-chat/
│  ├─ README.md
│  ├─ phase3-sprint1-message-list-basic.md
│  ├─ phase3-sprint2-message-list-rich.md
│  ├─ phase3-sprint3-message-list-scroll.md
│  ├─ phase3-sprint4-streaming-sse.md
│  ├─ phase3-sprint5-streaming-control.md
│  ├─ phase3-sprint6-input-basic.md
│  ├─ phase3-sprint7-input-slash.md
│  ├─ phase3-sprint8-message-actions.md
│  └─ phase3-sprint9-integration.md
├─ react-phase4-state-management/
│  ├─ README.md
│  ├─ phase4-sprint1-zustand-stores.md
│  ├─ phase4-sprint2-compat-bridge.md
│  └─ phase4-sprint3-extension-guide.md
├─ react-phase5-backend-api/
│  ├─ README.md
│  ├─ phase5-sprint1-hono-routes.md          # Sprint 36: Hono 路由
│  ├─ phase5-sprint2-drizzle-orm.md          # Sprint 38: Drizzle ORM
│  └─ phase5-sprint3-express-sunset.md       # Sprint 40: Express 完全切换
└─ react-phase6-extension-compat/
   └─ README.md                               # 持续维护，无独立 Sprint
```

### 命名规范

- **Phase 目录**：`react-phase{N}-{phase-slug}/`
- **Phase README**：`README.md`（Phase 概览、目标、验证门）
- **Sprint Spec**：`phase{N}-sprint{M}-{feature-slug}.md`
  - `N`: Phase 编号（0-5）
  - `M`: Phase 内 Sprint 序号（1, 2, 3...）
  - `feature-slug`: 功能描述（kebab-case）

### 双向链接

**主路线图 → Sprint Spec**：
```markdown
<!-- .docs/tech/react-modernization-roadmap.md -->

#### Sprint 1-2: Vite + TypeScript
- 📋 [Sprint 1: Vite 迁移](../specs/react-phase0-infrastructure/phase0-sprint1-vite-migration.md)
- 📋 [Sprint 2: TypeScript 配置](../specs/react-phase0-infrastructure/phase0-sprint2-typescript-config.md)
```

**Sprint Spec → 主路线图**：
```markdown
<!-- phase0-sprint1-vite-migration.md -->

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-0-基础设施准备3-个月)
- **Phase**：Phase 0 - 基础设施准备
- **Sprint**：Phase 0 Sprint 1（全局 Sprint 1/40）
- **预计工期**：2 周
```

## 实施可追溯性

### 交付状态

- ✅ 2026-06-15: 创建主路线图 `.docs/tech/react-modernization-roadmap.md`
- ✅ 2026-06-15: 创建意图文档 `.docs/tech/briefs/react-modernization-intent.md`
- ✅ 2026-06-15: 创建 Phase 0 Sprint 1-4 spec
- ✅ 2026-06-15: **Phase 0 Sprint 1: Vite 迁移**完成交付
  - 代码路径: `vite.config.ts`, `src/middleware/vite-lib-serve.js`, `package.json`
  - 追踪: 已进入当前代码，稳定引用见 `.docs/PROJECT_HISTORY.md` 与 `.docs/tech/react-modernization-roadmap.md`
  - 验证: `frontend-shared-library-boundary.test.js` 通过，Vite 构建成功（33.89s）
  - 状态: 已由后续 Phase 0 当前状态补记收束
- ✅ 已完成: Phase 0 Sprint 2-4 实施
- ✅ 已完成: 创建 Phase 1-5 所有 Sprint specs
- ✅ 已完成: [ADR-0007](../../adr/0007-react-page-islands-with-legacy-fallbacks.md) 记录早期 React page/panel island 与 legacy fallback 的迁移决策

### 当前状态补记（2026-06-19）

上面的待办来自 2026-06-15 的原始意图冻结点。按当前代码和 durable docs，后续已有部分关闭：

- ✅ Phase 0 Sprint 2-4 已落地：`tsconfig.json`、`eslint.config.js`、`app/client.tsx`、`app/router.tsx`、`app/routes/*`、`app/styles/globals.css`、`vite.config.ts` 已形成 React app 基础设施。
- ✅ Phase 1 已落地：`/login` 默认启用 React，`/setup` 和 `/settings` 已作为 feature-flagged React page islands 交付，并保留 `/login.html`、`/setup.html` 和 legacy `/` fallback。
- ✅ Phase 2 Sprint 1-3 已落地：Character Library 已作为 `features.react.panels.characterLibrary` 控制的 workspace panel island 交付，bundle 入口为 `app/character-library-panel.tsx`，legacy tag controls 和兼容 DOM 仍保留。
- ✅ Phase 2 Sprint 4-7 已推进到 guarded host/status bridge：`features.react.panels.worldInfo` / `backgroundLibrary` / `extensionsHost`、`public/scripts/workspace-panels-react-bridge.js`、`app/workspace-panels.tsx` 和 `build:react:workspace-panels` 已接线；World Info、Background Library、Extensions Host 现在可在 flag 开启时显示独立 readiness/status host。
- ✅ ADR-0007 已接受，用于替代原先的 ADR 占位：早期 React 迁移采用 page/panel islands + legacy fallback，而不是一次性 SPA cutover。
- 📋 Phase 2 Sprint 4-7 尚未完成完整 panel 行为迁移：World Info activation/import/regex/delete、Background upload/delete/rename/select/slash behavior、Extensions discovery/mount/API/install/update/delete behavior 仍由 legacy 面板拥有；当前 React host 只呈现受保护状态面。
- 📋 TanStack Start、Hono、Zustand、Drizzle ORM、Vitest、shadcn/ui 和 Ant Design 仍是后续候选或原始推荐栈内容；当前代码事实只支持把 React 19、TanStack Router、TanStack Query、TanStack Form、Zod、TanStack Virtual、Vite 8、Tailwind v4、TypeScript 6 和 ESLint 10 写成已采用。

### 代码路径（预期）

迁移完成后的目录结构：
```
D:\DEV\EmberDesk\
├─ app/                           # 新 React 应用（TanStack Router page/panel islands）
│  ├─ routes/                     # 文件系统路由
│  ├─ components/                 # React 组件
│  ├─ stores/                     # Zustand stores
│  ├─ lib/                        # 工具函数
│  ├─ compat/                     # 兼容层
│  │  └─ globalBridge.ts          # globalThis.SillyTavern 桥接
│  └─ server/                     # Hono API（后期）
├─ src/                           # 现有 Express 后端（保持）
├─ public/                        # 现有 jQuery 前端（逐步淘汰）
└─ .docs/
   ├─ tech/
   │  ├─ react-modernization-roadmap.md
   │  └─ briefs/
   │     └─ react-modernization-intent.md
   └─ specs/
      ├─ react-phase0-infrastructure/
      ├─ react-phase1-independent-pages/
      ├─ react-phase2-sidebars/
      ├─ react-phase3-main-chat/
      ├─ react-phase4-state-management/
      └─ react-phase5-backend-api/
```

### 验证门

每个 Sprint 的 Definition of Done：
- [ ] `bun run lint` 通过
- [ ] `bun run test:unit` 通过（新增测试覆盖）
- [ ] 对应 E2E 测试通过
- [ ] `bun run test:compat` 通过（触及兼容性表面时）
- [ ] 性能不劣化（`bun run perf:startup` 或 `bun run perf:interaction`）
- [ ] Code review 完成（关键路径需 2 人 approve）
- [ ] 灰度发布验证通过（≥3 天）
- [ ] 文档更新（`.docs/tech/` 或 `.docs/db/`）

## 变更历史

- 2026-06-15: 创建 React 现代化重构意图文档，基于用户请求和参考技术栈
- 2026-06-15: 确认 Spec 组织结构为混合方案（方案 C）和命名规范（方案 B）
- 2026-06-15: 定义双向链接格式和验证门
- 2026-06-19: 按当前代码补记 Phase 2 Sprint 4-7 的 guarded host/status bridge 已接线，同时明确完整 World Info / Backgrounds / Extensions 行为迁移仍未完成
