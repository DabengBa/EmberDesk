# Phase 0 Sprint 2: TypeScript 配置

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-0-基础设施准备3-个月)
- **Phase**：[Phase 0 - 基础设施准备](README.md)
- **Sprint**：Phase 0 Sprint 2（全局 Sprint 2/40）
- **预计工期**：2 周
- **风险等级**：低

---

## 目标

建立 TypeScript 6 基础配置，支持渐进式类型迁移，后端新代码优先使用 `.ts` 编写。

### 主要交付物

1. 重命名 `jsconfig.json` → `tsconfig.json`
2. 配置增量迁移参数（`allowJs: true`, `checkJs: false`）
3. 为后端新 helpers/services 启用 `.ts` 编写
4. 配置类型检查和 IDE 支持
5. 更新 ESLint 集成 TypeScript

### 成功标准

- ✅ `tsconfig.json` 配置完成，支持 `.js` 和 `.ts` 共存
- ✅ 后端新文件可用 `.ts` 编写且类型检查通过
- ✅ IDE 自动补全和类型提示正常工作
- ✅ `bun run lint` 通过（TypeScript 文件）
- ✅ 现有 `.js` 文件不受影响，无类型错误

---

## 背景

### 当前状态

**jsconfig.json**：
```json
{
  "compilerOptions": {
    "module": "ES2022",
    "target": "ES2022",
    "moduleResolution": "bundler"
  }
}
```

**问题**：
- 无类型检查
- IDE 类型提示有限
- 运行时类型错误无法提前发现

### 目标状态

**tsconfig.json**（渐进式）：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "allowJs": true,              // 允许 .js 文件
    "checkJs": false,             // 不检查 .js 文件类型
    "strict": false,              // 严格模式暂不开启
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,               // 不输出编译后的 .js
    "types": ["node", "bun"]
  },
  "include": ["src/**/*", "public/**/*", "app/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## 技术设计

### 迁移策略：四阶段渐进式

#### Phase 1: 基础配置（本 Sprint）
- `allowJs: true`, `checkJs: false`
- 后端新文件优先 `.ts`
- 前端保持 `.js`

#### Phase 2: 后端迁移（Phase 1-2）
- 逐步重命名 `src/**/*.js` → `.ts`
- 开启 `checkJs: true` 检查已迁移文件

#### Phase 3: 前端迁移（Phase 3-4）
- React 组件用 `.tsx` 编写
- 逐步重命名 `public/scripts/**/*.js` → `.ts`

#### Phase 4: 严格模式（Phase 5+）
- 开启 `strict: true`
- 修复所有类型错误

### 关键配置项说明

#### 1. `allowJs: true`

**理由**：现有 13,000+ 行 `.js` 代码无法一次性迁移。

**效果**：`.js` 和 `.ts` 文件可共存，互相导入。

#### 2. `checkJs: false`

**理由**：现有 `.js` 代码会产生大量类型错误，影响开发体验。

**效果**：仅检查 `.ts` 文件，`.js` 文件跳过类型检查。

#### 3. `noEmit: true`

**理由**：使用 Bun/Node 直接运行源代码，无需 TypeScript 编译。

**效果**：`tsc` 仅用于类型检查，不生成 `.js` 输出文件。

#### 4. `types: ["node", "bun"]`

**理由**：项目使用 Node.js 26.3.0 和 Bun 1.3.14。

**效果**：提供 Node 和 Bun API 的类型定义。

---

## 实施步骤

### 步骤 1：重命名配置文件

```bash
mv jsconfig.json tsconfig.json
```

### 步骤 2：更新 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    
    // 渐进式迁移
    "allowJs": true,
    "checkJs": false,
    "strict": false,
    
    // 互操作性
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    
    // 输出控制
    "noEmit": true,
    "skipLibCheck": true,
    
    // 类型定义
    "types": ["node", "bun"],
    
    // 路径别名（与 Vite 保持一致）
    "baseUrl": ".",
    "paths": {
      "@/*": ["app/*"],
      "@sillytavern/*": ["public/scripts/*"]
    }
  },
  "include": [
    "src/**/*",
    "public/**/*",
    "app/**/*",
    "*.js",
    "*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "tests",
    "public/scripts/extensions/third-party"
  ]
}
```

### 步骤 3：安装 TypeScript 和类型定义

```bash
bun add -D typescript@6.0.3
bun add -D @types/node@25.9.1
bun add -D @types/express@5.0.6
bun add -D @types/jquery@3.5.33
# 其他 @types/* 已在 devDependencies 中
```

### 步骤 4：创建第一个 `.ts` 文件

创建 `src/example-helper.ts` 作为模板：

```typescript
/**
 * 示例 TypeScript helper 文件
 * 演示类型定义和 JSDoc 注释
 */

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的字符串（如 "1.23 MB"）
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * 延迟执行
 * @param ms 毫秒数
 */
