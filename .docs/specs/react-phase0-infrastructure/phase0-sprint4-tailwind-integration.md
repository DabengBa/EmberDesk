# Phase 0 Sprint 4: Tailwind CSS 集成

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-0-基础设施准备3-个月)
- **Phase**：[Phase 0 - 基础设施准备](README.md)
- **Sprint**：Phase 0 Sprint 4（全局 Sprint 4/40）
- **预计工期**：2 周
- **风险等级**：低

---

## 目标

集成 Tailwind CSS v4 作为 React 应用的样式系统，与现有 `public/style.css` 共存。

### 主要交付物

1. 安装 Tailwind CSS v4 依赖
2. 配置 PostCSS 和 Tailwind
3. 创建 `app/styles/globals.css` 导入 Tailwind 基础类
4. 验证 Tailwind 类在 React 组件中生效
5. 确保现有 jQuery 页面样式不受影响

### 成功标准

- ✅ Tailwind CSS 在 React 组件中正常工作
- ✅ VSCode Tailwind IntelliSense 自动补全可用
- ✅ 现有 `public/style.css` 样式不受影响
- ✅ 生产构建生成优化的 CSS（purge 未使用的类）
- ✅ 支持自定义主题颜色和设计令牌

---

## 背景

### 当前状态

**现有样式系统**：
- `public/style.css` - 手写 CSS（约 10,000+ 行）
- jQuery UI 主题
- 各种第三方库的样式

**问题**：
- CSS 冗长，维护困难
- 响应式设计不统一
- 缺乏设计系统和令牌

### 目标状态

**Tailwind CSS v4 + 现有 CSS 共存**：
- React 组件使用 Tailwind 实用类
- jQuery 页面继续使用 `public/style.css`
- 共享设计令牌（颜色、间距、字体）

---

## 技术设计

### Tailwind CSS v4 新特性

相比 v3，v4 引入：
- **更快的编译速度**（基于 Oxide 引擎）
- **零配置**（默认配置更合理）
- **CSS 原生变量**（更好的主题支持）
- **更小的输出体积**

### 配置策略

#### 1. 样式隔离

**React 应用**：
- 使用 Tailwind CSS（`app/styles/globals.css`）
- 通过 Vite 注入到 React 页面

**jQuery 应用**：
- 保持现有 `public/style.css`
- 不受 Tailwind 影响

#### 2. 设计令牌共享

Tailwind v4 会从 CSS `@theme` 变量生成 utility class；普通 `:root` 变量只作为运行时设计令牌，不会自动生成 `bg-*` / `text-*` 工具类。

```css
/* app/styles/tokens.css */
@theme {
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --font-sans: 'Inter', system-ui, sans-serif;
}

:root {
  /* 主题颜色（与现有 EmberDesk 主题对齐） */
  --color-primary: #3b82f6;      /* 蓝色 */
  --color-secondary: #6366f1;    /* 靛蓝 */
  --color-success: #10b981;      /* 绿色 */
  --color-warning: #f59e0b;      /* 橙色 */
  --color-danger: #ef4444;       /* 红色 */
  
  /* 灰度 */
  --color-gray-50: #f9fafb;
  --color-gray-900: #111827;
  
  /* 间距（与现有设计对齐） */
  --spacing-unit: 0.25rem;       /* 4px */
}
```

#### 3. Tailwind 配置

```javascript
// tailwind.config.js
export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',  // 仅扫描 React 应用
  ],
  plugins: [],
};
```

---

## 实施步骤

### 步骤 1：安装 Tailwind CSS v4

```bash
bun add -D tailwindcss@4.3.0 @tailwindcss/postcss@4.3.0 postcss
```

### 步骤 2：配置 PostCSS

```javascript
// postcss.config.js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

不要使用 Tailwind v3 的 `tailwindcss` PostCSS 插件名，也不需要 `autoprefixer`。

### 步骤 3：配置 `tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
  ],
  plugins: [],
};
```

### 步骤 4：创建全局样式文件

创建 `app/styles/globals.css`：

```css
/* Tailwind v4 single entrypoint. */
@import 'tailwindcss';

/* 设计令牌 */
@import './tokens.css';

/* 自定义全局样式 */
body {
  @apply antialiased;
  font-family: 'Inter', system-ui, sans-serif;
}

/* 自定义组件类（可选） */
@layer components {
  .btn-primary {
    @apply px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition;
  }
  
  .card {
    @apply bg-white rounded-lg shadow-md p-6;
  }
}
```

创建 `app/styles/tokens.css`：

```css
@theme {
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;
  --color-primary-900: #1e3a8a;
  --font-sans: 'Inter', system-ui, sans-serif;
}

