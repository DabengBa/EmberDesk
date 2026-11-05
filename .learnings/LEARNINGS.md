# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | knowledge_gap | best_practice
**Areas**: frontend | backend | infra | tests | docs | config
**Statuses**: pending | in_progress | resolved | wont_fix | promoted | promoted_to_skill

Every saved entry, including a one-off pending learning, includes:

```markdown
### Context Maintenance
- Decay-Type: reality | decision | dependency | relevance | unknown
- Decay-Rate: fast | medium | slow | durable | unknown (brief basis)
- Authority: source or unknown; Owner: known role or unknown
- Revalidation: method; invalidating triggers; when to check; unavailable-source behavior
- Validation: pending | verified | unresolved; Last-Validated: date or none; Evidence: checked source or none
- Disposition: unassessed | retain | revise | externalize | retire; Application: proposed | applied
```

Classify at capture; do not mark a claim verified merely because it was logged.
Review unpromoted entries too. Review alone does not add recurrence or justify
retirement. See the `self-improvement` skill's `references/context-maintenance.md`.

## Status Definitions

| Status | Meaning |
|--------|---------|
| `pending` | Not yet addressed |
| `in_progress` | Actively being worked on |
| `resolved` | Issue fixed or knowledge integrated |
| `wont_fix` | Decided not to address (reason in Resolution) |
| `promoted` | Elevated to CLAUDE.md, AGENTS.md, or copilot-instructions.md |
| `promoted_to_skill` | Extracted as a reusable skill |

## Skill Extraction Fields

When a learning is promoted to a skill, add these fields:

```markdown
**Status**: promoted_to_skill
**Skill-Path**: skills/skill-name
```

---

## [LRN-20261105-001] best_practice

**Logged**: 2026-11-05T06:48:57+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
移动视口下左侧栏高度塌陷：`html` 高度为 0，导致左栏的百分比高度按其包含块解析为 0；右侧栏实测正常。

### Details
症状：390x844 视口打开 `#left-nav-panel` 时高度塌陷（修复前 e2e 断言实测约 12px），抽屉内 `.scrollableInner` 与预设列表无法显示；`#right-nav-panel` 实测正常。

修复：`public/style.css:6041-6049` 的 `.fillLeft.openDrawer` 由单条 `height: 100%` 改为
`display: flex; height: 100vh; height: 100dvh; @starting-style { height: 0; }`。
选择 `100dvh` 而非 `100%`/`100vh`：`dvh` 跟随移动浏览器动态工具栏，`vh` 作为旧引擎回退。

根因已确认：左栏的包含块高度受高度为 0 的 `html` 影响，原 `height: 100%` 因此塌陷。右栏保留百分比高度且实测正常，不能由左栏现象推断右栏需要修改。

回归测试：`tests/workspace-shell-panel-navigation.e2e.js:79` `mobile side panels display their content and switch from the toolbar`，`page.setViewportSize({ width: 390, height: 844 })` 后 `resetSeededSideDrawers(page)`，断言抽屉可见、`getBoundingClientRect().height > 400`、`.scrollableInner` height > 100、`#settings_preset_openai` 可见；切到角色库后断言 left 抽屉数量 0、right 内 `#rm_characters_block` 可见且 height > 400；切回提示词后断言 right 数量 0；最后用 `clickShellPanel` 点当前项关闭两侧。修复前该用例失败（高度约 12px），修复后通过。

### Suggested Action
修改该布局时检查实际包含块和元素尺寸，并运行移动侧栏回归测试。

### Metadata
- Source: conversation
- Related Files: public/style.css, tests/workspace-shell-panel-navigation.e2e.js, .docs/db/features/next_workspace_shell.md
- Tags: css, mobile, viewport-units, drawer, e2e, playwright, layout
- Pattern-Key: frontend.fixed-overlay.viewport-height
- Recurrence-Count: 1
- First-Seen: 2026-11-05
- Last-Seen: 2026-11-05