export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 类型安全的对象键检查
 */
export function hasOwnProperty<T extends object>(
  obj: T,
  key: PropertyKey
): key is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
```

### 步骤 5：更新 ESLint 配置

修改 `eslint.config.js`，添加 TypeScript 支持：

```javascript
import tseslint from 'typescript-eslint';

export default [
  // ... 现有配置
  
  // TypeScript 文件规则
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
];
```

### 步骤 6：添加类型检查脚本

更新 `package.json`：

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint \"src/**/*.{js,ts}\" \"public/**/*.js\" \"app/**/*.{ts,tsx}\" \"./*.{js,ts}\"",
  }
}
```

### 步骤 7：验证类型检查

```bash
# 类型检查（应无错误）
bun run typecheck

# Lint 检查（应通过）
bun run lint

# 单元测试（应通过）
bun run test:unit
```

### 步骤 8：IDE 配置（VSCode）

创建 `.vscode/settings.json`：

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

### 步骤 9：文档更新

更新 `AGENTS.md`：

```markdown
## 语言

- **主语言**：JavaScript ES modules（现有代码）
- **TypeScript**：后端新代码优先使用 `.ts`，渐进式迁移
- **类型检查**：`bun run typecheck`
```

---

## 验证清单

### 功能验证

- [ ] `tsconfig.json` 存在且配置正确
- [ ] `bun run typecheck` 无错误
- [ ] 示例 `.ts` 文件类型检查通过
- [ ] 现有 `.js` 文件不产生类型错误
- [ ] `.js` 和 `.ts` 文件可互相导入

### IDE 验证

- [ ] VSCode 自动补全工作正常
- [ ] 类型提示显示正确
- [ ] 跳转到定义（Go to Definition）可用
- [ ] 错误提示实时显示

### Lint 验证

- [ ] `bun run lint` 通过
- [ ] TypeScript 文件遵循 ESLint 规则
- [ ] 未引入新的 lint 错误

### 测试验证

- [ ] `bun run test:unit` 通过
- [ ] 现有测试不受影响

---

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|---|---|---|---|
| 现有 `.js` 文件产生类型错误 | 中 | 中 | `checkJs: false` 跳过检查 |
| 路径别名不生效 | 低 | 低 | 同步 `tsconfig.json` 和 `vite.config.ts` 配置 |
| IDE 类型提示慢 | 低 | 中 | `skipLibCheck: true` 跳过 node_modules 类型检查 |
| Bun 和 Node 类型冲突 | 低 | 低 | 优先使用 Node 类型，Bun 作为补充 |

---

## 依赖

### 前置条件

- ✅ Phase 0 Sprint 1（Vite 迁移）已完成

### 后续依赖

本 Sprint 阻塞：
- Phase 0 Sprint 3（React 开发环境需 TypeScript 支持）

---

## 参考资料

### 内部文档

- [React 现代化路线图](../../tech/react-modernization-roadmap.md)

### 外部文档

- [TypeScript 配置参考](https://www.typescriptlang.org/tsconfig)
- [TypeScript 渐进式迁移](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)
- [Bun TypeScript](https://bun.sh/docs/typescript)

---

## 交付标准（Definition of Done）

- [ ] `tsconfig.json` 配置完成
- [ ] 类型检查脚本通过
- [ ] 示例 `.ts` 文件创建
- [ ] ESLint 集成 TypeScript
- [ ] IDE 配置文档更新
- [ ] `bun run lint` 通过
- [ ] `bun run test:unit` 通过
- [ ] Code review 完成
- [ ] 文档更新完成
- [ ] 合并到 `csp-dev-techupgrade` 分支

---

## 下一步

👉 [Phase 0 Sprint 3: React 开发环境](phase0-sprint3-react-dev-env.md)
