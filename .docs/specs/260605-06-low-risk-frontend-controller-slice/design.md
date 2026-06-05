# Low-Risk Frontend Controller Slice

## 意图与核心流程

意图：选择一个非主聊天、非 message rendering、非 extension 的小型 frontend surface，沿用 login/setup controller pattern，把 page/panel-local 行为抽成可测试 controller。

主要触发条件：用户打开一个低风险 panel 或 toolbar surface，模块初始化事件绑定、读取当前 DOM 状态、执行局部 UI action，然后 cleanup。

主路径：

1. 先选择一个有明确 root element 的 surface。
2. 抽出纯 helper，覆盖状态判断、label/visibility/disabled 决策。
3. 创建 `createXController(root, dependencies)`，通过 explicit root 绑定局部 listeners。
4. 暴露 `initXPanel()` 或 `initXPage()`，生产环境沿用现有加载顺序。
5. tests 通过 injected dependencies 和 cleanup 证明行为。

## 范围 / 不做范围

范围：

- 只选一个低风险 frontend panel/toolbar root。
- 复用 `frontend-jquery-slice-migration.md` 的 pattern：pure helpers、controller initializer、dependency injection、AbortController cleanup。
- 保持 DOM selectors、copy、request paths、payload shape 和 visible flow 不变。
- 补 focused unit test；如果 visible browser behavior 变化，补 Playwright proof。

不做范围：

- 不抽 main chat workspace controller。
- 不碰 message rendering、streaming、slash-command parser、regex internals、extension mount points、`@sillytavern/*` aliases。
- 不移除 jQuery global 或引入 framework。
- 不重排 startup `APP_READY`。

## 边界规则 / 验收

验收项：

- controller 初始化只依赖指定 root，不使用 broad `document` binding 作为默认方案。
- required elements 缺失时 fail fast 或显式返回错误，不静默半初始化。
- listeners/timers 可 cleanup。
- helper tests 覆盖 disabled、loading、empty、success、error 中与该 surface 相关的状态。
- visible behavior 与现状一致，除非 design 后续修订批准。

失败边界：

- 如果候选 surface 依赖 extension mount point、global shell mutation 或 message renderer，放弃该候选，重新选择更小 surface。
- 如果 UI copy 或 workflow 必须改变，停止并更新 `.docs/db` owning docs。

## 架构 / 约束

本切片沿用已交付 login/setup page controller 边界。

硬约束：

- EmberDesk frontend 继续是 HTML/CSS/jQuery。
- `public/script.js` 仍是 main browser shell 和 compatibility surface。
- `eventSource`、`event_types`、`globalThis.SillyTavern`、`public/lib.js` 和 `@sillytavern/*` 不在本切片变更。

候选选择原则：

- root element 明确。
- dependencies 可注入。
- 不需要改变 server API。
- 不依赖 message rendering 或 extension lifecycle。

## 数据 / 集成

输入：

- panel/page root DOM
- injected request/event dependencies
- existing localized copy and current DOM state

输出：

- 同现状的 DOM state updates 和 API calls
- cleanup function

迁移事项：

- 不涉及数据迁移。
- 不改变 API schema。

## 验证

最低验证：

```powershell
bun run --cwd tests test:unit -- login-page-controller.test.js setup-page-controller.test.js --runInBand
bun run lint
```

delivery 必须新增候选 surface 的 focused controller test。

如果 visible browser behavior 变化，额外运行对应 Playwright test；如果触碰 compatibility surface，额外运行：

```powershell
bun run test:compat
```

## Doc ID 契约

默认不新增 Doc ID。候选 surface 的 owning Doc ID 需要在 implementation plan 中明确。

可能相关 IDs：

- `page.chat_workspace`
- `feature.world_info_panel`
- `feature.background_library_panel`
- `feature.extension_panel_open`

如果 user-visible flow、copy、empty/error/loading state 改变，必须更新 owning `.docs/db` 页面或功能文档。

## 参考资料

- `.docs/tech/frontend-jquery-slice-migration.md`
- `.docs/tech/modernization-roadmap.md`
- `.docs/tech/modernization-phase1-complexity-map.md`
- `.docs/PROJECT_HISTORY.md`
- `public/scripts/login.js`
- `public/scripts/setup.js`
- `tests/login-page-controller.test.js`
- `tests/setup-page-controller.test.js`
