# Phase 2 Sprint 3: 角色库面板 - 批量操作

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-2-侧边栏和面板迁移5-个月)
- **Phase**：[Phase 2 - 侧边栏和面板迁移](README.md)
- **Sprint**：Phase 2 Sprint 3（全局 Sprint 10/40）
- **预计工期**：2 周
- **风险等级**：中

---

## 目标

实现角色库的批量选择、删除和标签管理。

### 主要交付物

1. 批量选择 UI（checkbox）
2. 批量删除功能
3. 批量标签添加/移除
4. 保持 `.bulk_select_checkbox`、`.tags_inline` DOM 选择器

### 成功标准

- ✅ 批量选择功能正常
- ✅ 批量删除有确认对话框
- ✅ 批量标签操作正常
- ✅ `character-list-structure.test.js` 通过

---

## 实施步骤

1. 扩展 Zustand store 添加 `selectedIds: Set<string>`
2. 实现 checkbox 选择逻辑
3. 实现批量删除对话框和 API 调用
4. 实现批量标签操作
5. 保持 `.bulk_select_checkbox` DOM 兼容性

---

## 验证清单

- [ ] 全选/取消全选正常
- [ ] 批量删除确认对话框正常
- [ ] 删除后列表刷新正确
- [ ] `bun run test:compat` 通过

---

## 下一步

👉 [Phase 2 Sprint 4: 世界信息面板 - 编辑器](phase2-sprint4-world-info-editor.md)
