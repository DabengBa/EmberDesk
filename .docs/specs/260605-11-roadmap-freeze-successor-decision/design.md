# Roadmap Freeze Successor Decision

## 意图与核心流程

意图：在 10-step roadmap closure program 完成后冻结当前 modernization roadmap，把已交付事实、validation evidence 和 durable docs 对齐，并把更大的未做迁移移入 successor decision。

主要触发条件：前 9 步已交付，release validation 和 documentation topology closure 都有证据。

主路径：

1. 复核 roadmap 的 delivered slices、known gaps、validation matrix 和 non-goals。
2. 确认 SPA、TypeScript、database-first、broad endpoint split 等仍未被批准为当前 roadmap scope。
3. 将当前 roadmap 状态标记为 closed/frozen；只把有 commit、validation 和 durable docs 的步骤写成 delivered。
4. 创建或更新 successor proposal 的入口，只记录需要进一步决策的主题，不提前承诺方案。
5. 在 PROJECT_HISTORY 中记录 roadmap closure 的 cross-spec fact。

## 范围 / 不做范围

范围：

- 更新 `.docs/tech/modernization-roadmap.md` closure 状态。
- 更新 `.docs/PROJECT_HISTORY.md` 的 closure entry。
- 必要时新增 successor roadmap brief 或 ADR placeholder，明确它不是已批准实现。
- 明确 remaining ideas 的归属和进入条件。

不做范围：

- 不启动 successor implementation。
- 不把 future migration 写成 accepted architecture。
- 不新增 SPA/TypeScript/database-first 迁移计划细节。
- 不清理 unrelated code/docs。

## 边界规则 / 验收

验收项：

- roadmap 明确 frozen/closed，不再把 successor ideas 当当前债务。
- closure entry 只引用已交付 steps 和 validation evidence；例如第 1 步 character read service 可引用 `ef308b12a` 与 `b5e8abee9`，未交付的后续 specs 只能写成 pending/successor。
- successor topics 有入口和决策条件，但没有假装已批准。
- docs validation 通过。
- delivery wrap-up 可以清理 process artifacts，而 durable facts 留在 owning docs。

失败边界：

- 如果 validation sweep 未通过，不得冻结 roadmap。
- 如果 documentation topology closure 未完成，不得声称 roadmap closed。
- 如果某个 step 只设计未交付，必须写成 pending/successor，不写成 delivered。

## 架构 / 约束

Freeze 是 governance/documentation action，不改变 product behavior。

硬约束：

- 当前 roadmap 的“大梦”是可持续切片演进，不是重写。
- 当前 closure 必须保留文件-backed canonical data、HTML/CSS/jQuery frontend、Express 5、Node 26.3/Bun role split、compatibility surfaces。
- successor proposal 需要独立 design/ADR 和用户批准。

## 数据 / 集成

输入：

- delivered commits
- character route read service durable trace: `src/endpoints/character-read-service.js`、`tests/character-read-service.test.js`、`.docs/tech/briefs/260605-02-character-route-service-extraction.md`
- release validation audit
- documentation topology closure result
- current modernization roadmap

输出：

- frozen roadmap
- PROJECT_HISTORY closure entry
- optional successor entry/brief

迁移事项：

- 不涉及用户数据迁移。

## 验证

最低验证：

```powershell
bun run docs:check
git diff --check -- .docs/tech/modernization-roadmap.md .docs/PROJECT_HISTORY.md
```

如果 `.docs/db` 未变动，不需要 docs build；如果 semantic docs 有变动，则运行：

```powershell
bun run docs:build
```

## Doc ID 契约

本切片不新增 Doc ID，不改变用户可见语义。

相关 IDs 仅作为 roadmap trace：

- `page.chat_workspace`
- `feature.startup_bootstrap`
- `feature.character_library_panel`
- `term.shared_browser_library`

Successor roadmap 如涉及新 user-visible behavior，需要在独立 design 中规划 Doc IDs。

## 参考资料

- `.docs/tech/modernization-roadmap.md`
- `.docs/PROJECT_HISTORY.md`
- `.docs/tech/modernization-phase0-baseline.md`
- `.docs/tech/modernization-phase1-complexity-map.md`
- `.docs/tech/frontend-jquery-slice-migration.md`
- `.docs/tech/interaction-performance-indexing.md`
- `.docs/tech/derived-cache-sqlite.md`
- `.docs/tech/briefs/260605-02-character-route-service-extraction.md`
- `AGENTS.md`
