# 登录与设置 Controller Slice 设计

## 意图与核心流程

本设计继续沿用 login/setup 已验证的页面级 controller 模式，把登录、恢复密码和首次设置页面的表单状态、错误处理、事件生命周期和依赖注入进一步收敛，避免全局副作用扩散。

主要触发条件是用户访问 `/login` 或 `/setup`。登录主路径为：页面初始化 controller，用户输入凭据，提交后按钮进入 loading/disabled 状态，成功后跳转首页，失败时显示可恢复错误。设置主路径为：页面读取 setup mode，用户完成 fresh 或 set-password 表单，提交成功后跳转，失败时恢复表单并显示错误。

## 范围 / 不做范围

本次范围：

- 继续整理 `public/scripts/login.js` 和 `public/scripts/setup.js` 的页面级 controller。
- 保留 `createLoginController(root, dependencyOverrides)`、`createSetupController(root, dependencyOverrides)` 形态。
- 收敛表单启用/禁用、错误消息、密码显隐、lockout 倒计时、恢复流程、setup mode 分支和 cleanup。
- 补强 `tests/login-page-controller.test.js`、`tests/setup-page-controller.test.js`，必要时补 `tests/login.e2e.js`。

不做范围：

- 不改认证协议、cookie/session、CSRF 后端语义或用户数据 schema。
- 不改登录页视觉品牌大方向。
- 不抽象成跨页面通用表单框架。
- 不把 login/setup 合并成同一个 controller。

## 边界规则 / 验收

- controller 初始化失败时应给出明确错误或测试可捕获失败，不静默留下半绑定页面。
- 登录提交期间按钮 disabled，重复提交被阻止；请求完成后根据成功/失败恢复正确状态。
- 登录失败、账号锁定、网络失败、服务端校验失败映射到稳定的用户可读文案。
- 错误信息必须以文本展示并被 `role="alert"` / `aria-live` 或等价机制通知；输入错误应能定位到具体字段或流程步骤。
- 恢复密码流程保持两步状态：发送恢复码后进入重置步骤；取消恢复后回到登录卡片且不自动登录。
- 密码显隐按钮只影响对应输入框，aria 状态和按钮文案/标签保持一致。
- 登录和 setup 流程不得新增需要额外认知测试的认证步骤；如果未来加入验证码、谜题或记忆挑战，必须单独设计可访问替代路径。
- setup fresh 和 set-password 模式都能构造正确请求体；缺少必填输入时不发请求。
- `cleanup()` 必须移除页面拥有的事件监听、timer 和 abort signal，重复 init/cleanup 不应造成重复提交。
- 失败边界：任何 fetch 失败都不能让表单永久 disabled。

## 架构 / 约束

- login/setup 继续保持纯浏览器 ES module，不引入新依赖。
- 页面脚本导出纯 helper 和 `createXController()`，测试通过依赖注入替代真实网络、location 和 timer。
- controller 只拥有当前页面 DOM，不读取或修改聊天工作区全局状态。
- 事件绑定必须可清理，优先使用 `AbortController` 或当前文件已有 cleanup 模式。
- 使用 `AbortController.signal` 注册原生事件时，`abort()` 后监听器会被移除；重复 `init()` 必须创建新的 controller，不能复用已 abort 的 signal。
- E2E 测试优先用 Playwright role/name/label locator 表达真实用户路径，避免只验证内部 ID。
- shared helper 只能在两个页面确实有重复且语义一致时抽取；避免为未来页面创建通用框架。
- 所有行为改动遵循 test-first：先让 controller test 表达目标状态，再做最小实现。

## 数据 / 集成

- 登录输入：handle、password、恢复邮箱/handle、恢复码、新密码。
- 设置输入：setup mode、handle、password 或单用户 set-password 所需字段。
- 输出：现有认证/setup API 请求、错误消息、跳转 URL、页面可见状态。
- 集成点包括 `public/login.html`、`public/setup.html`、`public/css/login.css`、`public/scripts/login.js`、`public/scripts/setup.js` 和后端 auth/setup endpoints。
- 不新增存储键，不改变 cookie 或 session 名称。

