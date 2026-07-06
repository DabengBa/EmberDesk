# Legacy Cutover And Deletion Gates

## 意图与核心流程

本规格定义每个 legacy owner、fallback path、public export 和 compatibility surface 的最终处理门：删除、冻结长期支持，或保留为明确 compatibility facade。

主路径是：前序 specs 完成后，维护者运行 cutover ledger，逐项确认 React owner 是否覆盖用户可见流程、兼容测试是否通过、第三方扩展是否仍可工作，然后删除不再需要的 legacy path 或把它标记为长期支持 facade。

## 范围 / 不做范围

本次做：

- 建立 legacy cutover ledger，覆盖 shell/drawer、Character/Group authoring、World Info、Backgrounds、Extensions、main-chat visible owner、public globals。
- 对每一项 legacy path 标注：`delete`、`freeze-supported`、`compatibility-facade`、`blocked`。
- 为 delete 项定义必须先通过的 E2E、unit、compat、docs gate。
- 为 freeze-supported 项定义 owner 文档、测试和不可破坏边界。
- 更新 roadmap、PROJECT_HISTORY、ADR 或 semantic docs，使“真实替换完成”有可审计记录。

本次不做：

- 不删除仍被 JS-Slash-Runner 或 protected extension surface 直接依赖的 API。
- 不删除 `globalThis.SillyTavern`、`eventSource`、`event_types`、`@sillytavern/*`，除非另有 ADR 和迁移窗口。
- 不把未完成前序 specs 的 legacy path 标记为 delete。

## 边界规则 / 验收

- 每个 legacy path 必须有 ledger entry 和处理结果。
- `delete` 项必须有代码删除、测试更新、文档更新和回归验证。
- `freeze-supported` 项必须明确长期 owner、测试 gate 和允许变更条件。
- `compatibility-facade` 项必须说明它服务的 public/extension contract，不能继续作为隐藏第二套产品实现。
- 所有 cutover 之后，用户从 `/` 完成日常 workspace flow 时不应遇到两个并列 owner 争抢同一区域。
- 如果任何 protected extension test 或 JS-Slash-Runner evidence 失败，相关 deletion 必须回滚到 `blocked` 或 `freeze-supported`。

## 架构 / 约束

- 本规格依赖 `260706-01` 至 `260706-04` 完成。
- ADR-0007 仍是 React islands with legacy fallbacks 的历史决策；如本规格将某些 fallback 删除或长期冻结，需要更新 ADR 或新增 ADR 记录后续 owner 状态。
- `.docs/db` 是用户可见语义 owner；每个删除或冻结结果都必须反映到相关 page/feature/term。
- `tests/third-party-extension-compatibility.test.js` 是 compatibility hard gate。

## 数据 / 集成

- 不新增 runtime 数据。
- cutover ledger 可以是 `.docs/tech/` 文档或 `.docs/specs/.../cutover-ledger.md`，但最终 durable 事实必须进入 `.docs/tech`、`.docs/db`、`.docs/PROJECT_HISTORY.md` 或 ADR。
- 删除代码前必须确认不再有 import、DOM selector、event listener 或 extension consumer。

## 验证

- `bun run test:compat`
- `bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js react-state-stores.test.js global-compatibility-bridge.test.js character-list-structure.test.js world-info-card-rendering.test.js --runInBand`
- `bun run --cwd tests test:e2e -- workspace-shell-panel-navigation.e2e.js chat-message-rendering.e2e.js chat-message-layout.e2e.js --workers=1`
- `bun run docs:check`
- `bun run build:react`
- `bun run build:react:workspace-panels`
- `bun run build:react:character-library`
- 手动验证：角色选择、角色编辑、群组编辑、World Info、Backgrounds、Extensions、Settings、main chat、extension protected mount points。

## Doc ID 契约

- `feature.next_workspace_shell`：最终 owner/fallback 状态。
- `page.chat_workspace`：最终 workspace owner 状态。
- `feature.character_library_panel`、`feature.world_info_panel`、`feature.background_library_panel`、`feature.extension_panel_open`：各自 cutover 结果。
- `term.shared_browser_library`：public compatibility facade 结果。
- 如新增 ledger 文档，应在 `.docs/PROJECT_HISTORY.md` 链接。

## 参考资料

- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/next-workspace-shell.md`
- `tests/third-party-extension-compatibility.test.js`
- `tests/global-compatibility-bridge.test.js`
- `public/script.js`
- `app/workspace-panels.tsx`
- Inference: 真正完成 replacement 的证据不是“React path 存在”，而是 legacy path 已被删除、冻结为公共 facade，或被明确标记为 blocked。
