# Phase 2 Sprint 7: Extensions 面板宿主

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-2-侧边栏和面板迁移5-个月)
- **Phase**：[Phase 2 - 侧边栏和面板迁移](README.md)
- **Sprint**：Phase 2 Sprint 7（全局 Sprint 14/40）
- **预计工期**：3 周
- **风险等级**：高

---

## 目标

将主工作区中的 `Extensions` drawer 宿主 UI 迁移到 React，同时保持第三方扩展挂载点和兼容性表面稳定。

### 主要交付物

1. 创建 `app/components/extensions-host/ExtensionsPanel.tsx`
2. 迁移 `Extensions` drawer 的宿主头部和布局
3. 保持 `#extensions_settings`、`#extensions_settings2`、`#regex_container`、`#extensionsMenuButton`、`#extensionsMenu` 等受保护挂载点
4. 保留 `Manage extensions`、`Install extension`、Extras API 区域和连接状态
5. 不改变第三方扩展自身内部实现和挂载协议

### 成功标准

- ✅ `Extensions` 面板可正常打开
- ✅ 现有扩展内容仍可挂载到受保护容器
- ✅ `Manage extensions` / `Install extension` 入口正常
- ✅ Extras API 连接区可正常使用
- ✅ `bun run test:compat` 通过

---

## 背景

### 现有实现

当前 `Extensions` 是主工作区中的独立 drawer，而不是设置面板的一部分。它同时承担两种职责：

1. **用户可见宿主 UI**：标题、通知更新开关、管理/安装入口、Extras API 区域
2. **第三方扩展挂载宿主**：多个 `extension_container` 和兼容挂载点

这意味着本 Sprint 的迁移对象是“宿主面板”，不是把所有 extension 内部设置界面都一并重写为 React。

### 受保护挂载点

以下挂载点属于兼容性边界，迁移时必须保留：

- `#extensions_settings`
- `#extensions_settings2`
- `#regex_container`
- `#extensionsMenuButton`
- `#extensionsMenu`

其中 `#extensions_settings` / `#extensions_settings2` 当前承载多个内置和第三方扩展容器；`#regex_container` 还属于现有 regex 扩展兼容表面。

---

## 技术设计

### React 边界

- React 负责 drawer 宿主结构、标题区、按钮区、Extras API 区域和宿主布局
- 现有扩展脚本继续向受保护 DOM 容器挂载内容
- 不在本 Sprint 中重写各扩展内部 `settings.html` / `button.html` / `window.html`

### 组件结构

```
app/components/extensions-host/
├─ ExtensionsPanel.tsx          # drawer 宿主入口
├─ ExtensionsToolbar.tsx        # 标题、通知、管理/安装按钮
├─ ExtensionsMountColumns.tsx   # 两列挂载容器
└─ ExtrasApiSection.tsx         # Extras API 区域
```

### 状态管理

- 用 React 本地状态或轻量 store 管理 drawer 开关、宿主加载状态和 Extras API 表单
- 与第三方扩展相关的运行时状态继续通过现有兼容层和挂载协议暴露
- 若需要请求扩展目录或连接状态，优先复用现有 API / 事件，不引入新的扩展注册协议

---

## 实施步骤

1. 识别并冻结 `Extensions` drawer 的宿主 DOM 契约
2. 用 React 重建宿主布局，但保留受保护挂载点 ID
3. 迁移头部控制区：通知更新、管理扩展、安装扩展
4. 迁移 Extras API 区域：URL、API key、连接状态、自动连接
5. 验证内置扩展和第三方扩展仍可向宿主容器挂载
6. 运行兼容性测试和真实浏览器验证

---

## 验证清单

- [ ] `Extensions` drawer 打开和关闭正常
- [ ] `#extensions_settings` / `#extensions_settings2` / `#regex_container` 保持可挂载
- [ ] `#extensionsMenuButton` / `#extensionsMenu` 行为未破坏
- [ ] `Manage extensions` / `Install extension` 入口正常
- [ ] Extras API 连接区正常
- [ ] 至少 3 个常用扩展挂载验证通过
- [ ] `bun run test:compat` 通过

---

## 与其他 Phase 的边界

- **本 Sprint 负责**：用户可见 `Extensions` 面板宿主 React 化
- **Phase 4 负责**：状态管理兼容层和扩展迁移指南
- **Phase 6 负责**：长期兼容层维护、废弃策略、社区支持

---

## 下一步

👉 [Phase 3: 主聊天工作区迁移](../react-phase3-main-chat/README.md)
