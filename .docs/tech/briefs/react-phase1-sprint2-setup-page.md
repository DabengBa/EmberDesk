---
created: 2026-06-16
source: user
confirmed: true
last_updated: 2026-06-18
---

# React Setup Page Rollout Intent

## User Original Request

用户要求继续执行 `.docs/specs/react-phase1-independent-pages/phase1-sprint2-setup-page.md` 对应的交付，并通过 `delivery-workflow` 将 Setup 页面 React 化落到可验证状态。

用户此前已明确要求 React 现代化路线图严格推动 TanStack Form / TanStack Query / Zod 的采用。

## Background & Motivation

将 EmberDesk 首次设置页从 `public/setup.html` + `public/scripts/setup.js` 迁移到 React，同时保持首次设置语义、现有 API 契约、中文 copy、legacy 回退入口和 feature flag 灰度能力不变。

## Intent Domains

### Domain: React setup page rollout

- **User expectation:** `/setup` 可以在 feature flag 开启且 React build 存在时提供 React setup 页面，`/setup.html` 继续作为 legacy 回退入口
- **Current status:** delivered
- **Change history:**
  - 2026-06-16: 用户要求继续执行 Phase 1 Sprint 2 Setup 页面 React 化
  - 2026-06-16: React setup route、组件、共享 helper、feature flag 和 tests 已交付
  - 2026-06-18: Durable docs 已同步，spec-local `spec.md` / `plan.md` 事实转存完成
- **Implementation traceability:** code paths `src/react-setup-feature.js`, `src/users.js`, `app/routes/setup.tsx`, `app/components/setup/*`, `app/lib/setup-helpers.ts`, `public/scripts/setup-shared.js`; tests `tests/setup-react-route.test.js`, `tests/setup-page-controller.test.js`, `tests/users-public-setup.test.js`; owning docs `.docs/db/pages/setup.md`, `.docs/db/features/first-time-setup.md`, `.docs/tech/react-modernization-roadmap.md`; delivery status `delivered`

### Domain: Setup TanStack stack adoption

- **User expectation:** React Setup 页面必须使用 TanStack Form + Zod 处理表单校验，并用 TanStack Query 管理 CSRF、setup-mode 和 setup 提交状态
- **Current status:** delivered
- **Change history:**
  - 2026-06-16: 用户明确要求 React 现代化路线图严格推动 TanStack Form / Query / Zod 采用
  - 2026-06-16: Setup 实现已采用 TanStack Form / Zod / Query
  - 2026-06-18: Roadmap 和 Setup spec 已同步该 adoption gate
- **Implementation traceability:** code path `app/routes/setup.tsx`; tests `tests/setup-react-route.test.js`; roadmap `.docs/tech/react-modernization-roadmap.md`; delivery status `delivered`

## Result Constraints

- `/setup` 在 `features.react.pages.setup` 开启且 React 构建存在时提供 React 页面
- `/setup.html` 继续保留为 legacy jQuery 回退入口
- React Setup 页面必须使用 TanStack Form + Zod 处理表单校验
- React Setup 页面必须使用 TanStack Query 管理 CSRF、setup-mode 和 setup 提交状态
- `fresh` 与 `set-password` 两种 setup 模式都必须保留

## Non-Goals

- 不修改 `GET /csrf-token`、`GET /api/users/setup-mode`、`POST /api/users/setup` 契约
- 不移除 legacy setup 页面或其 controller 测试
- 优先复用现有 React 登录页构建与服务管线，避免为 setup 迁移引入额外的大重命名
- 用户可见语义以 `.docs/db/pages/setup.md` 为准

## Source Evidence

- `.docs/specs/react-phase1-independent-pages/phase1-sprint2-setup-page.md`
- `.docs/specs/react-phase1-independent-pages/README.md`
- `.docs/db/pages/setup.md`
- `.docs/tech/react-modernization-roadmap.md`
- `public/setup.html`
- `public/scripts/setup.js`
