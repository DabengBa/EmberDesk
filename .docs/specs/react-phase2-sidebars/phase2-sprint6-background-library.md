# Phase 2 Sprint 6: 背景库面板

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-2-侧边栏和面板迁移5-个月)
- **Phase**：[Phase 2 - 侧边栏和面板迁移](README.md)
- **Sprint**：Phase 2 Sprint 6（全局 Sprint 13/40）
- **预计工期**：2 周
- **风险等级**：低

---

## 目标

用 React 重写背景库面板。

### 主要交付物

1. 创建 `app/components/background-library/BackgroundGrid.tsx`
2. 背景上传/删除/重命名
3. 背景选择和应用
4. 缩略图懒加载

### 成功标准

- ✅ 背景列表正常显示
- ✅ 上传/删除/重命名功能正常
- ✅ 背景选择即时生效
- ✅ `background-panel-controller.test.js` 通过

---

## 背景

### 已有基础设施

`public/scripts/background-panel-controller.js` 已抽取了加载状态控制器，可直接复用：
- `getBackgroundPanelState()` - 状态分类
- `createBackgroundPanelController()` - 控制器创建
- `setBackgroundCatalogLoading()` - 加载指示器

---

## 实施步骤

1. 用 TanStack Query 获取 `/api/backgrounds`
2. 实现 BackgroundGrid 网格布局
3. 实现上传/删除/重命名对话框
4. 缩略图懒加载
5. 与 `/api/backgrounds/*` API 集成

---

## 验证清单

- [ ] 背景列表正常显示
- [ ] 上传/删除功能正常
- [ ] 缩略图懒加载正常
- [ ] `bun run test:compat` 通过

---

## Phase 2 总结

✅ Sprint 1: 角色库列表基础  
✅ Sprint 2: 角色库搜索过滤  
✅ Sprint 3: 角色库批量操作  
✅ Sprint 4: 世界信息编辑器  
✅ Sprint 5: 世界信息导入导出  
✅ Sprint 6: 背景库面板  

---

## 下一步

👉 [Phase 3: 主聊天工作区迁移](../react-phase3-main-chat/README.md)
