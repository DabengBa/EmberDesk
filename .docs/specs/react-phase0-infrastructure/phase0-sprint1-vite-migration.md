# Phase 0 Sprint 1: Vite 迁移

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-0-基础设施准备3-个月)
- **Phase**：[Phase 0 - 基础设施准备](README.md)
- **Sprint**：Phase 0 Sprint 1（全局 Sprint 1/40）
- **预计工期**：2 周
- **风险等级**：低

---

## 目标

将现有 Webpack 构建系统替换为 Vite 8，保持 `public/lib.js` 输出格式（ES module）和扩展兼容性不变。

### 主要交付物

1. 创建 `vite.config.ts` 配置文件
2. 配置 Vite library mode 生成 `/lib.js` ES module bundle
3. 验证 named exports 和 default export 兼容性
4. 更新 `package.json` 构建脚本
5. 保留 `webpack.config.js` 作为回退方案

### 成功标准

- ✅ `bun run build:lib` 使用 Vite 成功构建
- ✅ `/lib.js` 输出为 ES module 格式（与 Webpack 一致）
- ✅ 前端共享库测试通过（`frontend-shared-library-boundary.test.js`）
- ✅ 现有第三方扩展可正常加载（手动验证 3-5 个常用扩展）
- ✅ 开发模式 HMR < 200ms

---

## 背景

### 当前状态

**Webpack 配置**（`webpack.config.js`）：
- 仅用于构建 `public/lib.js` 共享库
- 输出 **ES module** 格式（`libraryTarget: 'module'`，不是 UMD）
- 输出到 `DATA_ROOT/_webpack/<cacheVersion>/output/lib.js`
- 运行时由 `src/middleware/webpack-serve.js` 中间件提供 `/lib.js` 路径
- 包含 `slideToggle`、`DOMPurify` 等第三方库
- 构建时间：约 15-20 秒（生产模式）
- 无 HMR 支持（开发时需手动刷新）

**问题**：
- 构建慢，开发体验差
- 配置复杂（约 125 行，包含缓存管理）
- 输出路径复杂（缓存版本目录）

### 目标状态

**Vite 配置**（`vite.config.ts`）：
- Library mode 输出 `/lib.js`，保持 ES module 格式
- 开发模式支持 HMR
- 构建时间 < 10 秒
- 配置简洁（< 50 行）
- 简化输出路径（直接输出到静态目录）

---

## 技术设计

### Vite 配置结构

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'public/lib.js'),
      formats: ['es'],  // ES module，与 Webpack 输出一致
      fileName: () => 'lib.js',
    },
    outDir: 'dist/lib',
    emptyOutDir: true,
    rollupOptions: {
      external: [], // 所有依赖打包进 lib.js
    },
  },
  resolve: {
    alias: {
      '@sillytavern': path.resolve(__dirname, 'public/scripts'),
    },
  },
});
```

### 关键决策

#### 1. 输出格式：ES module

**理由**：与 Webpack 现有配置一致（`libraryTarget: 'module'`）。

**验证**：现有 `frontend-shared-library-boundary.test.js` 已覆盖 named exports 和 default export。

#### 2. 构建目录：`dist/lib/`

**理由**：简化输出路径，避免 Webpack 的缓存版本目录复杂性。

**中间件调整**：需更新 `src/middleware/webpack-serve.js` 或创建新的 Vite serve 中间件。

#### 3. 外部依赖：全部打包

**理由**：`lib.js` 是自包含的共享库，不依赖外部 CDN。

**权衡**：文件大小稍大（约 200-300KB），但简化加载逻辑。

---

## 实施步骤

### 步骤 1：安装 Vite

```bash
bun add -D vite @vitejs/plugin-react
```

### 步骤 2：创建 `vite.config.ts`

复制上述配置结构，验证入口文件路径正确。

### 步骤 3：更新 `package.json` scripts

```json
{
  "scripts": {
    "build:lib": "vite build --mode lib",
    "build:lib:webpack": "node scripts/build-webpack-lib.js",
    "dev": "vite",
  }
}
```

保留 `build:lib:webpack` 作为回退方案。

### 步骤 4：验证构建输出

```bash
# 1. 清理旧构建
rm -rf dist/lib

# 2. Vite 构建
bun run build:lib

# 3. 检查文件大小
ls -lh dist/lib/lib.js

# 4. 检查 ES module exports（浏览器环境测试）
# 启动开发服务器，浏览器 console 测试：
# import('/lib.js').then(m => console.log(Object.keys(m)))
```

### 步骤 5：验证 named exports

创建测试文件 `tests/vite-lib-compat.test.js`：

```javascript
import { describe, it, expect } from 'vitest';

describe('Vite lib.js ES module compatibility', () => {
  it('should export slideToggle as named export', async () => {
    const lib = await import('../dist/lib/lib.js');
    expect(lib.slideToggle).toBeDefined();
    expect(typeof lib.slideToggle).toBe('function');
  });

  it('should export DOMPurify as named export', async () => {
    const lib = await import('../dist/lib/lib.js');
    expect(lib.DOMPurify).toBeDefined();
  });

  it('should export default object with all keys', async () => {
    const lib = await import('../dist/lib/lib.js');
    expect(lib.default).toBeDefined();
    expect(lib.default.slideToggle).toBeDefined();
  });
});
```

### 步骤 6：运行兼容性测试

```bash
bun run --cwd tests test:unit -- frontend-shared-library-boundary.test.js --runInBand
```

### 步骤 7：手动验证扩展加载

启动 EmberDesk，测试以下扩展：
1. Tavern Helper
2. JS-Slash-Runner
3. 任意 3 个常用社区扩展

验证点：
- 扩展加载无报错
- 扩展功能正常（斜杠命令、UI 增强等）

### 步骤 8：性能基准测试

```bash
# 构建时间对比
time bun run build:lib:webpack  # 记录 Webpack 时间
time bun run build:lib          # 记录 Vite 时间

