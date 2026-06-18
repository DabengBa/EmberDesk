# Phase 1 Sprint 1: Login 页面 React 重写

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-1-独立页面迁移3-个月)
- **Phase**：[Phase 1 - 独立页面迁移](README.md)
- **Sprint**：Phase 1 Sprint 1（全局 Sprint 5/40）
- **预计工期**：2 周
- **风险等级**：低

---

## 目标

将 `public/login.html` + `public/scripts/login.js` 迁移到 React，复用现有 API 契约。

### 主要交付物

1. 创建 `app/routes/login.tsx`
2. 创建 `app/components/login/LoginForm.tsx` 和 `RecoveryForm.tsx`
3. 复用 `public/scripts/login-shared.js` 和 `app/lib/login-helpers.ts` 中的登录 helper，保持错误映射、跳转、密码可见性和锁定文案一致
4. 用 TanStack Form + Zod 处理登录和恢复表单验证
5. 用 TanStack Query 管理 CSRF、登录、恢复请求状态
6. Feature flag 控制新旧版本切换，`/login` 提供 React 页面，`/login.html` 保留 legacy 回退入口

### 成功标准

- ✅ React Login 页面用户可见行为与 jQuery 版本保持一致
- ✅ `/login` 在 `features.react.pages.login` 开启且 React 构建存在时提供 React 页面
- ✅ `/login.html` 始终保留为 legacy 回退入口
- ✅ `login.e2e.js`、`login-page-controller.test.js`、`login-react-route.test.js`、`test:compat` 验证通过
- ✅ 真实浏览器 QA 验证通过（桌面、移动端、控制台、网络、回退入口）
- ✅ React Login 表单由 TanStack Form + Zod 驱动
- ✅ Login / recovery 请求状态由 TanStack Query 驱动

---

## 背景

### 现有实现

- **文件**：`public/login.html` + `public/scripts/login.js`（~400 行）
- **已有 controller 模式**：`createLoginController()`、`initLoginPage()`
- **已有纯 helper**：auth error 映射、redirect URL 计算、密码可见性切换、recovery-step 检测、lockout countdown 格式化
- **API**：
  - `GET /csrf-token`
  - `POST /api/users/login`
  - `POST /api/users/recover-step1`
  - `POST /api/users/recover-step2`

### 现有 helper 可直接复用

```javascript
// public/scripts/login.js 中已抽取的纯 helper
- getAuthErrorMessage(data)
- calculatePostLoginRedirect()
- getNextPasswordVisibilityState(current)
- isRecoveryStep(step)
- formatLockoutCountdown(seconds)
```

这些 helper 可直接在 React 中 import 使用，无需重写。

---

## 技术设计

### 组件结构

```
app/routes/login.tsx              # 路由入口
app/components/login/
├─ LoginForm.tsx                  # 登录表单
├─ RecoveryForm.tsx               # 密码恢复表单
└─ PasswordInput.tsx              # 密码输入框（带可见性切换）
```

### 表单设计（TanStack Form + Zod）

```typescript
const loginSchema = z.object({
  handle: z.string().trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

const recoveryStep1Schema = z.object({
  handle: z.string().trim().min(1, '请输入用户名'),
});

const recoveryStep2Schema = z.object({
  code: z.string().trim().min(1, '请输入恢复码'),
  newPassword: z.string().min(8, '密码至少需要 8 个字符'),
});
```

- 提交前校验继续沿用现有中文 copy，例如“请输入用户名”“请输入恢复码”
- 登录和恢复都复用现有 CSRF + API 契约
- 错误映射、锁定倒计时、密码显隐文案由 shared helper 统一输出

### 请求状态设计（TanStack Query）

- `useQuery` 获取并缓存 `/csrf-token`
- `useMutation` 管理 `/api/users/login`
- `useMutation` 管理 `/api/users/recover-step1`
- `useMutation` 管理 `/api/users/recover-step2`
- `isPending` / `error` 状态驱动按钮禁用、加载文案和错误区域

### Feature Flag

```yaml
# config.yaml
features:
  react:
    pages:
      login: true    # 当前交付已开启，/login.html 保留为回退入口
```

服务端判断：
```typescript
// /login 在 feature flag 开启且 app/dist/index.html 存在时提供 React 页面
// /login.html 始终保留 legacy jQuery 版本
// React 构建缺失时自动回退到 legacy 页面
```

---

## 实施步骤

### 步骤 1：迁移和共享纯 helper

将 `public/scripts/login.js` 中的纯 helper 收敛为共享实现，供 React 和 legacy 登录页共同复用：

```typescript
// public/scripts/login-shared.js + app/lib/login-helpers.ts
export function getLoginErrorMessage(message: unknown): string {}
export function buildHomeRedirectUrl(href: string): string {}
export function getPasswordVisibilityState(currentType: string): PasswordVisibilityState {}
export function getRecoveryStep(state: RecoveryStepState): 1 | 2 {}
export function formatLockoutMessage(remaining: number): string {}
```

### 步骤 2：创建 React 组件

按照组件结构创建所有文件。

### 步骤 3：实现表单和页面状态

用 TanStack Form + Zod 完成登录、恢复步骤、字段级验证和中文错误 copy。

### 步骤 4：集成 API

用 TanStack Query mutation 封装现有 CSRF + API 契约：
- `GET /csrf-token`
- `POST /api/users/login`
- `POST /api/users/recover-step1`
- `POST /api/users/recover-step2`

### 步骤 5：Feature flag 集成

在服务端登录路由添加 flag 判断和构建产物回退。

### 步骤 6：测试

- 单元测试：shared login helper / login controller / route contract
- E2E 测试：复用并扩展 `tests/login.e2e.js`
- 浏览器 QA：验证 `/login`、`/login.html`、移动端响应式、控制台和网络

---

## 当前验证结果

- [x] React Login 页面功能完整（登录、恢复、锁定）
- [x] `bun run build:react`
- [x] `bun run typecheck`
- [x] `bunx eslint app/routes/login.tsx app/components/login/LoginForm.tsx app/components/login/RecoveryForm.tsx app/components/login/PasswordInput.tsx app/lib/login-helpers.ts`
- [x] `bun run --cwd tests test:unit -- login-react-route.test.js login-page-controller.test.js --runInBand`
- [x] `bun run --cwd tests test:e2e -- login.e2e.js`
- [x] `bun run test:compat`
- [x] `bun run docs:check`
- [x] Feature flag 切换正常（`/login` React，`/login.html` legacy fallback）
- [x] 移动端响应式正常
- [x] 真实浏览器 QA 通过（桌面、移动端、控制台、网络）
- [x] TanStack Form + Zod 表单验证落地
- [x] TanStack Query 请求状态管理落地

## 当前交付状态（2026-06-16）

- [x] React 登录页已在 `/login` 落地
- [x] `features.react.pages.login` 默认开启
- [x] `/login.html` 继续作为 rollback surface 保留
- [x] 文档已同步到 `.docs/db/pages/login.md`、`.docs/PROJECT_HISTORY.md`、`.docs/tech/react-modernization-roadmap.md`
- [x] 按 React 现代化路线图完成 TanStack Form / Zod / Query 技术栈收口

---

## 下一步

👉 [Phase 1 Sprint 2: Setup 页面 React 重写](phase1-sprint2-setup-page.md)
