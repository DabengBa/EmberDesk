# Canonical Chat Foundation

## 意图与核心流程

一句话意图：建立 lossless canonical chat schema、稳定身份、JSONL shadow import 和 audit，
但保持 JSONL 为 runtime authority。

Importer 解析 character/group JSONL header 与 messages，保留未知字段和原始顺序，映射
managed attachment references，并用 source identity 生成稳定 session/message IDs。
Audit 比较 canonical rows 与文件快照，只记录 clean/blocked 状态，不修复或切 route。

## 范围 / 不做范围

本阶段包括：

- Character/group session、message、swipe、metadata、integrity、attachment-ref schema。
- Idempotent shadow import、stable IDs、lossless round-trip serializer。
- Parse/order/reference/drift audit 与 slice registry/operator 接入。

本阶段不包括：

- 不做 DB-first read/write、search/recent index、backup closure、server pagination。
- 不改变 generation、streaming、renderer、message actions 或 JSONL files。

## 边界规则 / 验收

R1: Import 必须保留 header、message order、role/name/avatar、timestamps、swipes、reasoning、
media/file wrappers、integrity、`chat_metadata` 和未知字段。

R2: Character/group sessions 与 messages 必须有稳定 IDs；重复 import 和文件 rename 不得
重新生成 message identity。

R3: Import 两次必须幂等，且不得修改、重排或删除 JSONL。

R4: Attachment refs 只记录 managed media IDs 和兼容 metadata，不存储 media bytes。

R5: Audit 必须区分 parse failure、duplicate identity、order drift、payload drift、dangling
attachment、missing file 和 unregistered file。

R6: Foundation flag 开启也不得改变 chat route authority；operator status 必须明确
`shadow_only`。

R7: 未知字段无法 lossless round-trip 时 audit 必须 blocked，不能静默丢弃。

## 架构 / 约束

- 依赖 canonical storage slice gate maintenance 与 managed media stable IDs。
- 使用 canonical migration runner，不建立独立 DB。
- JSONL snapshot/parsing 与 route mutation 分离，便于后续复用。

## 数据 / 集成

建议 schema：

- `chat_sessions(id, owner_type, owner_id, source_key, display_name, metadata_json, integrity, ...)`
- `chat_messages(id, session_id, message_order, payload_json, created_at_ms, ...)`
- `chat_message_swipes(message_id, swipe_order, payload_json)`
- `chat_attachment_refs(message_id, blob_id, role, compatibility_json)`

## 验证

```bash
bun run --cwd tests test:unit -- canonical-chat-foundation.test.js canonical-sqlite-migrations.test.js chat-import-service.test.js chat-import-converters.test.js --runInBand
bun run test:compat
bun run docs:check
```

## Doc ID 契约

- `page.chat_workspace`：记录 JSONL 仍是本阶段 runtime authority，canonical rows 仅 shadow。
- `feature.chat_message_rendering`：确认 message payload lossless，但不改变 renderer。
- `feature.chat_message_actions`：确认 swipes/actions data 被建模，但不改变 action owner。

## 参考资料

- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
- `src/endpoints/chats.js`
- `src/endpoints/chat-import-service.js`

