# Login Page Redesign — DEVLOG

**Date:** 2026-05-13
**Status:** 已交付

## 功能

重新设计登录页面，替换原有的双模式（用户卡片选择 / 隐私模式）为统一的 handle + 密码表单，并新增账户级锁定机制。

## 改动

### 前端

* `public/login.html` — 全面重写：单一登录表单（handle + 密码 + 显示/隐藏切换 + 登录按钮），密码恢复表单，无用户列表暴露，语义化 HTML + ARIA 属性

* `public/css/login.css` — 全面重写：使用 DESIGN.md token（SmartThemeBlurTintColor、SmartThemeBorderColor、SmartThemeBodyColor 等），匹配 menu\_button 词汇表，5px 控件 / 10px 卡片圆角，错误 shake 动画

* `public/scripts/login.js` — 全面重写：移除用户列表获取，新增密码可见性切换、表单切换（登录/恢复）、锁定倒计时显示、Enter 键提交

### 后端

* `src/endpoints/users-public.js` — 在 `POST /api/users/login` 新增 per-account 限流器（`RateLimiterMemory`，5 次 / 300 秒），与现有 per-IP 限流并行；成功登录清除两个限流器

* `config.yaml` — 新增 `rateLimiting.accountsLoginLockoutDuration: 300`

## 安全改进

* 用户列表不再对未登录访客暴露

* 账户级暴力破解防护：同一账户 5 次失败后锁定 5 分钟（与 IP 限流并行）

* 锁定状态通过 `Retry-After` 头返回，前端显示倒计时

## 已知边界

* `enableDiscreetLogin` 配置保留但不再被登录页面消费（向后兼容）

* `POST /api/users/list` 端点保留（管理员面板仍在使用）

* 密码恢复机制不变（恢复码仍打印到服务器控制台）

* 恢复后自动登录失败时，错误显示在登录卡片上而非恢复卡片（原有行为）

## 文件清单

| 文件                              | 变更类型      |
| ------------------------------- | --------- |
| `public/login.html`             | 重写        |
| `public/css/login.css`          | 重写        |
| `public/scripts/login.js`       | 重写        |
| `src/endpoints/users-public.js` | 修改（新增限流器） |
| `config.yaml`                   | 修改（新增配置键） |

