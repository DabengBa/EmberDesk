---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-16
feature_slug: react-login-setup-retirement
status: delivered
---

# React Login And Setup Retirement Intent

## 原始请求

用户要求在已经迁移到 React 的地方清理 legacy，功能完整优先，保持用户行为一致，并允许彻底替换内部实现。

## 目标结果

`/login` 与 `/setup` 只运行 React 实现；认证、恢复、首次设置和密码升级结果不变，legacy HTML、controller、feature flag 与 build fallback 从发布版本删除。

## 最终稳定追溯

- Routes/owner: `src/users.js`, `src/server-main.js`, `src/middleware/react-login-serve.js`, `app/routes/login.tsx`, `app/routes/setup.tsx`
- Shared helpers retained: `public/scripts/login-shared.js`, `public/scripts/setup-shared.js`
- Proof: `tests/login-react-route.test.js`, `tests/setup-react-route.test.js`, `tests/login.e2e.js`
- Owning docs: `.docs/db/pages/login.md`, `.docs/db/pages/setup.md`, `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`, `.docs/tech/legacy-cutover-ledger.md`

## 范围边界

- 只处理 Login 与 Setup 页面运行时和路由。
- 不顺带处理 Settings、workspace auth wall、session schema 或密码存储。
- 回滚通过部署上一版本完成。

## 变更历史

- 2026-07-16：根据 ADR-0012 创建第一波页面退休实现包。
- 2026-07-16：交付 React sole owner、旧 URL redirect、删除 legacy controller/flag，并关闭 wrap-up。
