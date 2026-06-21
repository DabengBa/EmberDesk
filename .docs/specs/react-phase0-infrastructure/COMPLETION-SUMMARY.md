# Phase 0 基础设施搭建状态

## 当前状态

Phase 0 基础设施已经从可验证检查点推进为已交付基础设施。React 迁移边界已由 [ADR-0007](../../adr/0007-react-page-islands-with-legacy-fallbacks.md) 接受，Phase 1/Phase 2 早期 slices 已基于这些基础设施继续交付；当前状态以 [React 现代化路线图](../../tech/react-modernization-roadmap.md) 为准。

## 已完成的代码面

### ✅ Sprint 1: Vite 迁移
- Vite 8 配置完成 (`vite.config.ts`)
- 支持 React 开发模式和 lib.js 构建模式
- `/lib.js` ES module 输出保持兼容
- 构建脚本: `vite build --mode lib`

### ✅ Sprint 2: TypeScript 配置
- TypeScript 6 配置完成 (`tsconfig.json`)
- 渐进式类型系统 (`allowJs: true`, `checkJs: false`, `strict: true`)
- React app、route、helper 和 panel entry 已进入 `app/`，`src/**/*` 仍可按渐进式 TypeScript 边界迁移
- 类型检查通过: `bun run typecheck`

### ✅ Sprint 3: React 开发环境
- React 19 + TanStack Router 安装完成
- 双服务器架构配置:
  - React dev server: `bun run dev` (端口 3001)
  - Express API: `bun run dev:express` (端口 3000)
- API 代理配置: `/api/*` → Express
- Public health check endpoint: `GET /api/ping`（既有私有 `POST /api/ping` 会话续期保持在登录墙后）
- React 构建禁用 Vite `publicDir` 复制，避免把根 `public/` 旧前端资源写入 `app/dist`
- 欢迎页创建: `app/routes/index.tsx`

### ✅ Sprint 4: Tailwind CSS 集成
- Tailwind CSS v4 配置完成 (`tailwind.config.js`)
- PostCSS 配置使用 `@tailwindcss/postcss`: `postcss.config.js`
- 设计令牌系统使用 Tailwind v4 `@theme`: `app/styles/tokens.css`
- 全局样式使用 Tailwind v4 单入口 `@import "tailwindcss"`: `app/styles/globals.css`
- 自定义组件类: `.btn-primary`, `.card`

## 验证结果

### 已通过
- ✅ `bun run typecheck` 通过（无类型错误）
- ✅ `bun run lint` 通过（覆盖 JS、`src/**/*.ts`、`app/**/*.{ts,tsx}`；生成文件和 `.d.ts` 由类型检查覆盖）
- ✅ `bun run build:react` 通过
- ✅ `bun run build:lib` 通过
- ✅ `bun run test:compat` 通过（扩展兼容性保持）
- ✅ `bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand` 通过（health endpoint 位于登录墙前，私有路由仍受保护）

### 当前后续
- Phase 0 无当前阻塞项。
- 后续 React 页面和面板继续按 feature flag、legacy fallback、TanStack Form/Zod/Query 收口规则推进。

### 文件结构
```
D:\DEV\EmberDesk\
├─ app/                          # React 应用根目录
│  ├─ routes/                    # TanStack Router 路由
│  │  ├─ __root.tsx              # 根路由
│  │  └─ index.tsx               # 首页
│  ├─ styles/                    # 样式文件
│  │  ├─ globals.css             # Tailwind 基础样式
│  │  └─ tokens.css              # 设计令牌
│  ├─ client.tsx                 # React 客户端入口
│  ├─ router.tsx                 # TanStack Router 配置
│  ├─ globals.d.ts               # 类型定义
│  └─ routeTree.gen.ts           # 自动生成的路由树（lint 忽略）
├─ src/
│  ├─ endpoints/
│  │  └─ health.js               # Health check endpoint
│  └─ server-main.js             # 在登录墙前注册 public health endpoint
├─ index.html                    # Vite 入口 HTML
├─ vite.config.ts                # Vite 配置
├─ tsconfig.json                 # TypeScript 配置
├─ tailwind.config.js            # Tailwind 配置
├─ postcss.config.js             # PostCSS 配置
└─ package.json                  # 更新的依赖和脚本
```

### 关键依赖版本
- TypeScript: 6.0.3
- React: 19.2.7
- Vite: 8.0.16
- TanStack Router: 1.170.11
- Tailwind CSS: 4.3.0

## 下一步

1. 继续按 [React 现代化路线图](../../tech/react-modernization-roadmap.md) 推进 Phase 2 Sprint 4-7。
2. 每个后续 React slice 都必须保留 feature flag、legacy fallback 和兼容性验证门。
