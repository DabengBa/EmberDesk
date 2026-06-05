# Documentation Topology Closure

## 意图与核心流程

意图：在 roadmap closure 前清理 documentation topology，让 durable docs 只保留已交付事实、明确边界和有效 semantic IDs，避免 stale process docs 继续误导后续 agents。

主要触发条件：implementation slices 已交付，release validation 已通过或正在接近收尾，需要让 `.docs/PROJECT_HISTORY.md`、`.docs/tech/`、`.docs/adr/`、`.docs/db/` 和 briefs 状态一致。

主路径：

1. 审查 `.docs/tech/briefs`、`.docs/specs`、`.docs/PROJECT_HISTORY.md`、`.docs/tech`、`.docs/adr`、`.docs/db`。
2. 删除或归档 stale process docs，只保留 workflow 要求保留的 durable docs。
3. 更新 owning docs 中的 delivered facts、runtime contract、validation evidence 和 successor boundaries。
4. 运行 docs validation。
5. 检查 git status，确保只触碰本步骤应改文档。

## 范围 / 不做范围

范围：

- 清理 stale brief/spec/process doc residue。
- 更新 `.docs/PROJECT_HISTORY.md` 中跨 spec 的已交付事实。
- 更新 `.docs/tech/modernization-roadmap.md` 或相关 tech docs 的 closure 状态。
- 确认 character route read service 已交付事实只保留在 durable docs：`.docs/tech/briefs/260605-02-character-route-service-extraction.md`、`.docs/tech/interaction-performance-indexing.md`、`.docs/PROJECT_HISTORY.md`。
- 检查 `.docs/db` semantic topology，如 user-visible semantics changed 才更新 owning page/feature/term docs。

不做范围：

- 不删除未跟踪文件。
- 不清理 unrelated user changes。
- 不把 future plans 写进 PROJECT_HISTORY 作为 delivered facts。
- 不把 `.docs/db` 当技术实现笔记。
- 不改代码。

## 边界规则 / 验收

验收项：

- `.docs/PROJECT_HISTORY.md` 只记录已交付 cross-spec evolution。
- 第 1 步 `260605-02-character-route-service-extraction` 的 `design.md`、`plan.md`、`audit.md`、`DEVLOG.md` 已由 wrap-up 删除；closure 不应重新创建 spec-local process docs。
- `.docs/tech/briefs` 只保留高价值 intent record，stale process noise 被清理或明确迁移。
- `.docs/db` 无断链、无孤岛、无过期 user-visible semantics。
- `docs:check` 或 `docs:build` 通过。
- roadmap 中 successor/non-goal 边界清楚。

失败边界：

- 如果发现 docs 与代码行为冲突，先判定是 docs stale 还是 code bug；不能直接改语义。
- 如果需要删除大量历史 docs，必须确认它们是 process artifacts 或已被 durable docs 覆盖。

## 架构 / 约束

文档 ownership：

- `.docs/PROJECT_HISTORY.md` 记录 shipped cross-spec facts。
- `.docs/tech/` 记录 implementation architecture 和 constraints。
- `.docs/adr/` 记录 hard-to-reverse decisions。
- `.docs/db/` 记录 user-visible pages/features/terms。
- `.docs/specs/*`、`plan.md`、`audit.md`、`DEVLOG.md` 是 workflow process artifacts，由 delivery/wrap-up lifecycle 管理。

## 数据 / 集成

输入：

- current docs tree
- delivered commits
- delivered character read service commits `ef308b12a` 与 `b5e8abee9`
- validation audit
- semantic docs database

输出：

- cleaned durable docs
- updated topology/build artifacts if docs build requires them

迁移事项：

- 不涉及用户数据迁移。
- 文档文件删除必须限定在 stale process docs 或已确认迁移的历史资料。

## 验证

最低验证：

```powershell
bun run docs:check
git diff --check -- .docs
```

如果 `.docs/db` bundle/topology generated files 需要更新：

```powershell
bun run docs:build
```

收尾前必须运行：

```powershell
git status --short
```

## Doc ID 契约

本切片可能更新现有 Doc ID owning docs，但默认不新增 ID。

可能相关 IDs：

- `page.chat_workspace`
- `feature.startup_bootstrap`
- `feature.character_library_panel`
- `feature.character_delete`
- `feature.extension_panel_open`
- `feature.world_info_panel`
- `term.shared_browser_library`
- `term.character_card`

新增或重命名 Doc ID 需要明确 owner、binding point 和 docs validation expectation。

## 参考资料

- `.docs/tech/modernization-roadmap.md`
- `.docs/PROJECT_HISTORY.md`
- `.docs/tech/briefs/260605-02-character-route-service-extraction.md`
- `.docs/tech/interaction-performance-indexing.md`
- `.docs/db/pages`
- `.docs/db/features`
- `.docs/db/terms`
- `.docs/adr`
- `.docs/tech/briefs/README.md`
- `AGENTS.md`
