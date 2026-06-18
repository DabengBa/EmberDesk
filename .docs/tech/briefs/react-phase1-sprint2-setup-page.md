# React Setup Page Rollout Intent

日期：2026-06-16

## 原始请求

用户要求继续执行 `.docs/specs/react-phase1-independent-pages/phase1-sprint2-setup-page.md` 对应的交付，并通过 `delivery-workflow` 将 Setup 页面 React 化落到可验证状态。

用户此前已明确要求 React 现代化路线图严格推动 TanStack Form / TanStack Query / Zod 的采用。

## 意图

将 EmberDesk 首次设置页从 `public/setup.html` + `public/scripts/setup.js` 迁移到 React，同时保持首次设置语义、现有 API 契约、中文 copy、legacy 回退入口和 feature flag 灰度能力不变。

## 结果约束

- `/setup` 在 `features.react.pages.setup` 开启且 React 构建存在时提供 React 页面
- `/setup.html` 继续保留为 legacy jQuery 回退入口
- React Setup 页面必须使用 TanStack Form + Zod 处理表单校验
- React Setup 页面必须使用 TanStack Query 管理 CSRF、setup-mode 和 setup 提交状态
- `fresh` 与 `set-password` 两种 setup 模式都必须保留

## 约束

- 不修改 `GET /csrf-token`、`GET /api/users/setup-mode`、`POST /api/users/setup` 契约
- 不移除 legacy setup 页面或其 controller 测试
- 优先复用现有 React 登录页构建与服务管线，避免为 setup 迁移引入额外的大重命名
- 用户可见语义以 `.docs/db/pages/setup.md` 为准

## 源证据链

- `.docs/specs/react-phase1-independent-pages/phase1-sprint2-setup-page.md`
- `.docs/specs/react-phase1-independent-pages/README.md`
- `.docs/db/pages/setup.md`
- `.docs/tech/react-modernization-roadmap.md`
- `public/setup.html`
- `public/scripts/setup.js`
