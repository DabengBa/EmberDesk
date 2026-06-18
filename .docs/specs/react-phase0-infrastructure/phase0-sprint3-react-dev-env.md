# Phase 0 Sprint 3: React 开发环境

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-0-基础设施准备3-个月)
- **Phase**：[Phase 0 - 基础设施准备](README.md)
- **Sprint**：Phase 0 Sprint 3（全局 Sprint 3/40）
- **预计工期**：2 周
- **风险等级**：中

---

## 目标

搭建 React 19 + TanStack Router 开发环境，建立双服务器架构（React dev server + Express API）。

### 主要交付物

1. 安装 React 19 + TanStack Router 依赖
2. 创建 `app/` 目录结构（React 应用根目录）
3. 配置 Vite dev server（端口 3001）
4. 配置反向代理：React → Express API
5. 创建欢迎页验证环境搭建成功

### 成功标准

- ✅ `bun run dev` 启动 React dev server 成功
- ✅ 访问 `http://localhost:3001` 看到 React 欢迎页
- ✅ `/api/*` 请求正确代理到 Express（端口 3000）
- ✅ HMR 工作正常（< 200ms 响应）
- ✅ TypeScript + React 类型检查通过

---

## 背景

### 当前状态

- Express 服务器运行在端口 3000
- 静态文件从 `public/` 目录提供
- 无独立前端开发服务器

### 目标状态

**双服务器架构**：

```
开发环境：
┌─────────────────────────────────────────┐
│ localhost:3001 (Vite Dev Server)        │
│ ├─ React 应用 (app/)                     │
│ ├─ HMR 支持                             │
│ └─ 代理 /api/* → localhost:3000         │
└─────────────────────────────────────────┘
         ▼ API 请求
┌─────────────────────────────────────────┐
│ localhost:3000 (Express)                │
│ ├─ 现有 API (src/endpoints/)            │
│ └─ 静态文件 (public/)                    │
└─────────────────────────────────────────┘

生产环境：
┌─────────────────────────────────────────┐
│ Nginx 反向代理                           │
│ ├─ / → React (app/dist/)                │
│ ├─ /api/* → Express (src/)              │
│ └─ jQuery app remains on localhost:3000 │
└─────────────────────────────────────────┘
```

---

## 技术设计

### 目录结构

```
D:\DEV\EmberDesk\
├─ app/                          # React 应用根目录
│  ├─ routes/                    # TanStack Router 文件系统路由
│  │  ├─ __root.tsx              # 根路由
│  │  └─ index.tsx               # 首页（欢迎页）
│  ├─ styles/                    # 样式文件
│  │  ├─ globals.css             # 全局样式（Tailwind 基础）
│  │  └─ tokens.css              # 设计令牌
│  ├─ client.tsx                 # React 客户端入口
│  ├─ routeTree.gen.ts           # 自动生成路由树
│  └─ router.tsx                 # TanStack Router 配置
├─ vite.config.ts                # Vite 配置（已有，需更新）
├─ src/                          # Express 后端（保持不变）
└─ public/                       # jQuery 前端（保持不变）
```

### 关键文件设计

#### 1. `app/client.tsx` - React 客户端入口

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { createRouter } from './router';

const router = createRouter();

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
```

#### 2. `app/routes/__root.tsx` - TanStack Router 根路由

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';
import '../styles/globals.css';

export const Route = createRootRoute({
  component: () => <Outlet />,
});
```

#### 3. `app/routes/index.tsx` - 欢迎页

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          欢迎使用 EmberDesk React
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          现代化重构环境搭建成功 🎉
        </p>
        <div className="space-x-4">
          <a
            href="http://localhost:3000/"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            访问 jQuery 版本
          </a>
          <button
            onClick={() => testApiConnection()}
            className="px-6 py-3 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300"
          >
            测试 API 连接
          </button>
        </div>
      </div>
    </div>
  );
}

async function testApiConnection() {
  try {
    const res = await fetch('/api/ping');
    const data = await res.json();
    alert(`API 连接成功: ${JSON.stringify(data)}`);
  } catch (error) {
    alert(`API 连接失败: ${error.message}`);
  }
}
```

#### 4. `app/router.tsx` - TanStack Router 配置

```tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
```

#### 5. 更新 `vite.config.ts` - 添加 React 和代理配置

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';
import path from 'node:path';

export default defineConfig({
  publicDir: false, // React 构建不复制根 public/ 旧前端资源

  plugins: [
    react(),
    TanStackRouterVite(), // 自动生成路由类型
  ],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'app'),
      '@sillytavern': path.resolve(__dirname, 'public/scripts'),
    },
  },
  
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/lib.js': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  
  build: {
    // React 应用构建配置
    outDir: 'app/dist',
    emptyOutDir: true,
  },
});
```

---

## 实施步骤

### 步骤 1：安装依赖

```bash
# React 19 核心
bun add react@19.2.7 react-dom@19.2.7

# TanStack 生态
bun add @tanstack/react-router@1.170.11

# Vite 插件
bun add -D @vitejs/plugin-react
bun add -D @tanstack/router-vite-plugin

# 类型定义
bun add -D @types/react@19.x
bun add -D @types/react-dom@19.x
```

### 步骤 2：创建目录结构

```bash
mkdir -p app/{routes,styles}
```

### 步骤 3：创建文件

按照上述"关键文件设计"创建所有文件。

### 步骤 4：更新 `tsconfig.json`

添加 React 相关配置：