## 验证

自动化验证：

```powershell
bun run --cwd tests test:unit -- login-page-controller.test.js --runInBand
bun run --cwd tests test:unit -- setup-page-controller.test.js --runInBand
bun run --cwd tests test:e2e -- login.e2e.js
```

如改动触及 Express auth/setup 路由，还需要：

```powershell
bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand
```

完成证据：

- login/setup focused controller tests 通过。
- 如果 UI 或真实浏览器流程变化，Playwright login e2e 通过。
- 手动或 Chrome DevTools 验证：登录失败、登录成功、恢复取消、setup fresh、setup set-password。

本次执行切片：

- 优先处理登录错误的可访问恢复路径。
- `showError()` 支持关联字段，错误区域显示后变为可聚焦并接收焦点。
- 登录用户名缺失、服务端错误和网络错误会给用户名字段设置 `aria-invalid` 与 `aria-describedby`。
- 凭据输入变化时清理错误文本、`aria-invalid` 和 `aria-describedby`，避免 stale error 状态。

## Grill 结论 / 风险处置

- 自问：login 和 setup 是否应该合并成一个 shared auth controller？推荐答案：不合并。两者流程相似但语义不同，合并会让首次设置、恢复密码和普通登录互相牵连。
- 自问：是否应该把所有 DOM 查询改成数据驱动 schema？推荐答案：不做。当前测试已经通过 dependency injection 覆盖核心状态；schema 化会变成框架化重构。
- Tiger（launch-blocking）：controller cleanup 不完整会导致重复提交、重复倒计时或测试间污染。缓解：每个新增 listener/timer 都要有 cleanup 测试；重复 init/cleanup 要进 focused test。
- Tiger（launch-blocking）：登录失败后按钮永久 disabled 会直接阻断用户。缓解：所有 fetch reject、HTTP error、validation error 路径都必须断言恢复表单。
- Paper Tiger：Accessible Authentication 看起来会阻止密码登录。可管理原因：WCAG 2.2 关注的是不要引入无法替代的认知功能测试；现有密码流程可保留，但新增验证码/谜题必须另设可访问方案。
- Elephant：登录/setup 是低风险技术 slice，但任何微小回归都会阻断整个产品入口。执行时要把 e2e 作为必要门槛，而不是只依赖 helper unit test。

## Doc ID 契约

- 页面绑定：`.docs/db/pages/login.md` 和 `.docs/db/pages/setup.md` 需要反映 controller 拥有的用户可见状态。
- 功能绑定：登录、密码恢复、首次设置、单用户 set-password 作为独立功能流记录。
- 项目历史：实现完成后在 `.docs/PROJECT_HISTORY.md` 记录 controller slice 范围、验证和已知边界。
- 验证期望：运行 docs check/build；若仅内部 controller 重构且用户流程不变，仍需确认页面文档没有语义漂移。

## 参考资料

- `public/login.html`
- `public/setup.html`
- `public/css/login.css`
- `public/scripts/login.js`
- `public/scripts/setup.js`
- `tests/login-page-controller.test.js`
- `tests/setup-page-controller.test.js`
- `tests/login.e2e.js`
- `tests/express5-route-compatibility.test.js`
- `.docs/PROJECT_HISTORY.md`
- W3C WCAG 2.2: `3.3.1 Error Identification`, `3.3.2 Labels or Instructions`, `3.3.8 Accessible Authentication (Minimum)` — https://www.w3.org/TR/WCAG22/
- MDN `addEventListener()` signal option — https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
- Playwright Locators — https://playwright.dev/docs/locators
- Inference：login/setup 是继续 controller 化的安全目标，因为它们是 page-local 表单页面，低于角色列表、World Info、扩展挂载区的兼容风险。
