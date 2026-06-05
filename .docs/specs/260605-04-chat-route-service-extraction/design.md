# Chat Route Service Extraction

## 意图与核心流程

意图：在已交付 chat import converter 和 chat backup helper 后，从 `src/endpoints/chats.js` 再抽出一个 route-adjacent chat helper/service，使 chat metadata、search 或 recent assembly 可独立验证。

主要触发条件：用户打开最近聊天、搜索聊天、读取 chat metadata，后端需要遍历 character/group chat files 并返回当前 response shape。

主路径：

1. route 继续负责 Express request/response、user context 和 status code。
2. 新 helper 接收显式 directories、query、pinned、metadata flag 等参数。
3. helper 只负责 deterministic file listing、metadata extraction orchestration 或 result sorting。
4. route 继续调用现有 `getChatInfo()`、path guards、dirty marking 或 backup helper，不改变 side effects。
5. tests 使用 fake directories/fixtures 证明 search/recent result shape 等价。

已交付参考边界：

- `src/endpoints/character-read-service.js` 已证明 route-adjacent service 可以通过 explicit dependency object 隔离 filesystem/index orchestration，同时让 Express route 保持 status code、headers 和 JSON body contract。
- chat service 可复用这个模式，但不能复制 character-specific envelope：如果本步骤需要内部 envelope，必须说明它是否会被 route unwrap，且不得泄漏到 HTTP JSON contract。

## 范围 / 不做范围

范围：

- 优先抽 `/api/chats/search` 或 `/api/chats/recent` 的 assembly helper。
- 可复用 `getChatInfo()`，但不在同一切片重写 line-stream parsing。
- 新增 focused tests 覆盖 character chats、group chats、root chats、pinned sorting、metadata flag、missing/corrupt file skip 行为。
- 测试结构可参考 `tests/character-read-service.test.js`：使用 fake directories、injected dependencies 和 edge-case assertions 覆盖 success 与 fallback，而不是只匹配源码字符串。

不做范围：

- 不改变 JSONL serialization。
- 不改变 `trySaveChat()`、integrity check、backup throttling 或 retention。
- 不改变 `/api/chats/save`、`/api/chats/rename`、`/api/chats/delete`、`/api/chats/import` response shape。
- 不合并 group 和 character chat routes。
- 不移除 character index chat-stat dirty marking。

## 边界规则 / 验收

验收项：

- search/recent helper 在 fake filesystem fixtures 下可独立测试。
- route response 对现有 frontend 保持等价。
- missing directories、missing files、invalid group references、corrupt group JSON 按当前容错方式处理。
- `getChatInfo()` 的 preview、metadata、matcher 语义保持现状。
- chat mutation routes 的 dirty marking、backup 和 integrity behavior 不受影响。

失败边界：

- 如果 helper 需要改变 JSONL parsing 或 integrity behavior，停止并拆成单独 design。
- 如果 route response shape 变化，必须补 semantic/user-facing 说明并重新批准。

## 架构 / 约束

本切片贴合 `.docs/tech/modernization-phase1-complexity-map.md` 对 `src/endpoints/chats.js` 的建议：先抽 pure preview/metadata、shared path resolution、search/recent assembly helpers，再考虑 route-level split。

硬约束：

- chat files 仍是 canonical JSONL files。
- backup helpers 只做 backup planning，route/service 仍尊重 existing backup lifecycle。
- path guards 和 filename sanitization 不得放松。
- group chat 和 character chat 的 response contract 不合并。

推荐实现形态：

- 新建 `src/endpoints/chat-route-service.js` 或更窄的 `chat-search-recent-service.js`。
- 使用 explicit dependency object 传入 `fs`, `path`, `getChatInfo` 或 directory roots，便于测试。
- route handler 只做 request validation、response unwrap/status mapping 和 side-effect sequencing；service 不直接依赖 Express `request` / `response`。

## 数据 / 集成

输入：

- `request.user.directories`
- `query`
- `avatar_url`
- `group_id`
- `pinned`
- `metadata`

输出：

- 当前 `/api/chats/search` 或 `/api/chats/recent` 使用的 JSON payload。

迁移事项：

- 不涉及旧数据迁移。
- 不改变 chat file location 或 filename policy。

## 验证

最低验证：

```powershell
bun run --cwd tests test:unit -- chat-import-converters.test.js chat-backup-helpers.test.js --runInBand
bun run lint
```

delivery 需要新增或扩展 chat route service focused test。若 chat aggregate dirty marking 被触碰，额外运行：

```powershell
bun run --cwd tests test:unit -- interaction-performance-index.test.js --runInBand
```

如果 Express route mounting 或 upload middleware 被触碰，额外运行：

```powershell
bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand
```

## Doc ID 契约

本切片不新增 Doc ID，不改变用户可见语义。

相关 IDs：

- `page.chat_workspace`
- `feature.character_library_panel`

如果 search/recent visible ordering、empty state、error state 或 chat picker behavior 改变，需要更新 owning semantic docs 或另开 UI design。

## 参考资料

- `.docs/tech/modernization-roadmap.md`
- `.docs/tech/modernization-phase1-complexity-map.md`
- `.docs/PROJECT_HISTORY.md`
- `src/endpoints/chats.js`
- `src/endpoints/chat-import-converters.js`
- `src/endpoints/chat-backup-helpers.js`
- `src/endpoints/character-read-service.js`（route-adjacent service precedent）
- `tests/character-read-service.test.js`（focused service edge-case precedent）
- `tests/chat-import-converters.test.js`
- `tests/chat-backup-helpers.test.js`