:root {
  /* 主题颜色 */
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
  --color-secondary: #6366f1;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  
  /* 灰度 */
  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-300: #d1d5db;
  --color-gray-400: #9ca3af;
  --color-gray-500: #6b7280;
  --color-gray-600: #4b5563;
  --color-gray-700: #374151;
  --color-gray-800: #1f2937;
  --color-gray-900: #111827;
  
  /* 间距 */
  --spacing-xs: 0.25rem;   /* 4px */
  --spacing-sm: 0.5rem;    /* 8px */
  --spacing-md: 1rem;      /* 16px */
  --spacing-lg: 1.5rem;    /* 24px */
  --spacing-xl: 2rem;      /* 32px */
  
  /* 圆角 */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 1rem;
  
  /* 阴影 */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

/* 暗色主题（可选） */
@media (prefers-color-scheme: dark) {
  :root {
    --color-gray-50: #111827;
    --color-gray-900: #f9fafb;
  }
}
```

### 步骤 5：在 TanStack Router 根路由中导入样式

修改 `app/routes/__root.tsx`：

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';
import '../styles/globals.css';  // 导入 Tailwind

export const Route = createRootRoute({
  component: () => <Outlet />,
});
```

### 步骤 6：更新欢迎页使用 Tailwind

修改 `app/routes/index.tsx`，验证 Tailwind 类生效：

```tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="card max-w-2xl w-full">
        <h1 className="text-4xl font-bold text-gray-900 mb-4 text-center">
          欢迎使用 EmberDesk React 🎉
        </h1>
        <p className="text-lg text-gray-600 mb-8 text-center">
          Tailwind CSS v4 已成功集成
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">✨ 实用优先</h3>
            <p className="text-sm text-blue-700">快速构建自定义设计</p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <h3 className="font-semibold text-green-900 mb-2">⚡ 性能优化</h3>
            <p className="text-sm text-green-700">生产构建自动 purge</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <h3 className="font-semibold text-purple-900 mb-2">🎨 设计令牌</h3>
            <p className="text-sm text-purple-700">统一的主题系统</p>
          </div>
          <div className="p-4 bg-orange-50 rounded-lg">
            <h3 className="font-semibold text-orange-900 mb-2">📱 响应式</h3>
            <p className="text-sm text-orange-700">移动优先设计</p>
          </div>
        </div>
        
        <div className="flex gap-4 justify-center">
          <a
            href="http://localhost:3000/"
            className="btn-primary"
          >
            访问 jQuery 版本
          </a>
          <button
            onClick={() => alert('Tailwind CSS 正常工作！')}
            className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition"
          >
            测试样式
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 步骤 7：配置 VSCode IntelliSense

安装 VSCode 插件：

```bash
code --install-extension bradlc.vscode-tailwindcss
```

更新 `.vscode/settings.json`：

```json
{
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cx\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ],
  "editor.quickSuggestions": {
    "strings": true
  }
}
```

### 步骤 8：验证样式隔离

确保 jQuery 页面不受影响：

1. 启动 Express：`bun run dev:express`
2. 访问 `http://localhost:3000` - jQuery 版本应正常显示
3. 启动 React：`bun run dev`
4. 访问 `http://localhost:3001` - React 版本应使用 Tailwind 样式
5. 两者样式互不干扰

### 步骤 9：生产构建验证

```bash
bun run build:react
```

检查构建输出：
- CSS 文件大小应合理（< 50KB，purge 后）
- 未使用的 Tailwind 类应被移除

### 步骤 10：文档更新

更新 `AGENTS.md`：

```markdown
## 样式系统

- **React 应用**：Tailwind CSS v4（`app/styles/globals.css`）
- **jQuery 应用**：手写 CSS（`public/style.css`）
- **设计令牌**：CSS 变量共享（`app/styles/tokens.css`）
```

---

## 验证清单

### 功能验证

- [ ] Tailwind 类在 React 组件中生效
- [ ] 自定义主题颜色可用（`bg-primary-500` 等）
- [ ] 响应式类正常工作（`md:grid-cols-2` 等）
- [ ] 自定义组件类生效（`.btn-primary`, `.card`）
- [ ] CSS 变量在浏览器 DevTools 中可见

### IDE 验证

- [ ] VSCode 自动补全 Tailwind 类
- [ ] 悬停显示 Tailwind 类的 CSS 定义
- [ ] 错误提示未知的 Tailwind 类

### 样式隔离验证

- [ ] React 页面使用 Tailwind 样式
- [ ] jQuery 页面使用原有样式
- [ ] 两者互不冲突

### 生产构建验证

- [ ] `bun run build:react` 成功
- [ ] 输出 CSS 文件大小 < 50KB（gzip 后 < 10KB）
- [ ] 未使用的类已被 purge

---

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|---|---|---|---|
| Tailwind 重置样式影响 jQuery 页面 | 高 | 低 | 样式隔离，仅在 React 页面加载 Tailwind |
| CSS 文件过大 | 中 | 低 | 启用 purge，仅保留使用的类 |
| 自定义主题配置错误 | 低 | 中 | 充分测试主题颜色，提供回退值 |
| VSCode IntelliSense 不工作 | 低 | 低 | 安装官方插件，配置 `settings.json` |

---

## 依赖

### 前置条件

- ✅ Phase 0 Sprint 3（React 开发环境）已完成

### 后续依赖

本 Sprint 完成后，Phase 1 所有 Sprint 可使用 Tailwind CSS 构建 UI。

---

## 参考资料

### 内部文档

- [React 现代化路线图](../../tech/react-modernization-roadmap.md)

### 外部文档

- [Tailwind CSS v4 文档](https://tailwindcss.com/docs)
- [Tailwind CSS v4 发布公告](https://tailwindcss.com/blog/tailwindcss-v4)
- [Tailwind IntelliSense 插件](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
- [PostCSS 配置](https://postcss.org/)

---

## 交付标准（Definition of Done）

- [ ] Tailwind CSS v4 安装完成
- [ ] 配置文件创建并验证
- [ ] 欢迎页更新使用 Tailwind 类
- [ ] VSCode IntelliSense 工作正常
- [ ] 样式隔离验证通过
- [ ] 生产构建验证通过
- [ ] 文档更新完成
- [ ] Code review 完成
- [ ] 合并到 `csp-dev-techupgrade` 分支

---

## Phase 0 总结

Phase 0 的 4 个 Sprint 全部完成后，基础设施准备就绪：

✅ Sprint 1: Vite 构建替换 Webpack  
✅ Sprint 2: TypeScript 配置  
✅ Sprint 3: React 开发环境  
✅ Sprint 4: Tailwind CSS 集成  

**下一步进入 Phase 1: 独立页面迁移**

---

## 下一步

👉 [Phase 1: 独立页面迁移](../react-phase1-independent-pages/README.md)
