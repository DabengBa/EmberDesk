# React Login 与 Setup Legacy 退休 Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

Source: `spec.md`
Brief: `.docs/tech/briefs/260716-03-react-login-setup-retirement.md`
Doc IDs: page.login, page.setup

## Tasks

### Task 1: 将 Login 与 Setup 路由固定为 React sole owner
- [x] **Done**
- **Reqs:** R1, R2, R3, R5
- **Kind:** behavior
- **Scope:** `src/users.js`, auth/setup route middleware, React build detection, route tests
- **Proof:** command: bun run --cwd tests test:unit -- login-react-route.test.js setup-react-route.test.js users-public-setup.test.js --runInBand
- **PM:** 访问 `/login`、`/setup`、`/login.html`、`/setup.html` 并模拟缺少 build -> canonical route 使用 React，旧 URL 重定向，缺少 build 不出现 legacy 页面
- **Doc IDs:** page.login, page.setup
- **Evidence:** evidence/task-01.md

### Task 2: 删除 legacy 页面、controller、flags 与运行时引用
- [x] **Done**
- **Reqs:** R4
- **Kind:** behavior
- **Scope:** `public/login.html`, `public/setup.html`, `public/scripts/login.js`, `public/scripts/setup.js`, `src/react-login-feature.js`, `src/react-setup-feature.js`, config defaults, imports, legacy tests/styles
- **Proof:** command: bun run --cwd tests test:unit -- login-react-route.test.js setup-react-route.test.js --runInBand && bun run build:react
- **PM:** 搜索发布产物和运行时 source -> 无可激活 legacy Login/Setup owner，React 页面可正常加载
- **Doc IDs:** page.login, page.setup
- **Evidence:** evidence/task-02.md

### Task 3: 固化认证、恢复、setup 与可访问性 parity
- [x] **Done**
- **Reqs:** R1, R2, R6
- **Kind:** behavior
- **Scope:** `app/routes/login.tsx`, `app/routes/setup.tsx`, shared auth components/helpers, `tests/login.e2e.js`, focused route/form tests
- **Proof:** command: bun run --cwd tests test:e2e -- login.e2e.js --workers=1
- **PM:** 完成正常登录、错误锁定、恢复、fresh setup、set-password、mobile 和键盘流程 -> 结果与当前产品契约一致
- **Doc IDs:** page.login, page.setup
- **Evidence:** evidence/task-03.md

### Task 4: 更新语义文档并验证删除边界
- [x] **Done**
- **Reqs:** R7
- **Kind:** non-behavior
- **Scope:** `.docs/db/pages/login.md`, `.docs/db/pages/setup.md`, `.docs/PROJECT_HISTORY.md`, retirement ledger/roadmap when owner state changes
- **Proof:** command: bun run docs:check && git diff --check
- **PM:** 审阅 Login/Setup owning docs -> sole owner、redirect、无 fallback 与回滚边界描述一致
- **Doc IDs:** page.login, page.setup
- **Evidence:** evidence/task-04.md

## Review

- [x] Review complete

### Review notes
- ZERO CONFIRMED FINDINGS after implementation evidence and focused validation.
- Frontend surfaces reviewed via route/e2e/compat proofs; no additional UX redesign in scope.
