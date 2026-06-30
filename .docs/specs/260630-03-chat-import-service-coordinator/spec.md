# Chat Import Service Coordinator 规格

## 意图与核心流程

意图：把 `POST /api/chats/import` 的格式转换、目标文件计划和错误分类抽到 route-adjacent coordinator，使导入行为可单元测试，同时保持 Express 路由和 HTTP contract 不变。

触发条件：用户通过现有聊天导入入口上传外部 chat 文件，路由需要转换为 EmberDesk JSONL 并写入文件正本。

主路径：
1. Express route 接收 request、校验 avatar/file/user 输入并保留现有 upload cleanup。
2. route 调用 coordinator，传入 directories、body、file、converter dependencies。
3. coordinator 复用 `chat-import-converters.js` 选择转换器并生成写入计划。
4. route 或 coordinator 按既有顺序写入 canonical JSONL 文件。
5. route 返回与当前一致的成功或错误响应。

Checkpoint A：
- 目标结果：降低 `src/endpoints/chats.js` import route 复杂度。
- 当前状态：已有 `chat-import-converters.js` 和 `chat-route-service.js`，但 import route 仍混合 request、conversion、write、response。
- 假设：第一步只处理 `/api/chats/import`，不处理 group import。
- 硬约束：Express runtime owner、file-backed chats、response shape 保持。
- 风险：错误拆分会改变导入格式兼容或 JSONL serialization。
- 未决问题：无；默认保守迁移。
- 推荐默认：coordinator 返回内部结果，route 继续映射 HTTP。

Grill 复核结论：
- 反证：不需要引入 Hono、typed API 或重写所有 chat routes；`/api/chats/import` 的复杂度可通过 route-adjacent coordinator 单独降低。
- 复用：继续复用 `chat-import-converters.js` 和 `markCharacterChatStatsDirtySafe()`；新增 service 只协调转换、写入计划和错误分类。
- Tiger：Express 5 会把 rejected Promise 交给 error middleware，但当前 route 的外部 contract 多处返回 `send({ error: true })`；实现不能因为 async coordinator 而把这些失败改成通用 500 或 HTML/error middleware 响应。
- Tiger：当前 `json` 分支在 unknown format 时会先 unlink upload，`jsonl` 成功时会 unlink upload；service 化必须明确 upload cleanup owner，避免临时文件泄漏或重复 unlink。
- Paper Tiger：把 route 改成 `async` 本身不是风险；真正风险是 response shape 和 cleanup 顺序漂移。

## 范围 / 不做范围

范围：
- 新增 `src/endpoints/chat-import-service.js` 或等价 route-adjacent coordinator。
- 复用已有 `chat-import-converters.js`，不重写转换器。
- 覆盖成功导入、unsupported format、parse failure、missing file、write target planning、upload cleanup 协作。
- 新增 `tests/chat-import-service.test.js` 或扩展现有 focused tests。

不做范围：
- 不改变 `/api/chats/import` response body、status code、toast 文案或前端行为。
- 不改变 `/api/chats/group/import`。
- 不改变 save/rename/delete/export。
- 不引入 Hono 作为默认 endpoint 框架。
- 不改变 canonical chat JSONL 文件格式。
- 不新增数据库或 cache 正本。

## 边界规则 / 验收

- 现有导入格式继续通过 `chat-import-converters.js` 处理。
- character chat 导入仍写入 `request.user.directories.chats` 下对应角色目录中的 `.jsonl` 文件。
- 文件名仍使用现有 sanitize/path guard 规则。
- 失败时 upload cleanup 仍执行，HTTP 错误响应和日志语义不变。
- coordinator 不直接依赖 Express `request` / `response` 对象。
- 若导入成功需要标记 character chat stats dirty，现有 dirty marking 行为不得丢失。

## 架构 / 约束

- 贴合 ADR-0010：Express 5 继续是 runtime owner，coordinator 不是 framework migration。
- route 负责 middleware、request/response、status mapping。
- service 负责 deterministic conversion/write planning 和可测试 side-effect ordering。
- 使用现有 `sanitize-filename`、`write-file-atomic`、path helper；不写 ad hoc path 拼接。

## 数据 / 集成

- 输入：uploaded file buffer/path、`avatar_url`、`character_name`、`user_name`、导入格式字段、用户 directories。
- 输出：内部 result，例如 `{ ok, fileName, errorKind }`；HTTP shape 由 route 映射为现有响应。
- 存储：canonical chat JSONL 文件，仍在 file-backed user directories 下。
- 迁移：无。

## 验证

最小验证：
```bash
bun run --cwd tests test:unit -- chat-import-converters.test.js chat-route-service.test.js --runInBand
```

实现新增 service 后追加：
```bash
bun run --cwd tests test:unit -- chat-import-service.test.js --runInBand
```

如触碰 Express route ordering 或 middleware，追加：
```bash
bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand
```

完成证据：
- 旧 converter tests 仍绿。
- 新 service tests 覆盖内部结果和错误分类。
- `src/endpoints/chats.js` 仍 owns Express response mapping。

## Doc ID 契约

默认不改变用户可见导入流程，不新增 Doc ID。

若实现改变导入提示、错误文案或用户流程，需评估并更新：
- `page.chat_workspace`
- `feature.chat_history`

## 参考资料

- `.docs/tech/briefs/260630-03-chat-import-service-coordinator.md`
- `.docs/adr/0010-express-runtime-owner-boundary.md`
- `.docs/adr/0008-hono-route-island-under-express-host.md`
- `.docs/tech/server-startup-orchestration.md`
- `.docs/tech/briefs/260605-04-chat-route-service-extraction.md`
- `src/endpoints/chats.js`
- `src/endpoints/chat-import-converters.js`
- `src/endpoints/chat-route-service.js`
- `tests/chat-import-converters.test.js`
- `tests/chat-route-service.test.js`
- https://expressjs.com/en/5x/guide/error-handling/
- https://expressjs.com/en/guide/migrating-5.html
- Inference: 先抽 character chat import coordinator，因为它复用已存在 converter proof，且比全 chat route split 风险更低。
