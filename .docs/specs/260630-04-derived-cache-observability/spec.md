# Derived Cache 可观测性规格

## 意图与核心流程

意图：让 interaction performance artifact 记录 character-index derived SQLite sidecar 的状态和 fallback reason，使性能结论能解释当前使用的是 fast path 还是 filesystem fallback。

触发条件：开发者运行 `bun run perf:interaction` 或直接运行 `scripts/interaction-performance-runner.mjs` 比较 character index on/off 行为。

主路径：
1. runner 启动 sqlite_on / sqlite_off 变体。
2. 现有 route 和 headers 继续记录 interaction path 与 server timing。
3. runner 从已有只读 status surface 或启动/响应证据收集 sidecar status。
4. `src/interaction-performance-report.js` 将 status/fallback reason 汇总进 JSON/Markdown artifact。
5. 报告清楚区分 `force_on`、`force_off`、`unsupported`、`reset_threshold_exceeded`、open/rebuild/fallback。

Checkpoint A：
- 目标结果：性能报告可解释 derived cache 状态。
- 当前状态：derived helper 已有 status/logging，runner 已有 on/off variant 和 interaction path headers。
- 假设：不需要新增 HTTP health endpoint；runner 可通过现有可读状态或 artifact 数据记录。
- 硬约束：SQLite sidecar 仍是 derived cache，不是 canonical storage。
- 风险：为了观测新增 runtime API 会扩大攻击面或维护面。
- 未决问题：无；默认只读 artifact。
- 推荐默认：扩展 runner/report，不改用户请求语义。

Grill 复核结论：
- 反证：不需要新增 `/health`、operator UI、ORM 或新的 cache sidecar；现有 `getCharacterIndexStartupStatus()` / `getCharacterIndexStatus(userRoot)` 足以服务性能 artifact。
- 复用：继续使用已有 `X-EmberDesk-Interaction-Path` 和 `Server-Timing` 证据；新增字段只解释 sidecar 状态，不改变 route JSON。
- Tiger：`Server-Timing` 能向浏览器暴露服务端性能指标；报告和 header 不得泄露完整 data root、用户名、文件名或敏感路径。
- Tiger：Node `node:sqlite` 是 `node:` scheme 模块；实现必须继续保留 unsupported fallback，不能假设所有 Node-like runtime 都可用。
- Paper Tiger：在 artifact 中记录 `force_off` / `unsupported` 不会增加用户攻击面，只要不新增 HTTP endpoint 且不输出敏感路径。

## 范围 / 不做范围

范围：
- 在 interaction performance report 中增加 character-index sidecar status/fallback reason 字段。
- 复用现有 `getCharacterIndexStartupStatus()`、`getCharacterIndexStatus(userRoot)` 或等价只读状态函数。
- 更新 `tests/interaction-performance-report.test.js` 覆盖 Markdown/JSON summary。
- 如需要，给 runner 增加内部采样逻辑，但不暴露 HTTP endpoint。

不做范围：
- 不新增 canonical database。
- 不引入 Drizzle 或 ORM。
- 不新增 `/health`、admin UI 或 operator API。
- 不改变 character-index schema、freshness、reset、circuit breaker。
- 不改变 `/api/characters/all` 或 `/api/characters/get` JSON contract。

## 边界规则 / 验收

- `sqlite_on` artifact 能说明 mode/status，至少包含 mode、supported/open、disabledReason 或 fallback reason。
- `sqlite_off` artifact 能说明 `force_off`，避免把 off-path 误判为 performance regression。
- `unsupported` runtime 下报告能保留 filesystem fallback 解释。
- reset threshold disabled 时报告显示 disabled reason，而不是只显示慢路径。
- 报告字段不得包含用户敏感数据或完整 data root 中的私密路径；如需要路径，只允许现有非敏感 artifact 规则。

## 架构 / 约束

- 遵循 `.docs/tech/derived-cache-sqlite.md`：helper owns lifecycle/status，entity module owns schema/business rules。
- 遵循 ADR-0009：不采用 Drizzle，不把 sidecar 扩成 canonical model。
- 性能结论必须保留语义等价检查，不能只看耗时。
- Bun/Node 边界遵循 `.docs/tech/bun-workflow.md`：应用运行时仍是 Node.js 26.3.0。

## 数据 / 集成

- 输入：runner variant、interaction response headers、character-index read-only status。
- 输出：`artifacts/interaction-perf/**/report.json` 和 `report.md` 新增 status/fallback summary。
- 存储：仅 performance artifact；不写用户数据。
- 迁移：无。

## 验证

最小验证：
```bash
bun run --cwd tests test:unit -- interaction-performance-report.test.js derived-cache-sqlite.test.js interaction-performance-index.test.js --runInBand
```

可选手动证据：
```bash
bun run perf:interaction
```

完成证据：
- report tests 证明 sqlite_on/off/unsupported/disabled reason 的输出。
- derived cache tests 仍证明 fallback、reset 和 circuit breaker。
- artifact 不改变用户 API response。

## Doc ID 契约

本 slice 只改变开发性能 artifact，不改变用户可见功能，不新增 Doc ID。

如后续新增 operator UI 或 health endpoint，必须另开 spec 并评估：
- `feature.character_library_panel`
- `term.derived_cache`

## 参考资料

- `.docs/tech/briefs/260630-04-derived-cache-observability.md`
- `.docs/adr/0009-derived-cache-sqlite-drizzle-decision.md`
- `.docs/tech/derived-cache-sqlite.md`
- `.docs/tech/interaction-performance-indexing.md`
- `.docs/tech/briefs/260605-05-derived-cache-release-hardening.md`
- `src/derived-cache-sqlite.js`
- `src/endpoints/character-index.js`
- `src/interaction-performance-report.js`
- `scripts/interaction-performance-runner.mjs`
- `tests/interaction-performance-report.test.js`
- https://nodejs.org/api/sqlite.html
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Server-Timing
- https://developer.mozilla.org/en-US/docs/Web/API/PerformanceServerTiming
- Inference: 先做报告可观测性，因为它提高性能决策质量且不扩大数据模型。