```json
{
  "compilerOptions": {
    // ... 现有配置
    "jsx": "react-jsx",              // React 19 新 JSX 转换
    "jsxImportSource": "react",
  },
  "include": [
    "src/**/*",
    "public/**/*",
    "app/**/*",     // 新增
    "*.js",
    "*.ts"
  ]
}
```

### 步骤 5：创建测试 API 端点

在 Express 中添加公共 `GET /api/ping` 用于测试代理。项目已有登录墙后的私有 `POST /api/ping` 会话续期端点，二者不能合并或互相替代：

```javascript
// src/endpoints/health.js
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version: packageVersion } = require('../../package.json');

export function setupHealthEndpoint(app) {
  app.get('/api/ping', (_request, response) => {
    response.json({
      status: 'ok',
      message: 'EmberDesk API is running',
      timestamp: new Date().toISOString(),
      version: packageVersion,
    });
  });
}
```

通过 `src/server-startup.js` 暴露公共端点注册函数：

```javascript
import { setupHealthEndpoint } from './endpoints/health.js';

export function setupPublicEndpoints(app) {
  setupHealthEndpoint(app);
}
```

在 `src/server-main.js` 中注册到 `requireLoginMiddleware` 前：

```javascript
import { setupPublicEndpoints } from './server-startup.js';

app.use('/api/users', usersPublicRouter);
setupPublicEndpoints(app);
app.use(requireLoginMiddleware);
```

### 步骤 6：更新 `package.json` scripts

```json
{
  "scripts": {
    "dev": "vite",                      // React dev server
    "dev:express": "node server.js",    // Express server
    "dev:all": "concurrently \"bun run dev:express\" \"bun run dev\"",
    "build:react": "vite build",
    "preview": "vite preview"
  }
}
```

安装 `concurrently`：

```bash
bun add -D concurrently
```

### 步骤 7：启动双服务器

```bash
# 终端 1: Express
bun run dev:express

# 终端 2: React
bun run dev

# 或使用 concurrently 一次启动
bun run dev:all
```

### 步骤 8：验证环境

1. 访问 `http://localhost:3001` - 应看到 React 欢迎页
2. 点击"测试 API 连接" - 应收到成功响应
3. 点击“访问 jQuery 版本” - 应打开 `http://localhost:3000/` 的 Express jQuery 版本
4. 修改 `app/routes/index.tsx` 文件 - HMR 应自动刷新页面

### 步骤 9：文档更新

更新 `AGENTS.md`：

```markdown
## 开发服务器

```powershell
# React 开发服务器（推荐）
bun run dev                 # 端口 3001

# Express 服务器（现有）
bun run dev:express         # 端口 3000

# 同时启动两个服务器
bun run dev:all
```
```

---

## 验证清单

### 功能验证

- [ ] `bun run dev` 启动成功，无错误
- [ ] `http://localhost:3001` 显示 React 欢迎页
- [ ] React 欢迎页样式正常（Tailwind CSS 生效）
- [ ] 点击"测试 API 连接"返回成功响应
- [ ] 欢迎页链接正确打开 `http://localhost:3000/` 的 jQuery 版本

### HMR 验证

- [ ] 修改 `app/routes/index.tsx` 触发 HMR
- [ ] HMR 响应时间 < 200ms
- [ ] 页面自动刷新，无需手动刷新

### 类型检查验证

- [ ] `bun run typecheck` 通过
- [ ] VSCode 无 TypeScript 错误提示
- [ ] React 组件类型提示正常

### 代理验证

- [ ] `/api/ping` 请求代理到 Express
- [ ] `/lib.js` 请求代理到 Express
- [ ] 代理请求带正确的 `Origin` 头

---

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|---|---|---|---|
| Vite 代理配置错误导致 API 请求失败 | 高 | 中 | 详细测试代理配置，检查 CORS 设置 |
| 端口冲突（3001 已被占用） | 中 | 低 | 使用环境变量配置端口，文档说明 |
| TanStack Router 学习曲线陡峭 | 中 | 中 | 提供示例代码和文档链接 |
| HMR 失效或响应慢 | 低 | 低 | 检查 Vite 配置，减少不必要的插件 |

---

## 依赖

### 前置条件

- ✅ Phase 0 Sprint 1（Vite 迁移）已完成
- ✅ Phase 0 Sprint 2（TypeScript 配置）已完成

### 后续依赖

本 Sprint 阻塞：
- Phase 0 Sprint 4（Tailwind CSS 需 React 环境）
- Phase 1 所有 Sprint（需 React 开发环境）

---

## 参考资料

### 内部文档

- [React 现代化路线图](../../tech/react-modernization-roadmap.md)

### 外部文档

- [TanStack Router 文件系统路由](https://tanstack.com/router/latest/docs/framework/react/guide/file-based-routing)
- [Vite 服务器代理](https://vite.dev/config/server-options.html#server-proxy)
- [React 19 文档](https://react.dev/)

---

## 交付标准（Definition of Done）

- [ ] React 开发环境搭建完成
- [ ] 欢迎页创建并显示正常
- [ ] API 代理配置并验证通过
- [ ] HMR 工作正常
- [ ] `bun run typecheck` 通过
- [ ] 文档更新完成
- [ ] Code review 完成
- [ ] 合并到 `csp-dev-techupgrade` 分支

---

## 下一步

👉 [Phase 0 Sprint 4: Tailwind CSS 集成](phase0-sprint4-tailwind-integration.md)
