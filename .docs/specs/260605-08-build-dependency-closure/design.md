# Build Dependency Closure

## 意图与核心流程

意图：收束 modernization roadmap 的 build/dependency 角色，确认 Node、Bun、Webpack、ESLint、oxlint 和依赖漂移都处在可发布、可维护的状态。

主要触发条件：进入 release validation 前，需要确认工具链角色没有漂移，且不会把 lint/build/dependency cleanup 扩大成架构迁移。

主路径：

1. 确认 Node.js 26.3.0 是 app runtime。
2. 确认 Bun 仍是 package manager 和 script runner。
3. 确认 Webpack 仍只负责 `/lib.js` shared browser boundary。
4. 确认 ESLint 是 authoritative lint gate，oxlint 是 non-authoritative fast preflight。
5. 审核依赖漂移，只处理当前 release blocker 或明确低风险对齐项。

## 范围 / 不做范围

范围：

- 检查 `package.json`、`bun.lock`、`tests/package.json`、ESLint flat config、`.oxlintrc.json`、Webpack `/lib.js` boundary。
- 记录工具链角色和已知 warning 状态。
- 必要时做小范围 version alignment 或 config comment 修正。

不做范围：

- 不引入 SPA framework。
- 不迁移 TypeScript application code。
- 不替换 Webpack。
- 不把 Bun 变成 application runtime。
- 不做 broad dependency upgrade 或 lockfile churn。
- 不改 Electron npm-owned lifecycle，除非另开 design。

## 边界规则 / 验收

验收项：

- `node --version` 输出 Node 26.3.0。
- `bun run lint` 是 authoritative green gate。
- `bun run lint:fast` 若有 warning，仍记录为 non-authoritative preflight，不替代 ESLint。
- `frontend-shared-library-boundary.test.js` 证明 `/lib.js` contract 未破坏。
- package manager/runtime roles 在 docs 中一致。
- dependency drift 只记录或处理真实 release risk。

失败边界：

- 如果 dependency upgrade 改变 runtime behavior，停止本 closure，单独设计该 dependency migration。
- 如果 Webpack replacement 成为必要，另开 `/lib.js` replacement proof design。

## 架构 / 约束

工具链角色：

- Node.js 26.3.0 Current 是 application runtime。
- Bun 1.3.14 是 package manager 和 script runner。
- Webpack 保持 `/lib.js` bundling。
- ESLint 10 flat config 是 lint authority。
- oxlint 是 fast lane only。

这些角色是 release hygiene，不是用户可见功能。

## 数据 / 集成

输入：

- root package/config files
- tests package/config files
- lockfile
- shared library boundary tests

输出：

- green gates 或 documented known warnings
- small config/doc updates if needed

迁移事项：

- 不涉及用户数据迁移。
- 依赖变更如需 lockfile update，必须限定在当前风险项。

## 验证

最低验证：

```powershell
node --version
bun --version
bun run lint
bun run lint:fast
bun run --cwd tests lint
bun run --cwd tests test:unit -- frontend-shared-library-boundary.test.js --runInBand
```

如果 docs/db 变动：

```powershell
bun run docs:check
```

## Doc ID 契约

本切片不新增 Doc ID，不改变用户可见语义。

相关 IDs：

- `term.shared_browser_library`
- `feature.startup_bootstrap`

如果 build output 改变 extension-visible library surface，需要更新 `term.shared_browser_library` owning docs 或另开 compatibility design。

## 参考资料

- `.docs/tech/modernization-roadmap.md`
- `.docs/tech/frontend-shared-library-boundary.md`
- `.docs/PROJECT_HISTORY.md`
- `package.json`
- `tests/package.json`
- `eslint.config.js`
- `tests/eslint.config.js`
- `.oxlintrc.json`
- `webpack.config.js`
- `tests/frontend-shared-library-boundary.test.js`
