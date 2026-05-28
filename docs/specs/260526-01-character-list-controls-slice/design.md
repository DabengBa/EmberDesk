# 角色列表控件 Slice 设计

## 意图与核心流程

本设计将角色列表的排序、筛选、标签和批量操作菜单继续拆成小前端 slice，在不破坏角色列表 DOM 身份契约的前提下，提升控件可读性、状态反馈和回归防护。

主要触发条件是用户在左侧角色库中筛选、排序、点选标签、进入批量选择或打开批量菜单。主路径为：用户进入角色库，使用排序或标签筛选缩小结果，列表分页和空状态同步更新；用户进入批量模式后选择角色，计数、选中状态和批量菜单保持一致；退出批量模式后恢复普通浏览状态。

## 范围 / 不做范围

本次范围：

- 收敛 `#character_sort_order`、`.rm_tag_filter`、`.rm_tag_bogus_drilldown`、`#bulkEditButton`、`#bulkSelectedCount`、`#bulkSelectAllButton`、`#bulkDeleteButton` 的结构与状态规则。
- 保持 `printCharacters()`、`printCharactersDebounced()`、`entitiesFilter`、`BulkEditOverlay`、`bulk-edit.js` 的既有职责边界，必要时只做局部 helper 抽取。
- 为排序、标签筛选、空结果、批量菜单和选中状态补充结构测试或兼容测试。
- 保留现有视觉体系，只做控件密度、状态反馈、可访问标签和移动端可读性的局部改进。

不做范围：

- 不迁移到 React、Vue 或新 SPA 框架。
- 不改变角色加载 API、角色索引、头像缩略图、角色编辑表单或聊天状态。
- 不删除、重命名或替换角色行根节点和 legacy selector。
- 不重写 tag 系统、filter engine 或 bulk edit 的业务语义。

## 边界规则 / 验收

- 角色列表根结构保持可识别：`#rm_characters_block`、`#rm_print_characters_block`、`#rm_print_characters_pagination`、`#rm_button_bar` 必须继续存在。
- 角色行兼容契约保持稳定：`.character_select`、`.group_select`、`.bogus_folder_select`、`.character_select[data-chid]`、`.character_select[chid]`、`id="CharID${chid}"`、`.character_selected`、`.bulk_select_checkbox`、`.tags_inline`、`.ch_fav` 不得因本 slice 消失。
- 排序变更后，列表按现有排序规则刷新；当前筛选、搜索、分页文案和空状态不能互相覆盖。
- 标签筛选为空结果时，空状态必须提供清除筛选或搜索的恢复路径；清除动作应恢复完整列表。
- 批量模式开启时，所有可选角色行应暴露明确选中状态；批量计数应与实际选择数一致。
- 批量菜单的操作按钮在无选择、部分选择、全选、退出批量模式时有明确状态；禁用状态不能触发删除或批量修改。
- 移动端窄屏下，排序、搜索、标签和批量按钮不得重叠或截断关键文本。
- 可点击控件的可见目标尺寸应达到 WCAG 2.2 `2.5.8 Target Size (Minimum)` 的 24 by 24 CSS pixels；无法达到时必须记录例外原因。
- 键盘焦点不能被 sticky header、分页条、批量菜单或抽屉覆盖；焦点可见性至少满足当前项目既有 focus 样式，并避免 WCAG 2.2 `2.4.11 Focus Not Obscured` 失败。
- icon + text 控件的可访问名称必须与可见标签含义一致，避免违反 WCAG `2.5.3 Label in Name` 和 `4.1.2 Name, Role, Value`。
- 失败边界：如果筛选或批量菜单状态异常，必须优先保留可浏览列表和清除恢复入口，而不是阻塞角色库。

## 架构 / 约束

- 继续使用当前 HTML / CSS / jQuery 模式，不引入新的运行时依赖。
- `public/script.js` 仍负责全局角色列表刷新链路；本 slice 可以抽小纯 helper，但不能把列表状态复制到新的全局 store。
- `public/scripts/BulkEditOverlay.js` 继续作为批量选择和右键菜单状态的主拥有者。
- `public/scripts/bulk-edit.js` 继续负责 legacy checkbox 插入和兼容类名。
- `public/scripts/tags.js` 和 `public/scripts/filters.js` 仍是标签与过滤的现有集成点；本 slice 只调整角色列表调用面，不改变保存格式。
- UI 改动应保持当前 `style.css` 的角色列表区域风格，不新增卡片嵌套或大面积装饰。
- 动态角色行继续优先使用 jQuery delegated events；角色列表会分页、筛选和重建 DOM，直接绑定到行节点的事件容易在刷新后失效。
- 浏览器行为测试优先用可访问 locator，例如 Playwright `getByRole()` / `getByLabel()`；只有验证 legacy DOM 合约时才使用 CSS selector。
- 每个行为改动先补失败测试，再做最小实现；涉及兼容边界时必须前后运行 `bun run test:compat`。

## 数据 / 集成

