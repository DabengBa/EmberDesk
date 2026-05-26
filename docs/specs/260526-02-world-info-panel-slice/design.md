# World Info 低风险面板 Slice 设计

## 意图与核心流程

本设计将 World Info 面板继续拆成低风险 UI slice，只调整全局激活区、编辑器面板、卡片折叠和内容编辑器的展示与绑定层，不改变世界书扫描、注入、持久化和 regex 语义。

主要触发条件是用户打开顶部 World Info 抽屉，选择全局世界书，切换 Activation Rules，展开条目卡片，编辑标题、状态、位置、内容或底部控制项。主路径为：用户打开 World Info，选择或切换世界书，展开条目，编辑字段并保存；关闭或折叠后再次打开，字段、状态和 Select2 标签保持一致。

## 范围 / 不做范围

本次范围：

- 继续收敛 `#WorldInfo` 抽屉、`#wiGlobalPanel`、`#wiEditorPanel`、`#wiTopBlock`、`#world_editor_select`、`.world_entry`、`.world_entry_edit` 的低风险 UI 结构。
- 优化卡片折叠/展开、内容预览、内容编辑 modal、全局选择器标签刷新和移动端抽屉可达性。
- 只在 `public/scripts/world-info.js` 中整理 UI 绑定、局部 helper 和 DOM 更新顺序。
- 继续用 `tests/world-info-card-rendering.test.js` 锁定结构和行为契约。

不做范围：

- 不改 world info 扫描算法、递归规则、注入位置语义、token budget 或 prompt assembly。
- 不改 regex placement、Tavern Helper 世界书函数或 `@sillytavern/scripts/world-info` 导出。
- 不迁移数据格式，不改 `data.entries[uid]`、world 文件 schema 或后端 API。
- 不把 World Info 重写成独立组件框架。

## 边界规则 / 验收

- 打开 World Info 抽屉时，它在桌面、移动端和窄屏下都可达，不被角色抽屉或右侧导航遮挡。
- 全局世界书选择器应显示明确空状态，占位文案和 Select2 已选标签在 option replay 后保持同步。
- Activation Rules 与 Entry Editing 保持视觉和结构分离，用户能识别“全局启用”和“编辑条目”是不同区域。
- 折叠卡片必须暴露显式展开按钮、状态开关、位置控件和标题摘要；不依赖隐藏点击目标。
- 展开卡片必须保留现有字段编辑能力；内容编辑 modal 打开时不被抽屉裁剪，关闭后 DOM 回到原位置。
- 内容编辑 modal 若继续使用自定义 portal，必须提供 `role="dialog"`、可访问名称、焦点进入和关闭后焦点恢复；背景交互需要由 JavaScript 管理，不能只添加 ARIA 属性。
- 内容编辑 modal 的 Escape、取消、保存和点击外部行为必须明确，不得导致未保存内容静默丢失。
- 保存规则不变：字段修改仍写回当前 `data.entries[uid]`，并走现有保存链路。
- empty/loading/error：无世界书或无条目时展示现有空状态；加载期间不能破坏当前选择；保存失败沿用现有错误提示。
- 失败边界：如果局部 UI helper 报错，不能改变世界书文件内容或触发错误保存。

## 架构 / 约束

- `public/scripts/world-info.js` 仍是 World Info 前端主模块；本 slice 只抽 UI 绑定层，不移动核心扫描逻辑。
- `getWorldInfoSettings()` 代表设置快照边界，输出结构不得因 UI 重排改变。
- `setupEditFormBindings()` 是编辑表单绑定集中点；拆分 helper 时必须保持绑定顺序、事件命名和 `uid` 关联清晰。
- `public/panels/world-info-body.html` 和 `public/index.html` 的模板结构可以局部调整，但需要测试锁定关键 ID/class。
- `public/css/world-info.css` 只做面板局部样式，不影响全局抽屉或其他设置面板。
- Select2 option replay 只应触发 `change.select2` 更新 Select2 自身标签，避免误触发业务 `change` handler 导致保存或扫描副作用。
- 抽屉和内容 modal 的浏览器测试优先使用 role/name locator；只有验证现有模板 ID/class 时才使用 CSS selector。
- 涉及世界书和 Tavern Helper 兼容边界时必须运行 `bun run test:compat`。

## 数据 / 集成

