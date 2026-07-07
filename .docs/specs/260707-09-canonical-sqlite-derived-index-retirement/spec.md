# Canonical SQLite Derived Index Retirement Or Reclassification

## 意图与核心流程

一句话意图：在 canonical DB 已稳定接管 character metadata 和 chat stats 后，消除 `_cache/character-index.sqlite` 与 canonical authority 的语义混淆。

主要参与者或触发条件：

- Phase 5 开始
- DB-first reads/writes/chat stats 均已上线并有 proof
- 团队需要决定 derived index 的最终命运

主路径顺序：

1. 盘点 `_cache/character-index.sqlite` 仍被哪些路径读取。
2. 决定删除、禁用，或重新定义为纯 acceleration sidecar。
3. 更新代码、文档和 validation gate。
4. 证明删除该 sidecar 不会导致数据丢失。

## 范围 / 不做范围

本次要改变什么：

- 为旧 `character-index.sqlite` 选择一个最终定位：
  - 删除
  - 默认禁用
  - 重命名或重新文档化为非 canonical acceleration
- 清理文档中“character index 是正常 fast path authority”的旧说法。

不做范围：

- 不重新设计 canonical schema。
- 不把 derived index 扩展成第二套 canonical store。
- 不在此 spec 中推进 full chat search 或 full World Info migration。

第一个可交付切片：

- 先消除 authority 歧义，再决定是否保留少量 acceleration 能力。

## 边界规则 / 验收

验收项：

1. 对 character metadata + chat stats 来说，系统只剩一个 canonical source：canonical DB。
2. 删除 `_cache/character-index.sqlite` 后不会丢失用户数据。
3. 若保留 derived index，它的文档和代码都必须明确：
   - 它是 derived
   - 可删可重建
   - 不是 route authority fallback
4. interaction performance 文档、validation gate 和相关测试已同步更新。
5. 当前 repo 中不再存在误导性的“character index is the normal list authority”描述。

错误边界：

- 如果仍有运行时路径隐式依赖旧 index，Phase 5 不通过。
- 如果删除 sidecar 后 character list/get 不能维持目标性能或兼容性，需要先补证据再决定保留方式。

## 架构 / 约束

- 该阶段只在 canonical slice 证明完成后开始，不能提前。
- 若保留 sidecar，只能服务非 authority 的 acceleration/observability 用途。
- `src/derived-cache-sqlite.js` 的 reset/delete 语义仍只适用于 derived sidecars。
- `src/validation-gate-selector.js` 必须新增 canonical-storage gate，并更新 derived-cache gate 描述。

## 数据 / 集成

输入：

- canonical DB 已稳定运行的证据
- 现有 derived index 读写路径
- interaction performance 测量结果

输出：

- 删除或重分类后的 derived index 行为
- 更新后的文档和 validation gate

集成点：

- `src/endpoints/character-index.js`
- `src/derived-cache-sqlite.js`
- `src/validation-gate-selector.js`
- `.docs/tech/interaction-performance-indexing.md`
- `.docs/tech/derived-cache-sqlite.md`

兼容与迁移事项：

- 任何前端和扩展可见 payload 不得因 index 退场而变化。
- 如保留 observability 输出，需继续避免暴露用户私有路径。

## 验证

建议测试：

```bash
bun run --cwd tests test:unit -- interaction-performance-index.test.js validation-gate-selector.test.js derived-cache-sqlite.test.js --runInBand
```

新增测试应覆盖：

- 删除或禁用旧 index 后 `/api/characters/*` 仍正常
- derived index 不再作为 authority fallback
- validation gate 能正确提示 canonical storage proof

人工检查：

- 交互性能文档与实际运行路径一致
- 删除 `_cache/character-index.sqlite` 后无数据丢失

## Doc ID 契约

无新增 semantic Doc ID。

现有绑定点：

- `feature.character_library_panel`
- `page.chat_workspace`

## 参考资料

- `.docs/adr/0011-canonical-per-user-sqlite-storage.md`
- `.docs/tech/canonical-sqlite-storage-roadmap.md`
- `.docs/tech/derived-cache-sqlite.md`
- `.docs/tech/interaction-performance-indexing.md`
- `.docs/tech/validation-gate-selector.md`
- `src/endpoints/character-index.js`
- `src/derived-cache-sqlite.js`
- `src/validation-gate-selector.js`
- `tests/interaction-performance-index.test.js`
- `tests/derived-cache-sqlite.test.js`
- `tests/validation-gate-selector.test.js`
