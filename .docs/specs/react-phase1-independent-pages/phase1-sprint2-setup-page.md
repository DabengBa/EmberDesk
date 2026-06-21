# Phase 1 Sprint 2: Setup 页面 React 重写

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-1-独立页面迁移3-个月)
- **Phase**：[Phase 1 - 独立页面迁移](README.md)
- **Sprint**：Phase 1 Sprint 2（全局 Sprint 6/40）
- **预计工期**：2 周
- **风险等级**：低

---

## 目标

将 `public/setup.html` + `public/scripts/setup.js` 迁移到 React。

### 主要交付物

1. 创建 `app/routes/setup.tsx`
2. 创建 `app/components/setup/SetupForm.tsx` 和 `SetupPasswordInput.tsx`
3. 处理 `fresh` 和 `set-password` 两种 setup 模式
4. 用 TanStack Form + Zod 处理 setup 表单验证
5. 用 TanStack Query 管理 CSRF、setup-mode 和 setup 提交状态
6. Feature flag 控制新旧版本切换，`/setup.html` 保留 legacy 回退入口

### 成功标准

- ✅ React Setup 页面功能与 jQuery 版本完全一致
- ✅ `/setup` 在 `features.react.pages.setup` 开启且 React 构建存在时提供 React 页面
- ✅ `/setup.html` 始终保留为 legacy 回退入口
- ✅ `setup-react-route.test.js`、`setup-page-controller.test.js`、`users-public-setup.test.js` 验证通过
- ✅ 首次设置和单用户无密码 `set-password` 流程正常
- ✅ React Setup 表单由 TanStack Form + Zod 驱动
- ✅ Setup 请求状态由 TanStack Query 驱动

---

## 背景

### 现有实现

- **文件**：`public/setup.html` + `public/scripts/setup.js`（~350 行）
- **已有 controller 模式**：`createSetupController()`、`initSetupPage()`
- **两种模式**：
  - `fresh`：全新安装，设置 handle 和 display name
  - `set-password`：单用户无密码，设置密码
- **API**：
  - `GET /csrf-token`
  - `GET /api/users/setup-mode`
  - `POST /api/users/setup`

---

## 技术设计

### 表单验证

React 实现用 TanStack Form 承载字段状态和提交，用 Zod 校验 `fresh` / `set-password` 两种模式。用户可见中文 copy、密码一致性校验、loading/error 状态和成功跳转保持与 legacy setup 语义一致。

### 组件结构

```
app/routes/setup.tsx
app/components/setup/
├─ SetupForm.tsx              # 根据模式切换表单
└─ SetupPasswordInput.tsx     # 密码输入框和可见性切换
```

---

## 实施步骤

1. 复用 `public/scripts/setup.js` 中的纯 helper
2. 创建 React 组件
3. 用 TanStack Query 获取 `setup-mode`
4. 根据模式渲染对应表单
5. 集成 Feature flag
6. 测试

---

## 验证清单

- [x] fresh 模式设置流程正常
- [x] set-password 模式设置流程正常
- [x] `bun run --cwd tests test:unit -- setup-react-route.test.js setup-page-controller.test.js users-public-setup.test.js --runInBand` 通过
- [x] `bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand` 通过
- [x] `bun run build:react` 通过
- [x] `bun run typecheck` 通过
- [x] Feature flag 切换正常
- [x] `/setup.html` legacy fallback 保持可用

---

## 交付标准（Definition of Done）

- [x] 功能验证清单 100% 完成
- [x] Code review 完成
- [x] Durable docs 已同步到 `.docs/db/pages/setup.md`、`.docs/db/features/first-time-setup.md`、`.docs/tech/react-modernization-roadmap.md`、`.docs/PROJECT_HISTORY.md`

## 当前交付状态（2026-06-16）

- [x] React Setup 页面已在 `/setup` 落地
- [x] `features.react.pages.setup` 默认保持关闭，可用于灰度
- [x] `/setup.html` 继续作为 rollback surface 保留
- [x] 按 React 现代化路线图完成 TanStack Form / Zod / Query 技术栈收口

---

## 下一步

👉 [Phase 1 Sprint 3: Settings 面板 React 重写](phase1-sprint3-settings-panel.md)
