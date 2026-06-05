# Derived Cache Release Hardening

## 意图与核心流程

意图：把 derived SQLite sidecar 和 character index 的发布风险收束到可观察、可降级、可验证状态，确保 cache 问题不会影响 canonical filesystem data。

主要触发条件：server startup、character-index open、schema version check、corrupt DB reset、runtime `force_off`、reset threshold、process shutdown dispose。

主路径：

1. startup 记录 parsed mode，不主动打开 user-root DB。
2. character index 第一次使用时通过 helper open derived SQLite sidecar。
3. helper 应用 PRAGMA、schema version、status logging 和 reset threshold。
4. structural failure 触发 reset/rebuild 或 current-process disabled state。
5. `character-read-service.js` / owning route fallback 到 filesystem behavior，而不是把 sidecar disabled 误当作空列表成功。

## 范围 / 不做范围

范围：

- 补齐或复核 `derived-cache-sqlite` 与 character-index integration 的 release tests。
- 覆盖 mode parsing、status fields、PRAGMA baseline、schema reset、dispose、corrupt DB self-heal、reset threshold、filesystem fallback，以及 read service 在 sidecar/index 失败时的 fallback/error propagation。
- 必要时更新 `.docs/tech/derived-cache-sqlite.md` 的 operator signal 和 recovery 描述。

不做范围：

- 不新增 HTTP `/health` 或 operator UI。
- 不改变 character index business schema，除非 test 暴露 release blocker。
- 不改变 canonical character/chat/world-info files。
- 不支持多个 EmberDesk writer process 共享同一 user root。

## 边界规则 / 验收

验收项：

- `force_off` 明确禁用 sidecar，character list/get 仍可通过 filesystem fallback 工作。
- `node:sqlite` unavailable 或 unsupported path 不导致 route 返回空列表作为成功。
- `readCharacterListPayload()`、`readCharacterSummaryPayload()`、`readCharacterFullPayload()` 在 index read/lookup/refresh failure 下保持已覆盖的 fallback 或 throw behavior。
- schema version mismatch 清理/重建 derived rows，但不触碰 canonical files。
- corrupt DB open 后能 reset 或 disabled，并暴露 status/reason。
- reset threshold 达到后 current process 不反复 reopen/redelete DB。
- dispose 后再 open 行为正常。

失败边界：

- 如果 self-heal 会删除 user root 之外路径，必须视为 blocker 并使用 `isPathUnderParent` 类 guard 修复。
- 如果 fallback 返回空数据而不是 filesystem behavior，必须修复后才能 close。

## 架构 / 约束

`src/derived-cache-sqlite.js` 是 infrastructure helper，只拥有 lifecycle、PRAGMA、schema tracking、status 和 reset threshold。`src/endpoints/character-index.js` 继续拥有 business rules。

`src/endpoints/character-read-service.js` 是当前 character list/get filesystem fallback 的上层协调者。release hardening 若改变 sidecar disabled signal、index lookup error 或 reset threshold behavior，必须同时确认 read service 不会把 disabled/null/failure path 解释成成功空数据。

Derived cache contract：

- SQLite files under `_cache` are rebuildable.
- Filesystem data is canonical.
- Cache unavailability must degrade safely.

Single-process assumption 仍成立；多进程共享 user root 需要另开 locking/database design。

## 数据 / 集成

输入：

- user root
- sidecar key
- schema version
- owner-provided schema hooks
- environment mode

输出：

- SQLite handle 或 disabled/fallback signal
- read-only status
- structured console operator records

迁移事项：

- 不涉及用户数据迁移。
- schema reset 只影响 derived SQLite table/rows。

## 验证

最低验证：

```powershell
bun run --cwd tests test:unit -- derived-cache-sqlite.test.js interaction-performance-index.test.js --runInBand
bun run --cwd tests test:unit -- character-read-service.test.js --runInBand
bun run lint
```

如果更新 docs：

```powershell
bun run docs:check
```

delivery 的 audit 必须明确记录：corrupt DB、force_off、schema mismatch、threshold disabled、filesystem fallback 的证据是否覆盖。

## Doc ID 契约

本切片不新增 Doc ID，不改变用户可见语义。

相关 IDs：

- `feature.character_library_panel`
- `page.chat_workspace`

如果后续暴露 operator UI 或 `/health` endpoint，需要另开 API/UI design，并决定是否新增 semantic Doc ID。

## 参考资料

- `.docs/tech/derived-cache-sqlite.md`
- `.docs/tech/interaction-performance-indexing.md`
- `.docs/tech/modernization-roadmap.md`
- `src/derived-cache-sqlite.js`
- `src/endpoints/character-index.js`
- `src/endpoints/character-read-service.js`
- `src/endpoints/characters.js`
- `tests/character-read-service.test.js`
- `tests/derived-cache-sqlite.test.js`
- `tests/interaction-performance-index.test.js`
