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

## [LRN-20261105-004] correction

**Logged**: 2026-11-05T14:17:59+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
修复角色卡替换竞态时，曾把范围扩展到断线重连、跨标签页并发和操作日志；用户纠正要求避免过度设计，以最简洁的方式解决实际问题。

### Details
已复现的一种失败序列：替换写入成功后，编辑器此前排队的延迟保存（`app/workspace-panels.tsx` 中 900ms 的 autosave）再次提交替换前的草稿，把结果覆盖回去。

实际实现曾扩展到：持久化操作日志、跨页面版本协议、聊天保存锁与多层锁、跨重载恢复。这些扩展没有完整解决问题，反而引入新的死锁与「重载后无法判定执行中断状态」的恢复缺口，属于没有可运行失败用例支撑的防御性设计。

用户在会话中两次纠正（paraphrased）：先是「我们的数据都存在 sqlite 中对吗？就一个 sqlite 数据批量替换，怎么被你弄得这么复杂？」；在解释后再次要求「禁止将问题复杂化，禁止防御性编程和过度设计」，并要求以最快最简洁的方式实现。

### Suggested Action
扩大修复范围前，明确具体失败场景和证据，优先解决已复现的问题；未验证的风险标明为 open question，避免为假设场景添加复杂机制。

### Metadata
- Source: user_feedback
- Related Files: app/workspace-panels.tsx, public/script.js, tests/character-text-replace.e2e.js
- Tags: scope-control, over-engineering, defensive-programming, race-condition, user-correction
- See Also: LRN-20261105-005
- Pattern-Key: process.scope.only-reproduced-failure
- Recurrence-Count: 1
- First-Seen: 2026-11-05
- Last-Seen: 2026-11-05

### Context Maintenance
- Decay-Type: decision
- Decay-Rate: durable（属于协作方式约束，不随代码演进失效）
- Authority: 用户原话 + `AGENTS.md`「写代码前按以下顺序决策…最后实现满足当前需求的最小方案，不做预防性抽象或多余配置层」；Owner: 项目负责人
- Revalidation: 复查 `AGENTS.md` 的 YAGNI 段落是否仍在；若该原则已被写进项目指令并稳定执行，本条可 externalize 为指针；失效触发 = 项目改为允许探索性防御设计
- Validation: verified; Last-Validated: 2026-11-05; Evidence: 用户两次纠正了修复范围和复杂度；延迟保存覆盖替换结果的场景已有回归用例。
- Disposition: retain; Application: applied

### Resolution
- **Resolved**: 2026-11-05T14:17:59+08:00
- **Commit/PR**: 无（worktree `fix/character-replace-race` 未提交）
- **Notes**: 保留用户对控制范围、避免防御性过度设计的纠正；具体实现以当前代码和测试为准。

---

## [LRN-20261105-005] best_practice

**Logged**: 2026-11-05T14:17:59+08:00
**Priority**: high
**Status**: resolved
**Area**: frontend

### Summary
带延迟自动保存的编辑器执行替换时，旧草稿的待发保存可能覆盖替换结果；需要检查保存顺序及替换后的编辑器状态。

### Details
失败机制：`app/workspace-panels.tsx:1331-1338` 的 autosave effect 在草稿变脏后 900ms 提交，弹窗打开时该定时器已在队列中；替换写入成功后定时器触发，用旧草稿覆盖了新内容。

当前工作树的处理包括：
- 弹窗打开即停：`app/workspace-panels.tsx:1272-1275` 的 `submitDraft` 在 `textReplaceOpen` 为真时直接 `return false`；`:1333-1338` autosave effect 在 `textReplaceOpen` 时提前 return。
- 提交串行化：`app/workspace-panels.tsx:1233` 的 `saveInFlightRef` 让并发提交复用同一 Promise，`app/workspace-panels.tsx:2024-2026` 关闭前等待在途保存，失败返回 `character_save_failed`。
- 关闭时以权威数据为准：`public/script.js:2651-2683` 的 `closeTextReplace` 先 `reloadCurrentChat()`，再用 `getOneCharacter(avatarUrl)` 重读；失败返回 `character_refresh_failed` 并保留弹窗与草稿。`public/script.js:5105-5129` 把 `getOneCharacter` 从「只弹 toast」改为返回 boolean，调用方才有判断依据。

配套细节：`app/workspace-panels.tsx` 用 `overlayRef` 把背景元素设为 `inert`，防止弹窗期间操作背后编辑器。