### Context Maintenance
- Decay-Type: reality
- Decay-Rate: slow（CSS 布局规则随样式重构变化；基规则 `.fillLeft` 一改就可能失效）
- Authority: 当前工作树 `public/style.css` + `tests/workspace-shell-panel-navigation.e2e.js` 的实际 diff；Owner: 工作区外壳/前端维护者（AGENTS.md 未指名，具体人以 git 历史为准）
- Revalidation: 跑移动侧栏 e2e（`tests/workspace-shell-panel-navigation.e2e.js`）并读 `public/style.css:6015, 6016-6059`；失效触发 = 抽屉基规则、`--topBarBlockSize`/`--sheldWidth` 变量或 `@starting-style` 用法改动；下次改移动抽屉/浮层时检查；测试依赖不可安装（见 ERR-20261105-001）时保留旧结论并标注未复验
- Validation: verified; Last-Validated: 2026-11-05; Evidence: 左栏修复前高度约 12px，修复后移动侧栏 e2e 通过；已确认 `html` 高度为 0 与包含块的影响，右栏实测正常。
- Disposition: retain; Application: applied

### Resolution
- **Resolved**: 2026-11-05T06:48:57+08:00
- **Commit/PR**: 未提交（worktree `fix/mobile-sidebars` 工作树内改动）
- **Notes**: `public/style.css:6041-6049` 改用 `100dvh`（含 `100vh` 回退）+ `@starting-style` 后，`tests/workspace-shell-panel-navigation.e2e.js:79` 的移动侧栏用例通过；右栏未修改且实测正常。

---

## [LRN-20261105-002] best_practice

**Logged**: 2026-11-05T06:48:57+08:00
**Priority**: medium
**Status**: resolved
**Area**: config

### Summary
两次工作树扫描结果相同；它们不是 dev 基线扫描，不能证明相对 dev 无新增告警。被跳过的 format/lint 引擎输出 0 不代表通过。

### Details
本次 `aislop 0.20.0`（`/mnt/projects/.node-tools/npm-global/bin/aislop`）的 before/after 均为工作树扫描，导出 JSON 到 `/tmp/emberdesk-aislop-scan-{before,after}.json` 及 `ci-*` 副本：
- 两次结果均为 `score: 97`、`label: "Healthy"`、`summary { errors: 0, warnings: 33, fixable: 0, files: 636 }`、`coverage.supportedFiles: 636`。
- 两次工作树扫描的 `(filePath, rule, message)` 集合差集：NEW = ∅，GONE = ∅；不能据此判断相对 dev 的新增告警。
- 33 条全部 `rule = ai-slop/unused-css`、全部 `filePath = public/style.css`（例：`CSS class '.scrollY' is defined but never referenced in the codebase`、`.responsiveTable`），`severity: warning`、`confidence: medium`、`fixable: false`。
- `engines`：`format.issues 0 skipped true skipReason "no formatter for the detected languages"`、`lint.issues 0 skipped true skipReason "no linter for the detected languages"`、`code-quality 0`、`ai-slop 33`、`security 0`。`aislop doctor` 显示 biome/oxlint/knip/built-in AI Slop/pnpm audit 五个引擎 ready，architecture skipped（opt-in 未配置），missing 0。
- 抽样 `rg` 确认 `scrollY`、`responsiveTable` 在 `public/style.css` 之外无直接引用；可能存在动态类名引用，本次未删除。

### Suggested Action
1. 比较相对 dev 的新增告警时，先分别扫描 dev 基线和目标工作树，再比较结果。
2. 明确写出被 skipped 的引擎与 `skipReason`，不要把 `issues: 0` 等同于"该维度干净"。
3. 清理 `ai-slop/unused-css` 条目前先确认无动态类名引用。

### Metadata
- Source: conversation
- Related Files: public/style.css
- Tags: lint, aislop, baseline-diff, false-negative, dead-css
- Pattern-Key: tooling.report.baseline-diff-not-total
- Recurrence-Count: 1
- First-Seen: 2026-11-05
- Last-Seen: 2026-11-05

