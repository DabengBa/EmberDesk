# Default Owner Gate And ADR Package

## 意图与核心流程

本规格在前五个 takeover specs 完成后，汇总 evidence，判断 React shell 是否可以成为当前 `/` 的默认外层 owner，并准备 ADR-0007 的后续 update 或新 ADR。它不是实现新 UI 的阶段，而是默认 owner 切换前的决策和证据包。

主路径：

1. 收集 Phase A-C 的测试、E2E、compat、build、docs、性能和人工检查证据。
2. 对每个 surface 标记 owner 状态：React default owner、legacy compatibility substrate、legacy rollback owner、blocked。
3. 识别是否还有会阻塞默认 owner 的 Tigers。
4. 若证据满足门槛，更新 ADR 或创建新 ADR，说明 `/` 默认外层 shell owner 切换策略。
5. 若证据不足，保持 React shell behind flag，并明确下一批 blocker specs。

## 范围 / 不做范围

本次改变：

- 形成 default owner gate matrix。
- 更新或准备更新 ADR-0007 后续决策。
- 更新 `.docs/project-overview.md`、`.docs/PROJECT_HISTORY.md`、`.docs/db` owner state。
- 明确 legacy substrate 哪些长期保留、哪些后续可删除、哪些 blocked。

不做：

- 不在没有证据时默认开启 React shell。
- 不删除 `globalThis.SillyTavern`、`eventSource`、`event_types`、`@sillytavern/*`。
- 不删除 protected extension mount points。
- 不把 backend runtime、storage 或 provider protocol 纳入同一个 ADR。

## 边界规则 / 验收

- Gate matrix 覆盖 chrome、panel dock、main-chat layout/composer、responsive/recovery、startup、extensions/slash/regex/global compatibility。
- 每个 surface 都有明确 owner/fallback 状态。
- `JS-Slash-Runner` primary compatibility gate 通过或明确 blocked。
- 当前 `/` 默认 owner 切换有 rollback plan。
- 如果 gate 未通过，文档必须明确下一步 specs，而不是模糊写“未来处理”。

## 架构 / 约束

- ADR 只有在难以逆转、有真实取舍、未来读者会疑惑时才写；默认 owner 切换满足该条件。
- 不把 process spec 当 durable archive；完成后 durable facts 应进入 ADR、PROJECT_HISTORY、project overview、semantic docs。
- 证据必须来自现有 repo tests/build/docs/perf/browser proof，不能只凭主观体验。

Checkpoint A:

- **目标结果**：决定是否可以把 React shell 设为 `/` 默认外层 owner。
- **当前状态**：前置 takeover specs 应已交付。
- **假设**：compat substrate 长期保留，不作为默认切换 blocker。
- **硬约束**：无证据不切默认。
- **风险**：过早删除 rollback；ADR 写成愿望而非决策。
- **推荐默认方案**：证据满足则 ADR update；不满足则保持 flag 并列 blocker。

## 数据 / 集成

- 输入：测试结果、E2E 结果、compat gate、docs check、performance evidence、manual QA notes。
- 输出：owner gate matrix、ADR update、新/更新 docs。
- 存储：不新增 product storage。
- API：不新增 endpoint。

## 验证

至少汇总：

```bash
bun run build:react
bun run build:react:workspace-panels
bun run test:compat
bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js workspace-react-panel-flags.test.js chat-workspace-structure.test.js third-party-extension-compatibility.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-layout.e2e.js chat-message-rendering.e2e.js chat-message-streaming.e2e.js --workers=1
bun run docs:check
```

若声称性能不劣化，还需补充 startup/interaction runner 证据，具体命令由实际 touched surfaces 决定。

## Doc ID 契约

- `page.chat_workspace`
- `feature.next_workspace_shell`
- `feature.startup_bootstrap`
- `term.shared_browser_library`

Owner docs 需记录最终 default owner / compatibility substrate / rollback state。ADR 与 semantic docs 变更后必须运行 `bun run docs:check`。

## 参考资料

- `.docs/tech/briefs/next-workspace-shell.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/project-overview.md`
- `.docs/PROJECT_HISTORY.md`
- `.docs/db/pages/chat-workspace.md`
- Inference: 默认 owner gate 必须独立成 spec，因为它是难以逆转的架构决策，不应混在 UI 实现 PR 中。