- 输入来自现有角色、群组、tag、search query、sort order 和 `accountStorage`。
- 输出仍是 `#rm_print_characters_block` 内的角色、群组、tag、empty、hidden block DOM。
- 持久化仍走现有设置项和 `accountStorage`，不新增 schema。
- 第三方兼容依赖来自 `docs/third-party-extension-compatibility.md` 中的角色列表 DOM 合约。
- 与 Tavern Helper / JS-Slash-Runner 的关系是保留现有可读 DOM 和事件表面，不新增扩展 API。

## 验证

自动化验证：

```powershell
bun run test:compat
bun run --cwd tests test:unit -- character-list-structure.test.js --runInBand
bun run --cwd tests test:unit -- third-party-extension-compatibility.test.js --runInBand
```

需要按改动补充或更新的证明：

- `tests/character-list-structure.test.js` 覆盖排序、标签筛选、空状态恢复、批量菜单可见/禁用状态。
- `tests/third-party-extension-compatibility.test.js` 继续覆盖角色行 identity contract 和 `.bulk_select_checkbox`。
- 如改动影响真实点击路径，使用 Chrome DevTools MCP 验证：排序、标签筛选、清除筛选、批量选择、全选、退出批量模式。

完成证据：

- 受影响 focused tests 通过。
- `bun run test:compat` 通过。
- 浏览器中角色列表控件无重叠，状态与 DOM 属性一致。

本次执行切片：

- 优先处理 launch-blocking 的批量删除状态风险。
- `#bulkDeleteButton` 在无选择时进入 `.disabled` / `aria-disabled="true"` 状态。
- 删除按钮点击时二次检查禁用状态，避免无选择时打开删除流程。
- `BulkEditOverlay.updateSelectedCount()` 统一驱动批量操作按钮状态，避免计数和 destructive action 脱节。

## Grill 结论 / 风险处置

- 自问：是否应该把标签、筛选和批量状态统一成新的角色列表 store？推荐答案：不做。当前风险不是状态模型缺失，而是 DOM 合约和交互反馈容易漂移；新增 store 会扩大迁移面。
- 自问：是否应该把结构测试从静态文本匹配全部改成 JSDOM？推荐答案：分阶段做。当前静态测试适合锁 legacy 字符串契约；新增行为和层级断言应优先用 JSDOM 或浏览器测试。
- Tiger（launch-blocking）：破坏 `.character_select[chid]`、`.bulk_select_checkbox` 或 `id="CharID${chid}"` 会影响第一方代码和扩展邻近脚本。缓解：实现前后运行 `bun run test:compat`，并在 `third-party-extension-compatibility.test.js` 中保留 legacy selector 断言。
- Tiger（launch-blocking）：批量删除按钮在无选择或状态不同步时可触发破坏性操作。缓解：无选择时禁用并测试；删除入口必须重新读取当前选中集合。
- Paper Tiger：WCAG 24px target size 看起来会压缩当前紧凑布局。可管理原因：目标是最小点击区域，不要求放大所有视觉元素；可以用 padding 或 hit area 达成。若移动端仍发生重叠，它会升级为 Tiger。
- Elephant：角色列表既是产品 UI 又是扩展兼容表面，不能只按视觉目标重排。执行时需要明确“UI owner”和“compat owner”在同一个 PR 中共同验收。

## Doc ID 契约

- 页面绑定：`.docs/db/pages/chat-workspace.md` 或等价的 Chat Workspace 页面文档需要记录角色列表控件状态。
- 功能绑定：如存在或新增角色库/角色列表功能文档，应绑定排序、筛选、标签和批量选择用户流程。
- 术语绑定：角色列表 DOM 兼容边界仍由 `docs/third-party-extension-compatibility.md` 和 `.docs/db` 中对应兼容术语共同约束。
- 验证期望：实现后运行 docs build/check；若没有新增 `.docs/db` 条目，应在交付记录中说明沿用现有页面/兼容文档。

## 参考资料

- `docs/third-party-extension-compatibility.md`
- `docs/bun-workflow.md`
- `public/index.html`
- `public/script.js`
- `public/scripts/BulkEditOverlay.js`
- `public/scripts/bulk-edit.js`
- `public/scripts/tags.js`
- `public/scripts/filters.js`
- `public/scripts/character-list-state.js`
- `tests/character-list-structure.test.js`
- `tests/third-party-extension-compatibility.test.js`
- W3C WCAG 2.2: `2.4.11 Focus Not Obscured`, `2.5.8 Target Size (Minimum)`, `4.1.2 Name, Role, Value` — https://www.w3.org/TR/WCAG22/
- MDN ARIA overview — https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA
- jQuery Learning Center, Event Delegation — https://learn.jquery.com/events/event-delegation/
- Playwright Locators — https://playwright.dev/docs/locators
- Inference：角色列表后续 slice 应优先选择控件层，因为 2026-05-25 至 2026-05-26 的提交已稳定分页、搜索、网格和批量选择基础语义。
