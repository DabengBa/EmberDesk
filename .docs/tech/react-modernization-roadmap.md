# EmberDesk React 现代化重构路线图

## 模块职责

本文档定义 EmberDesk 从 jQuery 单体应用迁移到现代 React 生态的完整路线图。这是一个 12-18 个月的渐进式重构计划，在保持产品可用性和扩展兼容性的前提下，逐步替换技术栈核心组件。

## 状态

状态：草案，待 ADR 批准  
创建日期：2026-06-15  
前置条件：`.docs/tech/modernization-roadmap.md` 已于 2026-06-05 冻结完成

本路线图不改变用户可见的产品语义。用户界面行为仍由 `.docs/db/` 拥有。

## 目标技术栈

基于 `C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.docs\tech\recommended-stacks\react.md` (核对日期：2026-06-05)

| 层级 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 框架 | TanStack Start | `@tanstack/react-start` 1.168.19+ (v1.x RC) | 全栈 React 框架，SSR/SSG/SPA 灵活切换 |
| 路由 | TanStack Router | `@tanstack/react-router` 1.170.11+ | 类型安全路由，文件系统路由 |
| 语言 | TypeScript 6 + React 19 | `react` 19.2.7+, `typescript` 6.0.3+ | 渐进式迁移，先 `.ts` 后严格模式 |
| Lint/格式化 | ESLint 10 + typescript-eslint + Prettier | `eslint` 10.4.1+, `typescript-eslint` 8.60.1+ | 已完成 ESLint 10 flat config 升级 |
| 包管理/运行 | Bun | 1.3.14+ | 已是当前包管理器 |
| 构建 | Vite | `vite` 8.0.16+ | 替代 Webpack，HMR 开发体验 |
| 样式 | Tailwind CSS v4 | `tailwindcss` 4.3.0+ | 实用优先，替代手写 CSS |
| UI 组件 | shadcn/ui + Ant Design | `shadcn` 4.10.0+, `antd` 5.x | shadcn 复制式组件 + Ant Design 复杂组件 |
| API | TanStack Start Server Functions + Hono | `hono` 4.12.23+, `@hono/node-server` 2.0.4+ | 内部用 Server Functions，公开 API 用 Hono 替代 Express |
| 数据获取 | TanStack Query | `@tanstack/react-query` 5.101.0+ | 服务端状态管理，替代手动 fetch |
| ORM/数据库 | Drizzle ORM + SQLite | `drizzle-orm` 0.45.2+, `better-sqlite3` | 类型安全 ORM，增强现有 SQLite derived cache |
| 表单 | TanStack Form + Zod | `@tanstack/react-form` 1.33.0+, `zod` 4.4.3+ | 类型安全表单验证 |
| 状态 | Zustand | `zustand` 5.0.14+ | 轻量状态管理，替代 `globalThis.SillyTavern` |
| 测试 | Vitest + Playwright | `vitest` 4.1.8+, `@playwright/test` 1.60.0+ | 替代 Jest，保留 Playwright |
| 工具 | React Doctor | `eslint-plugin-react-doctor` 0.2.16+ | React 性能和最佳实践检测 |

## 架构原则

1. **渐进式迁移**：保持 Express 后端和 jQuery 前端同时运行，逐页面/面板迁移到 React
2. **兼容性优先**：在完全迁移前，维护 `@sillytavern/*` 别名、`eventSource`、`event_types` 兼容层
3. **文件存储不变**：继续使用文件作为用户数据正本，SQLite 仅作 derived cache
4. **测试驱动**：每个迁移步骤必须有对应的单元测试或 E2E 测试
5. **性能可测**：保留 startup/interaction performance runner，迁移后性能不能劣化
6. **TanStack 收口优先**：React 页面迁移默认必须使用 TanStack Form + Zod 管理表单和校验，使用 TanStack Query 管理服务端状态；任何例外都必须在对应 spec/ADR 中说明原因和退出计划

## 迁移阶段

### Phase 0: 基础设施准备（3 个月）

**目标**：搭建 React 基础设施，不改变现有功能

📋 **详细规范**：[Phase 0 README](../specs/react-phase0-infrastructure/README.md)

