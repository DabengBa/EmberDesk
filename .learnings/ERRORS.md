# Errors

Command failures, API errors, and unexpected behavior captured during development.

**Areas**: frontend | backend | infra | tests | docs | config
**Statuses**: pending | in_progress | resolved | wont_fix | promoted | promoted_to_skill

## Status Definitions

| Status | Meaning |
|--------|---------|
| `pending` | Not yet addressed |
| `in_progress` | Actively being worked on |
| `resolved` | Issue fixed (add Resolution block) |
| `wont_fix` | Decided not to address (reason in Resolution) |
| `promoted` | Elevated to CLAUDE.md, AGENTS.md, or copilot-instructions.md |
| `promoted_to_skill` | Extracted as a reusable skill |

Entry format: see the `self-improvement` skill's "Error Entry" section. IDs use `ERR-YYYYMMDD-XXX`.

---

## [ERR-20261105-001] pnpm_install

**Logged**: 2026-11-05T06:48:57+08:00
**Priority**: high
**Status**: resolved
**Area**: tests

### Summary
在 `tests/` 安装测试依赖时 `pnpm install --frozen-lockfile` 报锁文件缺少 `importers["tests"]`；`--dry-run` 却成功，造成假阳性。

### Error
```text
Error: ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER

  × installing dependencies
  ╰─▶ Cannot install with "frozen-lockfile" because pnpm-lock.yaml has no
      `importers["tests"]` entry. Regenerate the lockfile with `pnpm install
      --lockfile-only`.
```

### Context
- 命令：`cd tests && pnpm install --frozen-lockfile`；同样失败的还有 `pnpm --dir tests install --frozen-lockfile`。
- 环境：pnpm `12.0.0-rc.5`（根与 `tests/` 同版本）；根 `.npmrc` 为 `ignore-scripts=true`、`min-release-age=7`。
- 结构原因：根 `pnpm-workspace.yaml` 无 `packages:`，但仍是 workspace 根；`tests/pnpm-lock.yaml`（被跟踪，约 107.7 KB）的 `importers` 只有 `.`，缺 `tests` 条目。
- 最小复现：`/tmp/ws-repro2` 复制根 `package.json` + `pnpm-workspace.yaml` + `.npmrc` + `tests/{package.json,pnpm-lock.yaml}` 后，真实安装两条路径都抛同一错误。
- **假阳性陷阱**：`cd tests && pnpm install --frozen-lockfile --dry-run` 与 `pnpm --dir tests install --frozen-lockfile --dry-run` 都成功退出并打印待装包清单（如 `+ jest@29.7.0`、`Done in 408ms using pnpm v12.0.0-rc.5`）。dry-run 成功不能证明安装可用，必须跑真实安装或用 `require.resolve` 验证产物。

### Suggested Fix
不要原地改仓库锁文件（会动依赖布局，需单独授权）。临时方案：把 `tests/package.json` + `tests/pnpm-lock.yaml` 复制到 workspace 之外的独立目录单独安装，再把 `node_modules` 迁回。

仓库配置的长期修复尚未验证。

### Metadata
- Reproducible: yes
- Related Files: pnpm-workspace.yaml, tests/package.json, tests/pnpm-lock.yaml, .npmrc
- See Also: LRN-20261105-003

### Resolution
- **Resolved**: 2026-11-05T06:17:13+08:00
- **Commit/PR**: 未提交（在 worktree `fix/mobile-sidebars` 内临时处理）
- **Notes**: 把 `tests/package.json` 与 `tests/pnpm-lock.yaml` 复制到 `/tmp/emberdesk-tests-install.mgDaBX`（脱离根 workspace）执行 `pnpm install`，再迁 `node_modules` 到 `tests/node_modules`。核对证据：`tests/node_modules/.pnpm-workspace-state-v1.json` 的 `projects` 指向 `/tmp/emberdesk-tests-install.9Wu3oR`（临时目录已删除）；`tests/node_modules/.modules.yaml` 含 `nodeLinker: isolated`、`hoistPattern: ["*"]`；`require.resolve('@playwright/test')` → 1.62.1、`require.resolve('jest')` → 29.7.0 成功；Playwright 浏览器已在 `~/.cache/ms-playwright`（chromium-1228/1234）。根因（锁文件缺 importer 条目）未修，`tests/` 下次安装会复现。

---
