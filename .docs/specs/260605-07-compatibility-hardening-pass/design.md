# Compatibility Hardening Pass

## 意图与核心流程

意图：把当前 modernization 的兼容边界从“知道不能碰”升级为“测试和文档都能发现破坏”，让 extension、regex、slash command、shared library 和 character-list DOM identity 成为 release boundary。

主要触发条件：任何后续 slice 触碰 public browser surface、extension imports、regex placement、slash-command APIs、`public/lib.js` 或 character-list row identity。

主路径：

1. 盘点 protected surfaces 和当前 tests 覆盖。
2. 扩展 focused compatibility tests，只补真实边界缺口。
3. 不改变 public API，不删除 exports，不重命名 selectors。
4. 在 `.docs/tech` 中记录 release boundary 和测试命令。
5. 将 `bun run test:compat` 继续作为 frontend compatibility preflight/postflight gate。

## 范围 / 不做范围

范围：

- 复核并补强 `tests/third-party-extension-compatibility.test.js`。
- 复核 shared library boundary proof。
- 覆盖 character-list identity selectors 和 `@sillytavern/*` aliases 的关键断言。
- 明确 regex placement numeric values、slash-command public exports、`eventSource`、`event_types` 的保护规则。
- 复核 `/api/characters/all`、`/api/characters/list`、`/api/characters/get` 仍只暴露旧 JSON shape；`character-read-service.js` 的 `result.mode`、`latencyHint`、`filter`/`pagination` context 是内部边界，不是 frontend/extension compatibility surface。

不做范围：

- 不删除 deprecated public surface。
- 不迁移 extension API。
- 不改变 regex engine、slash-command parser、message rendering 或 streaming。
- 不重写 `public/lib.js` bundling。
- 不把 compatibility pass 变成 broad frontend cleanup。

## 边界规则 / 验收

验收项：

- `bun run test:compat` 覆盖当前 protected surfaces，并在破坏 selector/export/alias/value 时失败。
- `frontend-shared-library-boundary.test.js` 继续证明 source import 与 bundled `/lib.js` contract。
- character-list row identity 覆盖 `.character_select`、`.group_select`、`data-chid`、legacy `chid`、`id="CharID${chid}"` 等稳定点。
- character route compatibility proof 不允许把 internal read-service envelope 暴露给 browser callers；route 必须继续 unwrap `payload.result.data`。
- regex placement values 和 slash-command public exports 有 focused compatibility proof。
- 文档列出 compatibility gate 的适用场景。

失败边界：

- 如果某个 public surface 需要移除或重命名，停止本 pass，另开 migration design。
- 如果测试需要依赖 vendored extension build artifact，优先通过 first-party compatibility fixture 表达边界，不自动格式化 vendored code。

## 架构 / 约束

本切片保护的是 modernization 的公共边界，不引入新架构。

硬约束：

- `public/script.js` 的 `eventSource`、`event_types`、`globalThis.SillyTavern` 不做 incidental cleanup。
- `public/lib.js` 保持 dual source-import and bundled browser contract。
- `@sillytavern/*` aliases 是 extension compatibility surface。
- regex placement numeric values 不能因重排常量而改变。

## 数据 / 集成

输入：

- existing compatibility tests
- browser module exports
- route-independent frontend compatibility fixtures
- route-level response shape fixtures for character list/get when compatibility coverage touches character data flow

输出：

- stronger compatibility tests
- possibly updated `.docs/tech/third-party-extension-compatibility.md` or related tech note

迁移事项：

- 不涉及用户数据迁移。
- 不改变 API schema。

## 验证

最低验证：

```powershell
bun run test:compat
bun run --cwd tests test:unit -- frontend-shared-library-boundary.test.js character-list-structure.test.js --runInBand
bun run --cwd tests test:unit -- character-read-service.test.js interaction-performance-index.test.js --runInBand
bun run lint
```

如果更新 semantic docs：

```powershell
bun run docs:check
```

## Doc ID 契约

本切片不新增 Doc ID，不改变用户可见语义。

相关 IDs：

- `term.shared_browser_library`
- `feature.extension_panel_open`
- `feature.character_library_panel`
- `feature.character_delete`
- `page.chat_workspace`

如果 compatibility change 改变 extension panel visible behavior 或 character library behavior，需要更新 owning `.docs/db` docs。

## 参考资料

- `.docs/tech/modernization-roadmap.md`
- `.docs/tech/modernization-phase1-complexity-map.md`
- `.docs/tech/frontend-shared-library-boundary.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/db/terms/shared-browser-library.md`
- `.docs/db/features/extension-panel-open.md`
- `public/script.js`
- `public/lib.js`
- `src/endpoints/character-read-service.js`
- `tests/third-party-extension-compatibility.test.js`
- `tests/character-read-service.test.js`
- `tests/frontend-shared-library-boundary.test.js`
- `tests/character-list-structure.test.js`
