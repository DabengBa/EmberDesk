# Phase 0: 基础设施准备

**预计工期**：3 个月（2026 Q2: 月 4-6）  
**目标**：搭建 React 基础设施，不改变现有功能  
**风险等级**：中  
**状态**：基础设施检查点，React 迁移 ADR 待批准

---

## 概览

Phase 0 为整个 React 现代化重构奠定技术基础。本阶段不触及业务逻辑，仅完成构建工具、类型系统、开发环境和样式框架的替换和配置。

所有变更对普通用户透明，现有 jQuery 应用继续运行。React dev server、`GET /api/ping` health check、Tailwind 构建链仅用于 Phase 0 基础设施验证。

---

## 目标

### 主要目标

1. **Vite 构建替换 Webpack**：HMR 开发体验，保持 `/lib.js` 输出兼容
2. **TypeScript 基础配置**：渐进式类型系统，`allowJs: true` 增量迁移
3. **React 开发环境搭建**：React 19 + TanStack Router + 双服务器架构
4. **Tailwind CSS 集成**：实用优先样式系统，与现有 CSS 共存

### 非目标

- ❌ 迁移任何业务页面或组件
- ❌ 修改现有业务 API 端点（允许新增公开 `GET /api/ping` health check）
- ❌ 改变用户可见行为
- ❌ 触及扩展兼容性表面

---

## Sprint 列表

| Sprint | 工期 | 目标 | 风险 |
|---|---|---|---|
| [Phase 0 Sprint 1: Vite 迁移](phase0-sprint1-vite-migration.md) | 2 周 | 替换 Webpack，保持 `/lib.js` 兼容 | 低 |
| [Phase 0 Sprint 2: TypeScript 配置](phase0-sprint2-typescript-config.md) | 2 周 | 配置 `tsconfig.json`，后端新代码用 `.ts` | 低 |
| [Phase 0 Sprint 3: React 开发环境](phase0-sprint3-react-dev-env.md) | 2 周 | 搭建 React 19 + TanStack Router，双服务器架构 | 中 |
| [Phase 0 Sprint 4: Tailwind CSS 集成](phase0-sprint4-tailwind-integration.md) | 2 周 | 配置 Tailwind v4，与现有 CSS 共存 | 低 |

---

## 架构决策

### 构建工具：Vite 8

**理由**：
- HMR < 200ms（Webpack 需数秒）
- ESM 原生支持（项目已是 `"type": "module"`）
- 配置简单（当前 `webpack.config.js` 仅用于 `/lib.js`）

**权衡**：
- 需验证 CommonJS shim 兼容性（扩展依赖）
- 插件生态不如 Webpack 成熟（但核心需求已满足）

### 类型系统：TypeScript 6

**理由**：
- 渐进式迁移（`allowJs: true`）
- 前后端类型共享（API 契约类型安全）
- IDE 支持完善

**权衡**：
- 初期类型覆盖率低（需长期投入）
- 严格模式开启需分阶段（避免大量报错）

### 框架：React 19 + TanStack Router

**理由**：
- 当前 Phase 0 只需要 SPA 开发入口，不引入 SSR/Server Functions 运行面
- TanStack Router 提供类型安全文件路由和 Vite 路由树生成
- 保持 React 入口与现有 Express API 解耦，降低登录墙和静态资源顺序风险

**权衡**：
- 后续如需 SSR/全栈能力，必须另起 ADR 评估 TanStack Start 或其他框架
- 文件路由和生成文件需要 lint/typecheck 边界配置

### 样式：Tailwind CSS v4

**理由**：
- 实用优先（开发速度快）
- 类型安全（`tailwindcss-intellisense`）
- 与 React 组件契合

**权衡**：
- HTML 类名冗长（需习惯）
- 定制化需学习配置

---

## 验证门

### Phase 0 完成标准

