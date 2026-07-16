---
created: 2026-07-16
source: user
confirmed: true
last_updated: 2026-07-16
feature_slug: world-info-workbench-restructure
status: delivered
---

# World Info Workbench Restructure Intent

## 原始请求

用户要求审查“世界书”面板的内容与结构，并明确允许不计既有布局成本地重新整理、编排和重构。

## 目标结果

把同入口 World Info 抽屉整理成一个清晰、单一可见 owner 的编辑工作台：全局激活与书本编辑不再混杂；
书本、条目列表和单条编辑各有稳定位置；移动端不会把编辑器推到不可达区域；高级字段只在需要时出现。
这次重组只替换可见交互与布局，不重写 World Info 的扫描、正则、导入、删除和持久化语义。

## Checkpoint A

- **目标结果**：在现有 `/` workspace drawer 内交付一个可用于日常大量 lorebook 编辑的 World Info
  workbench，并消除可见层的重复 selector、搜索、排序和操作入口。
- **当前状态**：`public/index.html` 中 `#wi-holder` 在 `#wiEditorPanel` 之前关闭，浏览器会把编辑器
  重排为预期工作台容器的兄弟节点；`ensureWorldInfoReactHost()` 把 React host 插入编辑器前，
  而 legacy `world-info-body` 仍显示，React shell 开启时形成两套 selector/search/sort/action；
  移动端仅让 `#wi-holder` 滚动，展开的全局规则可将编辑器推到视口外。
- **假设**：用户授权的是第一可交付切片的完整可见工作台重组，而不是新增独立页面、替换 World Info
  行为内核或清理兼容 API。
- **硬约束**：保持同一入口、受 `features.react.shell.takeover` 和
  `features.react.panels.worldInfo` 双开关保护；不新增依赖或 SPA route；`public/scripts/world-info.js`
  继续作为 prompt activation、regex、converter/import、delete cascade、保存和兼容导出的唯一行为
  facade；锁定的 Character Management 仍须与 World Info 并存；`vectorized` 仅作无损兼容数据。
- **风险边界**：直接删除 legacy DOM 会破坏 deferred-panel replay、已有 selector/entry DOM 或扩展
  邻接行为；让 React 重实现业务会制造第二套 prompt/import/delete 逻辑；只以源码字符串测试无法证明
  可见 owner、containment、移动端滚动和本地化是否正确。
- **未决问题**：无。现有产品语义和已批准的 React island 边界足以确定本次第一个交付切片。
- **推荐默认**：React 在 flag-on 正常路径成为唯一可见 workbench owner；legacy DOM 留作隐藏适配、
  deferred/replay 和 flag-off/build-failure 回滚边界。通过一个窄的 facade snapshot/action seam 复用
  既有业务，而非引入第二个 World Info runtime。

## 范围边界

- 重建 World Info 可见信息架构：紧凑的全局激活摘要、可展开的 activation rules、单一书本标题栏、
  条目列表与单条编辑器。
- 桌面端让条目列表与编辑器并置；移动端在“列表”和“编辑条目”之间切换，不纵向堆叠两个长面板。
- 将复杂字段按激活、注入、概率/时序、范围/条件分组为渐进披露区，并为非默认值给出可扫描摘要。
- 明确 loading、empty、success、error、import busy、保存失败、已删除条目与回退路径。
- 补充结构、compat、浏览器和语义文档验证。

本切片不包括：

- 不建立 `/workspace-next`、独立 World Info route、全站 SPA 或新前端依赖。
- 不重写 World Info scan、prompt token budgeting、regex placement、slash commands、导入转换、
  World-book/character delete cascade、API payload 或 canonical SQLite/file projection。
- 不改变全局激活与编辑书本选择相互独立的产品语义。
- 不把 `vectorized` 重新暴露为可用能力，也不迁移、归零或丢失该兼容字段。
- 不在本次顺手删除 legacy facade、`eventSource`、`event_types`、`@sillytavern/*` 或受保护扩展边界。

## 变更历史

- 2026-07-16：基于用户授权建立可实施的 World Info workbench 重构方向。此方向延续 ADR-0007 的
  same-entry guarded island，而不是推翻其 React/legacy 兼容边界。

## 参考资料

- `DESIGN.md`
- `public/index.html`
- `public/panels/world-info-body.html`
- `public/css/world-info.css`
- `public/script.js`
- `public/scripts/world-info.js`
- `app/workspace-panels.tsx`
- `tests/world-info-card-rendering.test.js`
- `.docs/db/features/world-info-panel.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/legacy-cutover-ledger.md`
- `.docs/tech/briefs/260629-03-world-info-facade-context.md`
- Inference：以“隐藏 adapter + 单一 facade”承接遗留 DOM，是由 ADR-0007 的 fail-closed
  同入口回退要求、legacy cutover ledger 的 `compatibility-facade` 判定，以及现有
  `world-info.js` helper 路由共同推导出的最小风险实现方式。

## 交付追溯

- 状态：delivered
- 用户可见：同入口 World Info 抽屉在 flag-on 下由 React workbench 单独可见拥有；桌面分栏、移动 list/editor 双态；全局激活摘要 + 扫描规则次级入口；高级字段渐进披露。
- 行为边界：`public/scripts/world-info.js` 仍是 scan/prompt/import/delete/save/`vectorized` 兼容唯一 facade。
- 文档：`.docs/db/features/world-info-panel.md`, `.docs/db/pages/chat-workspace.md`, `.docs/PROJECT_HISTORY.md`
- 代码：`app/world-info-workbench.tsx`, `public/script.js` host ownership, `public/index.html` containment
