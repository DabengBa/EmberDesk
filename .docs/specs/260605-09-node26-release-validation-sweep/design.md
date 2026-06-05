# Node 26 Release Validation Sweep

## 意图与核心流程

意图：在 Node.js 26.3.0 下执行 roadmap closure 前的 release validation sweep，确认当前 modernization slices 的核心 gates 全部有效。

主要触发条件：前 7 步交付后，准备冻结 roadmap 或进入文档闭环前，需要一次集中验证。

主路径：

1. 确认 `node` 解析到 v26.3.0。
2. 运行 lint、tests lint、compat、docs、startup/config、character read service/index、route-order、shared-library、user/auth/setup/login、full unit suite。
3. 如果本轮或近期 UI slice 改变 visible browser behavior，运行对应 Playwright E2E。
4. 失败按 surface 定位修复，不进行 unrelated cleanup。
5. 将最终 gate 结果写入 audit 和 durable docs。

## 范围 / 不做范围

范围：

- 运行 release validation gates。
- 记录命令、退出码、Node/Bun/npm/npx version。
- 处理当前 scope 真实 failure。
- 将 known unrelated failure 或 skipped E2E 的理由写清。

不做范围：

- 不新增功能。
- 不借验证失败做 broad refactor。
- 不把 Node 25 或其它 runtime 结果当 release proof。
- 不强杀 Node/Codex/MCP 进程去做 system-wide installer upgrade。

## 边界规则 / 验收

验收项：

- 所有 required gates 通过或有明确 non-blocking reason。
- failure 修复限定在失败 surface。
- full unit suite 作为 release proof 运行，除非有明确环境 blocker。
- Playwright E2E 的运行/跳过理由与本轮 visible UI 影响一致。
- validation evidence 包含 exact date、runtime versions 和 command list。

失败边界：

- 如果 Node 不是 26.3.0，停止 release proof，先修 runtime resolution。
- 如果 docs topology failure 来自 stale process files，交给 documentation topology closure，不混入 unrelated code fix。

## 架构 / 约束

该步骤是 validation slice，不改架构。

硬约束：

- Node 26.3.0 是唯一 release runtime proof。
- Bun 是 script runner。
- Release gate 不替代 focused test；focused tests 应在各 implementation slice 已完成。
- 已交付的 character read service 需要作为 route/data focused gate 保留：`character-read-service.test.js` 证明 service edge cases，`interaction-performance-index.test.js` 证明 route/index integration。
- Dirty worktree 中 unrelated changes 不得被 revert、stage 或 cleanup。

## 数据 / 集成

输入：

- 当前 working tree
- Node/Bun toolchain
- tests and docs commands

输出：

- validation audit
- possibly small failure fixes
- durable roadmap/history note after pass

迁移事项：

- 不涉及用户数据迁移。

## 验证

目标命令：

```powershell
node --version
npm --version
npx --version
bun --version
bun run lint
bun run --cwd tests lint
bun run test:compat
bun run docs:check
bun run --cwd tests test:unit -- character-read-service.test.js interaction-performance-index.test.js --runInBand
bun run --cwd tests test:unit -- command-line.test.js server-startup-profiler.test.js startup-loader.test.js startup-deferred-tasks.test.js startup-critical-path.test.js --runInBand
bun run --cwd tests test:unit -- express5-route-compatibility.test.js frontend-shared-library-boundary.test.js --runInBand
bun run --cwd tests test:unit -- user-storage.test.js user-storage-config.test.js user-auth.test.js user-directories.test.js user-migrations.test.js users-public-setup.test.js login-page-controller.test.js setup-page-controller.test.js --runInBand
bun run --cwd tests test:unit -- --runInBand
```

Playwright 条件 gate：

```powershell
bun run --cwd tests test:e2e -- login.e2e.js
```

仅当本轮或近期 UI slice 改变 visible browser behavior 时运行对应 E2E。

## Doc ID 契约

本切片不新增 Doc ID，不改变用户可见语义。

相关 IDs：

- `feature.startup_bootstrap`
- `page.login`
- `page.setup`
- `page.chat_workspace`
- `term.shared_browser_library`

如果 validation 发现 docs 与 visible behavior 不一致，修复 owning `.docs/db` docs 后运行 docs validation。

## 参考资料

- `.docs/tech/modernization-roadmap.md`
- `.docs/tech/server-startup-orchestration.md`
- `.docs/tech/config-resolution.md`
- `.docs/tech/frontend-shared-library-boundary.md`
- `.docs/PROJECT_HISTORY.md`
- `tests/`
- `package.json`