- [x] ✅ Vite 构建成功，`/lib.js` 输出兼容
- [x] ✅ TypeScript 配置完成，后端新文件可用 `.ts`
- [x] ✅ React 生产构建成功（`bun run build:react`）
- [x] ✅ Tailwind CSS 在 React 组件中生效
- [x] ✅ 兼容性 gate 通过（`bun run test:compat`）
- [ ] ⏳ 所有现有测试通过（`bun run test:unit`，需无本地 3000 端口占用）
- [x] ✅ 类型检查通过（`bun run typecheck`）
- [x] ✅ Lint 检查通过（`bun run lint`，覆盖新增 TS/TSX 实现文件）
- [ ] ⏳ React 迁移 ADR 批准

### 关键指标

- React 构建时间：< 30s（生产构建）
- HMR 响应：< 200ms（开发模式）
- 类型错误：0（新增 `.ts` 文件）
- 测试覆盖率：保持现有基准（68%+）

---

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|---|---|---|---|
| Vite `/lib.js` 输出不兼容扩展 | 高 | 中 | 充分测试 CommonJS shim，保留 Webpack 作为回退 |
| TypeScript 配置错误导致现有代码报错 | 中 | 低 | `allowJs: true`，`checkJs: false`，增量启用 |
| React dev server 无法代理到 Express | 中 | 低 | 使用成熟的 Vite proxy 配置，参考官方文档 |
| Tailwind CSS 与现有样式冲突 | 低 | 中 | React 样式只从 `app/client.tsx` 入口加载，现有 jQuery 页面不加载 Tailwind |

---

## 依赖

### 前置条件

- ✅ 原现代化路线图已冻结（`.docs/tech/modernization-roadmap.md`）
- ✅ Node.js 26.3.0 已安装
- ✅ Bun 1.3.14 已安装
- ⏳ ADR-XXXX（jQuery → React）待批准

### 阻塞项

- React 迁移 ADR 未批准前，不进入 Phase 1。
- 完整 `bun run test:unit` 未在无端口占用环境重新通过前，不关闭 Phase 0。

---

## 交付物

### 代码变更

```
新增：
├─ vite.config.ts                    # Vite 配置
├─ tsconfig.json                     # TypeScript 配置（替换 jsconfig.json）
├─ app/                              # React 应用根目录
│  ├─ routes/                        # TanStack Router 路由
│  ├─ styles/
│  │  ├─ globals.css                 # Tailwind 基础样式
│  │  └─ tokens.css                  # 设计令牌
│  ├─ client.tsx                     # React 客户端入口
│  ├─ router.tsx                     # TanStack Router 配置
│  └─ routeTree.gen.ts               # 自动生成路由树
└─ .docs/specs/react-phase0-infrastructure/ # Phase 0 所有 Sprint specs

保留：
├─ webpack.config.js                 # 保留作为回退，标记为 deprecated
├─ public/                           # 现有 jQuery 前端（不变）
└─ src/                              # 现有 Express 后端（不变）
```

### 文档更新

- ✅ `.docs/tech/briefs/react-modernization-intent.md` - 意图文档
- ✅ `.docs/tech/react-modernization-roadmap.md` - 主路线图
- ✅ `.docs/specs/react-phase0-infrastructure/README.md` - 本文档
- 🚧 `.docs/specs/react-phase0-infrastructure/phase0-sprint{1-4}-*.md` - Sprint specs

---

## 参考资料

- [React 现代化路线图](../../tech/react-modernization-roadmap.md)
- [React 现代化意图](../../tech/briefs/react-modernization-intent.md)
- [Vite 文档](https://vite.dev/)
- [TypeScript 文档](https://www.typescriptlang.org/docs/)
- [TanStack Router 文档](https://tanstack.com/router/latest)
- [Tailwind CSS v4 文档](https://tailwindcss.com/docs)

---

## 下一步

完成 ADR 批准和完整验证后，进入：

👉 [Phase 1: 独立页面迁移](../react-phase1-independent-pages/README.md)