- 输入是现有 world info 文件、`world_info` 全局激活设置、当前编辑器选择、条目 `uid` 和表单字段值。
- 输出是现有 world info 设置和文件保存结果；不新增存储键。
- 第三方集成依赖 `@sillytavern/scripts/world-info` 和 Tavern Helper 世界书函数，导出名称和行为不能因 UI slice 改变。
- 兼容风险集中在世界书关键字/regex 编辑、条目 uid、Select2 replay 和 content editor DOM 移动。

## 验证

自动化验证：

```powershell
bun run --cwd tests test:unit -- world-info-card-rendering.test.js --runInBand
bun run test:compat
```

按实际改动补充或更新：

- `tests/world-info-card-rendering.test.js` 覆盖全局选择器空状态、标签刷新、抽屉优先级、移动端可达、卡片折叠/展开、内容 editor portal。
- 若触碰 module export 或扩展边界，更新 `tests/third-party-extension-compatibility.test.js`。
- 浏览器验证：打开 World Info，选择全局世界书，展开条目，编辑内容 modal，折叠再展开，刷新后确认值保留。

完成证据：

- World Info focused test 通过。
- `bun run test:compat` 通过。
- 浏览器中全局激活区、编辑区和条目卡片没有重叠或状态错位。

本次执行切片：

- 优先处理 launch-blocking 的 content editor modal 可访问名称和焦点恢复风险。
- 模板为 `.wi-content-editor-modal` 增加 `aria-labelledby`，并为 `.wi-content-editor-title` 提供默认 ID。
- `setupEditFormBindings()` 为每个条目生成唯一 content editor 标题 ID，并将 dialog 的 `aria-labelledby` 指向该标题。
- 保留既有 portal、Escape 关闭、backdrop 关闭和关闭后回到 opener 的行为。

## Grill 结论 / 风险处置

- 自问：是否应该把 `world-info.js` 中的扫描、保存和 UI 绑定一起拆模块？推荐答案：不做。本 slice 的目标是低风险面板拆分，扫描和持久化语义是扩展风险区。
- 自问：内容编辑 modal 是否应该直接迁移到原生 `<dialog>`？推荐答案：本 slice 不强制。MDN 说明 `showModal()` 会带来隐式 `aria-modal`，但迁移会改变现有 portal 和样式行为；可以作为后续独立 slice。
- Tiger（launch-blocking）：把 `change.select2` 改成普通 `change` 会触发其他监听器，可能导致重复保存、标签错乱或扫描副作用。缓解：测试中继续断言 `change.select2`，浏览器验证 option replay。
- Tiger（launch-blocking）：modal portal 后焦点丢失或背景仍可操作，会让键盘用户困在抽屉或误改字段。缓解：实现必须测试打开、Tab、Escape/关闭、保存后焦点返回。
- Paper Tiger：World Info 卡片视觉密度增加会让实现看起来“必须重构全部模板”。可管理原因：现有 `world-info-card-rendering.test.js` 已经锁了卡片 shell、展开和 content editor，可按局部 DOM 组织推进。
- Elephant：World Info 是内置功能、扩展 API 和 Tavern Helper 脚本共同使用的表面。执行时需要先声明“只改 UI 绑定层”，否则很容易把 prompt 注入语义一起带进 PR。

## Doc ID 契约

- 页面绑定：`.docs/db/pages/chat-workspace.md` 或 World Info 页面/面板文档需要描述 World Info 抽屉、全局激活区和编辑区。
- 功能绑定：World Info 全局激活、条目编辑、内容编辑 modal 应作为用户可见功能绑定。
- 兼容绑定：`docs/third-party-extension-compatibility.md` 中的 `@sillytavern/scripts/world-info` 和 world-info keyword / regex editing 风险保持有效。
- 验证期望：实现后运行 docs check/build；如果只调整 UI 结构且文档语义不变，应在交付记录说明无新增 Doc ID。

## 参考资料

- `docs/third-party-extension-compatibility.md`
- `public/scripts/world-info.js`
- `public/panels/world-info-body.html`
- `public/index.html`
- `public/css/world-info.css`
- `tests/world-info-card-rendering.test.js`
- `tests/third-party-extension-compatibility.test.js`
- Select2 events documentation — https://select2.org/programmatic-control/events
- WAI-ARIA APG Modal Dialog Pattern — https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- MDN `<dialog>` element — https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
- Playwright Locators — https://playwright.dev/docs/locators
- Inference：低风险 World Info slice 应避开扫描与 regex 语义，因为兼容文档明确把 world-info keyword / regex editing 列为高风险区域。