**Sprint 列表**：
- 📋 [Sprint 1: Vite 迁移](../specs/react-phase0-infrastructure/phase0-sprint1-vite-migration.md)（2 周）
- 📋 [Sprint 2: TypeScript 配置](../specs/react-phase0-infrastructure/phase0-sprint2-typescript-config.md)（2 周）
- 📋 [Sprint 3: React 开发环境](../specs/react-phase0-infrastructure/phase0-sprint3-react-dev-env.md)（2 周）
- 📋 [Sprint 4: Tailwind CSS 集成](../specs/react-phase0-infrastructure/phase0-sprint4-tailwind-integration.md)（2 周）

---

### Phase 1: 独立页面迁移（3 个月）

**目标**：迁移登录、设置、角色库等独立页面到 React

📋 **详细规范**：[Phase 1 README](../specs/react-phase1-independent-pages/README.md)

**当前执行状态**：
- `Sprint 1 / Login`：React 页面已上线并默认开启，`/login.html` 保留 legacy 回退入口；React 登录流程已按路线图完成 TanStack Form / Zod / TanStack Query 收口。
- `Sprint 2 / Setup`：React 页面已交付并由 `features.react.pages.setup` 控制，默认保持关闭；`/setup.html` 保留 legacy 回退入口；React setup 流程已按路线图完成 TanStack Form / Zod / TanStack Query 收口。
- `Sprint 3 / Settings`：React `/settings` 已交付并由 `features.react.pages.settings` 控制；flag 开启且 React build 存在时进入独立 Settings 页面，关闭或缺 build 时回退到 legacy `/` 工作区；本 Sprint 已严格采用 TanStack Form / Zod / TanStack Query，覆盖更广的 General 控制、fallback / Vertex AI / prompt post-processing、更多 UI 设置，以及 Advanced 中的大部分 power-user 设置面。用户可见语义见 [`page.settings`](../db/pages/settings.md)。

**Sprint 列表**：
- ✅ [Sprint 1: Login 页面 React 重写](../specs/react-phase1-independent-pages/phase1-sprint1-login-page.md)（2 周，React 实现已上线并默认开启 feature flag；TanStack Form / Zod / Query 已完成收口）
- ✅ [Sprint 2: Setup 页面 React 重写](../specs/react-phase1-independent-pages/phase1-sprint2-setup-page.md)（2 周，React 实现已交付并挂在 `features.react.pages.setup` 下；`/setup.html` 保留 legacy 回退入口；TanStack Form / Zod / Query 已完成收口）
- ✅ [Sprint 3: Settings 面板 React 重写](../specs/react-phase1-independent-pages/phase1-sprint3-settings-panel.md)（4 周，React `/settings` 已交付并挂在 `features.react.pages.settings` 下；覆盖 General / Providers / User Interface / Advanced 的 Sprint 3 设置切片；TanStack Form / Zod / Query 已完成收口）

---

### Phase 2: 侧边栏和面板迁移（5 个月）

**目标**：迁移角色库、世界信息、背景库、扩展宿主面板等主工作区侧边栏/面板到 React

📋 **详细规范**：[Phase 2 README](../specs/react-phase2-sidebars/README.md)

**Sprint 列表**：
- 📋 [Sprint 1: 角色库面板 - 列表基础](../specs/react-phase2-sidebars/phase2-sprint1-character-library-list.md)（3 周）
- 📋 [Sprint 2: 角色库面板 - 搜索过滤](../specs/react-phase2-sidebars/phase2-sprint2-character-library-search.md)（2 周）
- 📋 [Sprint 3: 角色库面板 - 批量操作](../specs/react-phase2-sidebars/phase2-sprint3-character-library-bulk.md)（2 周）
- 📋 [Sprint 4: 世界信息面板 - 编辑器](../specs/react-phase2-sidebars/phase2-sprint4-world-info-editor.md)（3 周）
- 📋 [Sprint 5: 世界信息面板 - 导入导出](../specs/react-phase2-sidebars/phase2-sprint5-world-info-import.md)（2 周）
- 📋 [Sprint 6: 背景库面板](../specs/react-phase2-sidebars/phase2-sprint6-background-library.md)（2 周）
- 📋 [Sprint 7: Extensions 面板宿主](../specs/react-phase2-sidebars/phase2-sprint7-extensions-host.md)（3 周，迁移 `Extensions` drawer 宿主 UI、保留 `#extensions_settings` / `#extensions_settings2` / `#regex_container` 等受保护挂载点）

