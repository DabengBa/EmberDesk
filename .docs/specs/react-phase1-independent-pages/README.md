# Phase 1: 独立页面迁移

**预计工期**：3 个月（2026 Q3: 月 7-9）  
**目标**：迁移登录、设置、角色库等独立页面到 React  
**风险等级**：低-中

---

## 概览

Phase 1 迁移无复杂状态依赖的独立页面。这些页面与主聊天工作区解耦，可安全地单独迁移，不影响核心功能。

每个迁移的页面通过 feature flag 控制，支持灰度发布和快速回退。

---

## 目标

### 主要目标

1. **Login 页面 React 重写**：表单验证、密码恢复、账户锁定
2. **Setup 页面 React 重写**：首次设置、密码设置
3. **Settings 面板 React 重写**：将当前分散在 `User Settings`、`API Connections`、`Advanced Formatting` 和 `AI Response Configuration` 设置子集中的能力收口为统一 React 设置入口

### 非目标

- ❌ 迁移主聊天工作区
- ❌ 迁移角色库、世界信息、背景库、Persona Management（属于 Phase 2 或独立面板）
- ❌ 修改后端 API 端点

---

## Sprint 列表

| Sprint | 工期 | 目标 | 风险 |
|---|---|---|---|
| [Phase 1 Sprint 1: Login 页面 React 重写](phase1-sprint1-login-page.md) | 2 周 | 迁移登录和密码恢复 | 低 |
| [Phase 1 Sprint 2: Setup 页面 React 重写](phase1-sprint2-setup-page.md) | 2 周 | 迁移首次设置流程 | 低 |
| [Phase 1 Sprint 3: Settings 面板 React 重写](phase1-sprint3-settings-panel.md) | 4 周 | 收口多个 legacy settings drawers 为统一设置入口 | 中 |

---

## 架构决策

### Feature Flag 驱动迁移

每个页面通过配置开关控制：

```yaml
# config.yaml
features:
  react:
    pages:
      login: true       # 当前默认开启，/login.html 仍保留回退
      setup: false
      settings: false
```

### 双版本共存

迁移期间，React 和 jQuery 版本同时可用：

```
/login       → React 版本（feature flag 开启时）
/login.html  → jQuery 版本（回退）
```

### API 契约保持不变

所有页面复用现有 API：
- `POST /api/users/login`
- `POST /api/users/recover-step1`
- `POST /api/users/setup`
- `GET /api/settings`
- `POST /api/settings`

---

## 迁移模式

### 标准迁移流程（每个页面）

#### 1. 设计阶段（2-3 天）
- 阅读现有 `public/scripts/{page}.js` 逻辑
- 识别状态、副作用、API 调用
- 设计 React 组件结构

#### 2. 实现阶段（1 周）
- 创建 `app/routes/{page}.tsx`
- 用 TanStack Form + Zod 处理表单
- 用 TanStack Query 管理 API 请求
- 复制现有样式（或用 Tailwind 重写）

#### 3. 测试阶段（2-3 天）
- 单元测试（React Testing Library）
- E2E 测试（Playwright）
- 兼容性测试（保持现有 E2E 通过）

#### 4. 灰度发布（3-5 天）
- feature flag 开启，仅 Beta 用户可见
- 收集反馈，修复 Bug
- 性能监控

#### 5. 全量发布（1-2 天）
- feature flag 全量开启
- 监控错误率
- 准备回退方案

#### 6. 清理旧代码（1-2 周后）
- 删除 `public/{page}.html`
- 删除 `public/scripts/{page}.js`
- 更新文档

---

## 验证门

### Phase 1 完成标准

- [x] ✅ Login 页面 React 版本上线
- [x] ✅ Setup 页面 React 版本上线
- [x] ✅ Settings 面板 React 版本上线
- [x] ✅ 所有现有 E2E 测试通过
- [x] ✅ 性能不劣化（对比 jQuery 版本）
- [x] ✅ 用户反馈收集完成

### 关键指标

- E2E 测试通过率：100%
- 页面加载时间：< 1s（P95）
- API 请求成功率：> 99.9%
- 用户满意度：≥ 当前基准

---

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|---|---|---|---|
| 表单验证逻辑差异导致 Bug | 中 | 中 | 充分测试边界情况，保持验证规则一致 |
| API 响应格式变化 | 高 | 低 | 不修改后端，仅前端迁移 |
| 用户习惯改变（UI 差异） | 中 | 中 | 保持 UI 布局和交互一致，灰度发布收集反馈 |
| 性能劣化 | 中 | 低 | 性能基准测试，优化 React 渲染 |

---

## 依赖

### 前置条件

- ✅ Phase 0（基础设施准备）已完成

### 阻塞项

- 无（Phase 1 不依赖其他 Phase）

---

## 交付物

### 代码变更

```
新增：
├─ app/routes/
│  ├─ login.tsx                   # Login 页面
│  ├─ setup.tsx                   # Setup 页面
│  └─ settings.tsx                # Settings 入口和四个 tabs
├─ app/components/
│  ├─ login/
│  │  ├─ LoginForm.tsx
│  │  └─ RecoveryForm.tsx
│  ├─ setup/
│  │  └─ SetupForm.tsx
│  └─ settings/
│     ├─ SettingsTabs.tsx
│     ├─ SettingsSection.tsx
│     └─ SettingField.tsx
├─ app/lib/
│  └─ settings-helpers.js         # Settings 字段映射和保存整形
└─ tests/
   ├─ login-react-route.test.js
   ├─ setup-react-route.test.js
   └─ settings-react-route.test.js

保留（回退）：
├─ public/login.html
├─ public/setup.html
└─ public/scripts/
   ├─ login.js
   └─ setup.js
```

### 文档更新

- ✅ Phase 1 所有 Sprint specs 已按当前交付状态更新
- ✅ Feature flag 使用状态记录在各页面语义文档和 React 现代化路线图中
- ✅ `/login.html`、`/setup.html`、legacy `/` fallback 边界记录在页面语义文档中

---

## 参考资料

- [React 现代化路线图](../../tech/react-modernization-roadmap.md)
- [前端 jQuery 切片迁移](../../tech/frontend-jquery-slice-migration.md)
- [TanStack Form 文档](https://tanstack.com/form/latest)
- [TanStack Query 文档](https://tanstack.com/query/latest)

---

## 下一步

完成 Phase 1 后，进入：

👉 [Phase 2: 侧边栏和面板迁移](../react-phase2-sidebars/README.md)
