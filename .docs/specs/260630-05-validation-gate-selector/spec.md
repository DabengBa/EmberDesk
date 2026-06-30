# Validation Gate Selector 规格

## 意图与核心流程

意图：把“触碰面 -> focused validation commands”的选择规则固化为轻量 selector，帮助后续 spec/实现阶段选择最低必要验证，不替换现有测试框架。

触发条件：实现 agent 准备修改 frontend compatibility、React panel、Express route、derived cache、docs/db 或 startup/config 等表面，需要快速选择验证命令。

主路径：
1. 开发者提供 touched surface 或文件路径。
2. selector 返回建议的 focused commands、必须 gates 和可选 broad gates。
3. 实现阶段按建议运行最小验证。
4. final review 仍根据实际 diff 判断是否需要追加命令。

Checkpoint A：
- 目标结果：降低验证选择遗漏。
- 当前状态：验证矩阵散落在 AGENTS、tech docs、ADR 和 briefs 中。
- 假设：第一步可以是文档化清单加只读 helper script，不需要 CI 集成。
- 硬约束：不替换 Jest、Playwright、docs compiler、Bun workflow。
- 风险：selector 被误用为唯一发布证明。
- 未决问题：无；默认 advisory-only。
- 推荐默认：新增 advisory selector，不改现有 package scripts 语义。

Grill 复核结论：
- 反证：不需要新测试框架、CI workflow 或自动 runner；目标是减少遗漏，advisory selector 已足够。
- 复用：继续使用 `package.json` 已有 Bun scripts、Jest、Playwright 和 docs compiler；selector 只输出命令和理由。
- Tiger：如果 selector 自动运行命令或成为唯一发布门禁，会绕过 final diff review 和上下文判断；必须保持 advisory-only。
- Tiger：Bun 官方 test runner 和 Jest 是不同测试系统；本项目现有 tests package 仍以 Jest/Playwright 为主，selector 不得推荐把 focused Jest gates 改成 `bun test`。
- Paper Tiger：使用 `--runInBand` 会降低并行性能，但 focused gates 已经以调试/稳定性为目标；对小范围验证是可接受成本。

## 范围 / 不做范围

范围：
- 新增一个轻量验证选择器文档，或新增 `scripts/*` 只读 helper，输出 touched-surface 对应 commands。
- 覆盖首批 surfaces：frontend compatibility、React workspace panels、Express route/order、startup/config、user/auth/storage、derived cache/performance、shared `/lib.js`、semantic docs。
- 将 selector 规则引用到相关 spec 或 tech doc。
- 给 helper 增加单元测试或快照式输出测试。

不做范围：
- 不替换 `bun run test:unit`、`bun run test:compat`、`bun run test:e2e`、`bun run docs:check`。
- 不新增 Vitest、Cypress、GitHub Actions 工作流或 release gate。
- 不自动运行命令。
- 不删除已有 validation matrix。
- 不把 advisory selector 当成发布证明。

## 边界规则 / 验收

- 输入 `public/scripts/slash-commands.js` 或 regex/extension surface 时，selector 必须包含 `bun run test:compat`。
- 输入 Express route/order surface 时，selector 必须包含 `express5-route-compatibility.test.js`。
- 输入 `.docs/db` 时，selector 必须包含 `bun run docs:check` 或 `bun run docs:build`。
- 输入 derived cache 或 character-index surface 时，selector 必须包含 derived-cache 和 interaction-performance index focused tests。
- 输入 React workspace panel surface 时，selector 必须包含 workspace panel focused tests，并在 bundle touched 时建议 `bun run build:react:workspace-panels`。
- 输出必须标记 advisory-only，并提示 final diff review 可追加验证。

## 架构 / 约束

- 贴合 `.docs/tech/bun-workflow.md`：Bun 只做脚本 runner，Node.js 26.3.0 是应用运行时。
- 贴合 `.docs/tech/frontend-structure-contracts.md`：结构 helper 只是测试边界，不替代 runtime compatibility proof。
- 规则源必须引用本地 docs/ADR，不能写成无来源“最佳实践”。
- 如新增 script，必须只读，不修改文件、不启动长时间服务。

## 数据 / 集成

- 输入：surface name 或 path list。
- 输出：commands、reason、required/optional 标记。
- 存储：无。
- API：无。
- 依赖：优先使用 Node.js 标准库；不新增 npm dependency。

## 验证

如果实现为文档-only：
```bash
bun run docs:check
```

如果实现为 helper script：
```bash
bun run --cwd tests test:unit -- validation-gate-selector.test.js --runInBand
bun run docs:check
```

完成证据：
- selector 覆盖首批 high-risk surfaces。
- 每条规则有本地来源路径。
- 输出不声称替代 release proof。

## Doc ID 契约

本 slice 是开发流程工具，默认不改变用户可见行为，不新增 Doc ID。

如后续把 selector 暴露到用户 UI 或 docs database，必须另开 spec。

## 参考资料

- `.docs/tech/briefs/260630-05-validation-gate-selector.md`
- `.docs/tech/bun-workflow.md`
- `.docs/tech/frontend-structure-contracts.md`
- `.docs/tech/modernization-roadmap.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `package.json`
- `tests/helpers/frontend-structure-contract.js`
- `.docs/db/scripts/doc-compiler.js`
- https://bun.sh/docs
- https://bun.sh/docs/test
- https://jestjs.io/docs/cli
- https://jestjs.io/docs/troubleshooting
- Inference: advisory selector 是最小切片，因为它复用现有命令并避免引入新测试系统。
