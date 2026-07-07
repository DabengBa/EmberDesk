# Canonical SQLite Repair Tooling And Rollout Contract

## 意图与核心流程

一句话意图：把 repair tooling、feature flag 组合规则和 rollback 前提写成单独合同，避免它们散落在 reads/writes 实现里。

主要参与者或触发条件：

- projection failure
- audit drift
- operator 需要回滚或重放 projection
- CI / strict fixtures 需要验证 fail-closed 行为

主路径顺序：

1. 运行时或 audit 发现 drift / projection failure。
2. 记录 repair intent 与原因。
3. operator 通过 repair tooling 执行只读检查或定向修复。
4. rollout 按 flag contract 开启或关闭各阶段能力。
5. rollback 前先满足该 spec 定义的证据前提。

## 范围 / 不做范围

本次要改变什么：

- 定义 repair tooling 的输入、输出、失败语义。
- 定义各 feature flag 的开启顺序、组合限制和 rollback 前提。
- 定义 strict 模式下的 fail-closed proof。

不做范围：

- 不实现具体 character read/write/chat stats 逻辑。
- 不定义新的业务 payload。
- 不把 repair tooling 扩展为通用数据库维护平台。

第一个可交付切片：

- 只覆盖第一阶段 canonical slice 所需的 drift 与 projection repair。

## 边界规则 / 验收

验收项：

1. repair tooling 至少支持：
   - 列出待 repair 记录
   - 重放单条或批量 projection
   - 重建 chat stats
   - 生成只读 audit 报告
2. repair 默认显式执行，不自动在后台 silent repair。
3. feature flag 开启顺序固定：
   - `enabled`
   - `shadowImport`
   - `reads`
   - `writes`
   - `chatStats`
   - `strict` 作为测试/开发附加 gate
4. rollback 规则固定：
   - 关闭 `reads` 可直接回退到 file-backed reads
   - 关闭 `writes` 前必须先验证 projection 完整性
   - 关闭 `chatStats` 前必须重建或重新标脏 file-backed stats path
5. strict 模式下，audit drift、migration failure、projection failure 不能静默降级为“继续运行但无日志”。

失败边界：

- repair 失败保留现场，不删除 DB 或用户文件。
- 未满足 rollback 前提时，禁止声称系统已安全回退。

## 架构 / 约束

- repair tooling 候选脚本路径为 `scripts/canonical-sqlite-repair.mjs`。
- audit 与 repair 可以共享底层 helper，但 repair 不得隐式在 read/write 请求中运行。
- rollout contract 必须能被 `src/validation-gate-selector.js` 收录为独立 gate。
- 不新增 Web UI 管理台；首阶段以 CLI/operator workflow 为主。

建议 repair 子命令或模式：

- `audit`
- `list-repairs`
- `repair-projection`
- `rebuild-chat-stats`
- `explain-blockers`

## 数据 / 集成

输入：

- canonical DB
- repair metadata
- file projection state
- feature flags

输出：

- repair report
- repair execution result
- rollout blocker summary

集成点：

- `scripts/canonical-sqlite-audit.mjs`
- `scripts/canonical-sqlite-repair.mjs`
- `src/validation-gate-selector.js`
- `src/interaction-performance-report.js`（如需记录 authority/fallback 状态）

兼容与迁移事项：

- repair 只恢复 projection 与 stats 一致性，不改变外部 API shape。
- rollout contract 必须允许 DB 文件保留但 route authority 关闭。

## 验证

建议测试：

```bash
bun run --cwd tests test:unit -- validation-gate-selector.test.js derived-cache-sqlite.test.js --runInBand
```

新增测试应覆盖：

- 各 flag 组合的允许/禁止关系
- projection failure 后 repair intent 可见
- rollback blocker 判断
- strict 模式下 fail-closed 行为

人工检查：

- 文档中对 rollback 的描述与 roadmap 一致
- operator 能只读查看 drift，而不是被迫修复

## Doc ID 契约

无新增 semantic Doc ID。

这是运维/交付合同层，不新增用户可见产品 surface。

## 参考资料

- `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/tech/validation-gate-selector.md`
- `.docs/tech/interaction-performance-indexing.md`
- `src/validation-gate-selector.js`
- `src/derived-cache-sqlite.js`
- `src/interaction-performance-report.js`
- `tests/validation-gate-selector.test.js`
- `tests/derived-cache-sqlite.test.js`