回归测试：`tests/character-text-replace.e2e.js:164` 用 `page.clock.install/pauseAt/runFor` 让旧 900ms 定时器在 apply 之后才触发，断言 `/api/characters/edit` 调用数为 0 且描述仍为新值；`:216` 拦截 `/api/characters/get` 返回 500，断言弹窗保留可重试；`:257` 断言取消后草稿仍在。

### Suggested Action
给编辑器加延迟保存时，检查其他写操作是否会被旧草稿覆盖；根据实际保存和刷新流程添加针对性的回归测试。

### Metadata
- Source: conversation
- Related Files: app/workspace-panels.tsx, public/script.js, tests/character-text-replace.e2e.js
- Tags: autosave, race-condition, canonical-sqlite, stale-state, inert, e2e, playwright-clock
- See Also: LRN-20261105-004
- Pattern-Key: frontend.deferred-autosave.stale-write
- Recurrence-Count: 1
- First-Seen: 2026-11-05
- Last-Seen: 2026-11-05

### Context Maintenance
- Decay-Type: reality
- Decay-Rate: medium（autosave 门控与关闭路径一改就可能失效）
- Authority: 当前工作树 `app/workspace-panels.tsx`、`public/script.js`、`tests/character-text-replace.e2e.js` 的实际 diff；Owner: 角色创作/工作区面板前端维护者
- Revalidation: 跑 `tests/character-text-replace.e2e.js`，并确认三处门控仍存在——`submitDraft` 的 `textReplaceOpen` 早退、autosave effect 的 `textReplaceOpen` 早退、`closeTextReplace` 中的 `getOneCharacter` 返回值检查；失效触发 = 引入新的保存触发点（快捷键/离开页面）、把 autosave 改成服务端推送、`getOneCharacter` 再次改为无返回值
- Validation: verified; Last-Validated: 2026-11-05; Evidence: `tests/character-text-replace.e2e.js` 4 个用例通过（含 `:164` 定时器竞态用例，该用例在旧代码上复现出覆盖）；`pnpm run test:compat` 102 项通过；React 构建、TypeScript、`docs:check` 通过
- Disposition: retain; Application: applied

### Resolution
- **Resolved**: 2026-11-05T14:17:59+08:00
- **Commit/PR**: 无（worktree `fix/character-replace-race` 未提交）
- **Notes**: 单页面范围；断线重连与跨标签页并发明确不承诺，见 LRN-20261105-004。

---

## [LRN-20261105-006] best_practice

**Logged**: 2026-11-05T14:17:59+08:00
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
多个 Playwright 用例改写同一张角色卡时必须 `test.describe.configure({ mode: 'serial' })`；本地化 UI 的 locator 用中英双语正则，不要写死中文。

### Details
- `tests/character-text-replace.e2e.js:14` 加了 `test.describe.configure({ mode: 'serial' })`：4 个用例都读写同一个 `avatarUrl` 的角色卡，并行执行会互相覆盖断言。
- 搜索框 locator 用 `page.getByRole('searchbox', { name: /Search characters|搜索角色/ })`，在英文与中文运行环境都能命中；`dialog[aria-label="查找替换"]` 依赖当前语种，仅在本仓库测试数据固定为 zh-cn 时可用。
- 控制 900ms autosave 用 `page.clock.install({ time })/pauseAt()/runFor()`，比 `waitForTimeout` 更能确定性地让旧定时器在目标时刻触发。

### Suggested Action
新增改写共享 fixture 的用例前先判断是否需要 serial；写 locator 时优先 role + 双语正则，避免语言环境切换后整组失效。

### Metadata
- Source: conversation
- Related Files: tests/character-text-replace.e2e.js
- Tags: playwright, serial-mode, i18n, fixtures, clock-control
- See Also: LRN-20261105-005
- Pattern-Key: tests.playwright.shared-fixture.serial
- Recurrence-Count: 1
- First-Seen: 2026-11-05
- Last-Seen: 2026-11-05

### Context Maintenance
- Decay-Type: reality
- Decay-Rate: slow（Playwright 语义稳定；测试数据语种或 fixture 策略改变才会失效）
- Authority: `tests/character-text-replace.e2e.js` 实际内容 + Playwright serial 模式语义；Owner: 测试维护者
- Revalidation: 读 `tests/character-text-replace.e2e.js:14` 与各用例的 `avatarUrl` 使用；失效触发 = 用例改为各自创建独立角色卡、或项目统一切换英文测试数据
- Validation: verified; Last-Validated: 2026-11-05; Evidence: 加 serial 后 4 个用例连续通过；搜索框双语正则在 zh-cn 数据下命中
- Disposition: retain; Application: applied

---
