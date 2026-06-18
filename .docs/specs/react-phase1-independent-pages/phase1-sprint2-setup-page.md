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
2. 创建 `app/components/setup/SetupForm.tsx`
3. 处理 `fresh` 和 `set-password` 两种 setup 模式
4. Feature flag 控制新旧版本切换

### 成功标准

- ✅ React Setup 页面功能与 jQuery 版本完全一致
- ✅ `setup-page-controller.test.js` 测试通过
- ✅ 首次设置流程端到端正常

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

```typescript
const freshSchema = z.object({
  handle: z.string().min(1, '请输入用户名'),
  displayName: z.string().optional(),
});

const setPasswordSchema = z.object({
  password: z.string().min(6, '密码至少 6 位'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: '两次密码不一致',
});
```

### 组件结构

```
app/routes/setup.tsx
app/components/setup/
├─ SetupForm.tsx              # 根据模式切换表单
├─ FreshSetupForm.tsx         # fresh 模式表单
└─ SetPasswordForm.tsx        # set-password 模式表单
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

- [ ] fresh 模式设置流程正常
- [ ] set-password 模式设置流程正常
- [ ] `bun run --cwd tests test:unit -- setup-page-controller.test.js --runInBand` 通过
- [ ] Feature flag 切换正常

---

## 交付标准（Definition of Done）

- [ ] 功能验证清单 100% 完成
- [ ] Code review 完成
- [ ] 合并到 `csp-dev-techupgrade` 分支

---

## 下一步

👉 [Phase 1 Sprint 3: Settings 面板 React 重写](phase1-sprint3-settings-panel.md)