# HMR 响应时间（开发模式）
bun run dev
# 修改 public/lib.js 源文件，观察浏览器刷新时间
```

### 步骤 9：创建/更新 Vite serve 中间件

由于输出路径变更，需要创建中间件提供 `/lib.js` 路由：

```javascript
// src/middleware/vite-lib-serve.js
import fs from 'node:fs';
import path from 'node:path';

export function viteLibServe(req, res, next) {
  if (req.path === '/lib.js') {
    const libPath = path.resolve(process.cwd(), 'dist/lib/lib.js');
    if (fs.existsSync(libPath)) {
      res.type('application/javascript');
      return res.sendFile(libPath);
    }
  }
  next();
}
```

### 步骤 10：文档更新

更新 `AGENTS.md` 和 `.docs/tech/frontend-shared-library-boundary.md`：

```markdown
## 构建工具

- 主构建：Vite 8（`bun run build:lib`）
- 回退构建：Webpack（`bun run build:lib:webpack`，已 deprecated）

## 输出路径

- Vite 输出：`dist/lib/lib.js`（ES module）
- Webpack 输出：`DATA_ROOT/_webpack/<cacheVersion>/output/lib.js`（ES module）
- 运行时路径：`/lib.js`（由中间件提供）
```

---

## 验证清单

### 功能验证

- [ ] `bun run build:lib` 成功生成 `dist/lib/lib.js`
- [ ] `lib.js` 文件格式为 ES module
- [ ] `lib.js` 文件大小在合理范围（200-400KB）
- [ ] Named exports 可用（`slideToggle`、`DOMPurify` 等）
- [ ] Default export 可用
- [ ] ESM `import` 加载成功（浏览器环境）

### 兼容性验证

- [ ] `frontend-shared-library-boundary.test.js` 通过
- [ ] Tavern Helper 扩展加载成功
- [ ] JS-Slash-Runner 扩展加载成功
- [ ] 3 个社区扩展手动验证通过

### 性能验证

- [ ] 生产构建时间 < 10 秒
- [ ] 开发模式 HMR < 200ms
- [ ] 构建输出文件大小与 Webpack 版本相近（±10%）

### 文档验证

- [ ] `AGENTS.md` 更新构建命令说明
- [ ] `.docs/tech/frontend-shared-library-boundary.md` 更新构建工具说明
- [ ] 本 spec 文档标记为已交付

---

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|---|---|---|---|
| Vite ES module 输出与 Webpack 存在细微差异 | 中 | 低 | 充分测试 named exports 和 default export，运行 `frontend-shared-library-boundary.test.js` |
| 第三方库打包失败（如 DOMPurify） | 中 | 低 | 检查 Rollup external 配置，必要时手动 shim |
| 文件大小显著增加 | 低 | 低 | 启用 Rollup minify，对比 Webpack gzip 后大小 |
| 扩展加载报错 | 高 | 中 | 保留 Webpack 回退，feature flag 控制构建工具选择 |
| 中间件路由未正确提供 `/lib.js` | 高 | 中 | 创建 `vite-lib-serve.js` 中间件，测试运行时加载 |

---

## 回退方案

如果 Vite 构建存在无法解决的兼容性问题：

1. **短期回退**：使用 `bun run build:webpack` 继续 Webpack 构建
2. **中期方案**：修复 Vite 配置问题（2-3 天缓冲期）
3. **长期决策**：如 1 周内无法解决，考虑推迟 Vite 迁移到 Phase 1

---

## 依赖

### 前置条件

- ✅ Node.js 26.3.0 已安装
- ✅ Bun 1.3.14 已安装
- ✅ 现有 Webpack 构建正常工作

### 后续依赖

本 Sprint 阻塞：
- Phase 0 Sprint 3（React 开发环境需 Vite dev server）

---

## 参考资料

### 内部文档

- [React 现代化路线图](../../tech/react-modernization-roadmap.md)
- [前端共享库边界](../../tech/frontend-shared-library-boundary.md)
- [第三方扩展兼容性](../../tech/third-party-extension-compatibility.md)

### 外部文档

- [Vite Library Mode](https://vite.dev/guide/build.html#library-mode)
- [Rollup Output Options](https://rollupjs.org/configuration-options/#output-format)
- [@rollup/plugin-commonjs](https://github.com/rollup/plugins/tree/master/packages/commonjs)

### 代码示例

- [Vite UMD Library Example](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-vanilla)

---

## 交付标准（Definition of Done）

- [ ] 代码通过 `bun run lint`
- [ ] 功能验证清单 100% 完成
- [ ] 兼容性验证清单 100% 完成
- [ ] 性能验证清单 100% 完成
- [ ] Code review 完成（至少 1 人 approve）
- [ ] 文档更新完成
- [ ] 合并到 `csp-dev-techupgrade` 分支
- [ ] 本 spec 标记为 ✅ 已交付

---

## 下一步

完成本 Sprint 后，进入：

👉 [Phase 0 Sprint 2: TypeScript 配置](phase0-sprint2-typescript-config.md)