### Context Maintenance
- Decay-Type: dependency
- Decay-Rate: medium（aislop 的规则集/JSON schema/引擎约定随版本变化；0.20.0 之外未验证）
- Authority: `aislop 0.20.0` 实际输出（/tmp JSON 报告 + `aislop doctor`）；Owner: 引入 aislop 的 CI/工具链维护者
- Revalidation: 升级 `aislop` 或改规则集后跑 baseline，检查 JSON 的 `summary`/`engines`/`coverage` 键是否仍存在；失效触发 = 报告 schema 变更、新增 formatter/linter 引擎、`skipReason` 语义变化；下次改 CI 门禁或工具版本时检查；无工具可用时不要声称扫描结论
- Validation: verified; Last-Validated: 2026-11-05; Evidence: 改动前后 JSON 的 `(filePath, rule, message)` 差集为空（NEW=∅、GONE=∅），`engines.format/lint` 的 `skipped: true` 与 `skipReason` 字面值
- Disposition: retain; Application: applied

### Resolution
- **Resolved**: 2026-11-05T06:48:57+08:00
- **Commit/PR**: 无代码改动（仅结论）
- **Notes**: 两次工作树扫描结果相同；未扫描 dev 基线，无法判断相对 dev 的新增告警。`public/style.css` 未做清理。

---

## [LRN-20261105-003] knowledge_gap

**Logged**: 2026-11-05T06:48:57+08:00
**Priority**: medium
**Status**: pending
**Area**: tests

### Summary
本仓库 `tests/` 被根 workspace 当作 importer（根 `pnpm-workspace.yaml` 没有 `packages:` 键），所以即使 `cd tests` 也不会使用 `tests/pnpm-lock.yaml` 作为独立项目，依赖必须由根 importer 解析。

### Details
- 根 `pnpm-workspace.yaml` 只有 `allowBuilds` / `protected overrides` / `minimumReleaseAge` / `trustPolicy`，**没有 `packages:`**；`tests/pnpm-lock.yaml` 是被跟踪的独立锁文件（约 107.7 KB），其 `importers` 只有 `.`，`packageManager: pnpm@12.0.0-rc.5`。
- 因为 workspace 根在仓库根，`tests` 是名为 `tests` 的 importer，pnpm 会去找 `importers["tests"]`，忽略 `tests/pnpm-lock.yaml` 的 `.` importer。于是 `cd tests && pnpm install --frozen-lockfile` 与 `pnpm --dir tests install --frozen-lockfile` 报同一个 `ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER`（详见 ERR-20261105-001）。
- 本次通过复制文件到 workspace 根之外的临时目录完成安装；未验证其他隔离方式。
- 相关配置：根 `.npmrc` 为 `ignore-scripts=true`、`min-release-age=7`，会影响安装时可执行脚本与版本解析。

### Suggested Action
遇到相同安装错误时检查 workspace 和锁文件；本次临时验证方式见 ERR-20261105-001。配置修复未验证。

### Metadata
- Source: error
- Related Files: pnpm-workspace.yaml, tests/package.json, tests/pnpm-lock.yaml, .npmrc
- Tags: pnpm, workspace, importer, lockfile, frozen-lockfile
- See Also: ERR-20261105-001
- Pattern-Key: tooling.pnpm.subdir-is-not-standalone-project
- Recurrence-Count: 1
- First-Seen: 2026-11-05
- Last-Seen: 2026-11-05

### Context Maintenance
- Decay-Type: reality
- Decay-Rate: slow（workspace 与锁文件布局改变才会失效）
- Authority: 仓库内 `pnpm-workspace.yaml`、`tests/pnpm-lock.yaml`、`.npmrc` 实际内容 + pnpm 12.0.0-rc.5 行为；Owner: 仓库构建/依赖维护者
- Revalidation: 读根 `pnpm-workspace.yaml` 是否有 `packages:`、读 `tests/pnpm-lock.yaml` 的 `importers` 键；失效触发 = 根 workspace 增加 `packages`、`tests` 锁文件重生成为 importer 条目、pnpm 大版本改变 importer 解析；下次在 `tests/` 安装依赖前检查；若文件不可读则标注未复验，不要断言当前布局
- Validation: verified; Last-Validated: 2026-11-05; Evidence: 根 `pnpm-workspace.yaml` 无 `packages:`；`tests/pnpm-lock.yaml` 的 `importers` 仅 `.`；`/tmp/ws-repro2` 最小复现中 `cd tests` 与 `pnpm --dir tests` 真实安装均报 `ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER`
- Disposition: retain; Application: applied

---