**Phase 1 Sprint 3 后续边界**：`World Info`、`Backgrounds`、`Extensions` 没有混入 React `/settings`。它们按路线图进入 Phase 2：World Info 在 Sprint 4-5，Backgrounds 在 Sprint 6，Extensions drawer 宿主在 Sprint 7；第三方扩展 API、挂载兼容和迁移指南仍由 Phase 4 / Phase 6 负责。

**World Info 验证门**：
```powershell
bun run --cwd tests test:unit -- world-info-*.test.js --runInBand
```

#### 2.3 背景库面板 React 重写

- 创建 `app/components/background-library/`
- 复用 `public/scripts/background-panel-controller.js` 逻辑
- 保持 `/api/backgrounds/*` API 不变

**验证门**：
```powershell
bun run --cwd tests test:unit -- background-panel-controller.test.js --runInBand
```

---

### Phase 3: 主聊天工作区迁移（6 个月，最高风险）

**目标**：迁移核心聊天界面到 React，这是整个迁移最复杂的部分

📋 **详细规范**：[Phase 3 README](../specs/react-phase3-main-chat/README.md)

**Sprint 列表**：
- 📋 [Sprint 1: 消息列表 - 基础渲染](../specs/react-phase3-main-chat/phase3-sprint1-message-list-basic.md)（3 周）
- 📋 [Sprint 2: 消息列表 - Markdown 和媒体](../specs/react-phase3-main-chat/phase3-sprint2-message-list-rich.md)（2 周）
- 📋 [Sprint 3: 消息列表 - 滚动和定位](../specs/react-phase3-main-chat/phase3-sprint3-message-list-scroll.md)（2 周）
- 📋 [Sprint 4: 流式生成 - SSE 连接](../specs/react-phase3-main-chat/phase3-sprint4-streaming-sse.md)（2 周）
- 📋 [Sprint 5: 流式生成 - 控制状态](../specs/react-phase3-main-chat/phase3-sprint5-streaming-control.md)（2 周）
- 📋 [Sprint 6: 输入框 - 基础功能](../specs/react-phase3-main-chat/phase3-sprint6-input-basic.md)（2 周）
- 📋 [Sprint 7: 输入框 - 斜杠命令](../specs/react-phase3-main-chat/phase3-sprint7-input-slash.md)（3 周）
- 📋 [Sprint 8: 消息操作 - 菜单](../specs/react-phase3-main-chat/phase3-sprint8-message-actions.md)（2 周）
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
| 构建工具 | `bun run build` + 手动验证 `/lib.js` 加载 |
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

1. **ADR-XXXX: 从 jQuery 迁移到 React 生态**
   - 决策：选择 React + TanStack Start 作为前端框架
   - 理由：现代化、性能、开发体验、生态成熟度
   - 权衡：学习曲线、迁移成本、扩展兼容性

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
  ├─ 月 10: 角色库面板 React 重写（含虚拟滚动）
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
- `term.shared_browser_library`

稳定性敏感绑定点：
- `app/routes/*` (新 React 路由)
- `app/components/*` (新 React 组件)
- `app/stores/*` (新 Zustand stores)
- `app/server/routes/*` (新 Hono API)
- `app/compat/globalBridge.ts` (兼容层)
- `public/script.js` (逐步淘汰)
- `src/endpoints/*` (逐步迁移到 Hono)
- `globalThis.SillyTavern` (兼容层保持)
- `eventSource` / `event_types` (兼容层保持)
- `@sillytavern/*` (兼容层保持)

## 相关文档

- [原现代化路线图](modernization-roadmap.md) - 已于 2026-06-05 冻结
- [主聊天后继者范围](main-chat-successor-scope.md) - 主聊天 UX 北极星
- [前端 jQuery 切片迁移](frontend-jquery-slice-migration.md) - 原 page controller 模式
- [第三方扩展兼容性](third-party-extension-compatibility.md) - 兼容性保护表面
- [React 推荐技术栈](C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\.docs\tech\recommended-stacks\react.md) - 技术选型来源

## 下一步行动

1. **创建 ADR-XXXX**：从 jQuery 迁移到 React 生态
2. **搭建 PoC**：用 2 周时间搭建 TanStack Start + Vite 基础，验证可行性
3. **团队培训**：React 19、TanStack 生态、TypeScript 最佳实践
4. **预算评估**：12-18 个月时间投入和人力成本
5. **社区沟通**：向用户和扩展开发者预告迁移计划
