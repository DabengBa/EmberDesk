# React Login 与 Setup Legacy 退休

## 意图与核心流程

让 Login 与 Setup 成为首批 React 唯一运行时页面。用户仍从 `/login`、`/setup` 完成相同认证与初始化流程；旧 `.html` URL 只重定向到 canonical route，不再加载 jQuery 页面。

主流程：

1. 服务启动或发布校验确认共享 React app 产物存在。
2. 用户进入 `/login` 或由 `/login.html` 重定向进入 `/login`，完成登录、锁定反馈或恢复流程。
3. 需要初始化的用户进入 `/setup` 或由 `/setup.html` 重定向进入 `/setup`，完成 fresh 或 set-password 流程。
4. 页面成功后沿用现有 `/`、`/login` redirect 结果；失败保留可读错误和可重试表单。

## 范围 / 不做范围

包括删除 Login/Setup page flags、legacy HTML/controller、fallback 路由和相应测试假设；补齐 React parity、build-required 与旧 URL redirect 证明。

不改变认证 API、账号数据、session、CSRF、rate limit、basic auth、auth wall、Settings route 或 workspace。

## 边界规则 / 验收

R1: `/login` 必须始终由 React app 服务，同时保留 accounts disabled、basic-auth auto-login、已登录 redirect、discreet login、账号锁定、密码显示和恢复码流程。

R2: `/setup` 必须始终由 React app 服务，同时保留 `needsSetup()` redirect、fresh account、set-password、字段校验、rate-limit feedback 和完成后 `/login` redirect。

R3: `/login.html` 与 `/setup.html` 不得再返回 legacy HTML；它们必须重定向到 canonical route，且 query string 中受支持的导航上下文不得被无意丢失。

R4: `features.react.pages.login`、`features.react.pages.setup`、对应 `isReact*Enabled()` 分支、`public/login.html`、`public/setup.html`、`public/scripts/login.js`、`public/scripts/setup.js` 以及 legacy-only CSS/import 必须从运行时删除。仓库不得保留可重新激活旧页面的隐藏分支。

R5: React build 缺失时不得回退到 legacy 页面。发布/build gate 必须失败；测试或诊断启动若仍可运行，页面必须返回明确错误而不是空白或旧实现。

R6: Login 与 Setup 的键盘顺序、可读 label、错误关联、busy/disabled 状态和 mobile viewport 可达性必须保持；用户可见 copy 不暴露 migration/owner 枚举。

R7: owning semantic docs 与项目历史必须描述 React sole owner 和旧 URL redirect；`bun run docs:check` 通过。

## 架构 / 约束

- 复用现有 TanStack Router、TanStack Form/Zod 和共享 `build:react` 产物。
- `src/users.js` 继续负责账户状态、auto-login、needs-setup 与 route middleware，不复制认证判断到 React。
- 删除 feature switch 后，React build 成为发布必需产物；不新增第二套静态页面。
- 旧 URL 只作为路由兼容别名，不是运行时 fallback。
- 版本回滚通过重新部署上一版本，不保留同版本 controller。

## 数据 / 集成

- 不改变 `/api/users/login`、恢复、setup/password 相关 payload 或响应。
- 不迁移用户文件、密码 hash、session cookie 或 rate-limit storage。
- React route 继续使用现有 CSRF 与认证端点。

## 验证

```bash
bun run --cwd tests test:unit -- login-react-route.test.js setup-react-route.test.js login-page-controller.test.js setup-page-controller.test.js users-public-setup.test.js --runInBand
bun run build:react
bun run --cwd tests test:e2e -- login.e2e.js --workers=1
bun run docs:check
```

实现应删除或改写 controller 测试，使其证明 legacy 文件不存在、旧 URL 重定向、build 缺失不会回退；E2E 覆盖登录、锁定、恢复、fresh setup、set-password 和移动/键盘行为。

## Doc ID 契约

- `page.login`：owner `.docs/db/pages/login.md`；绑定 `/login` sole owner、旧 URL redirect、恢复和 lockout。
- `page.setup`：owner `.docs/db/pages/setup.md`；绑定 `/setup` sole owner、fresh/set-password 和 redirect。

## 参考资料

- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `.docs/tech/briefs/260716-02-react-legacy-retirement.md`
- `src/users.js`
- `src/react-login-feature.js`
- `src/react-setup-feature.js`
- `app/routes/login.tsx`
- `app/routes/setup.tsx`
- `tests/login-react-route.test.js`
- `tests/setup-react-route.test.js`
- Inference：保留 `.html` URL 为 redirect 能在不保留 legacy runtime 的前提下避免旧书签直接失效。
