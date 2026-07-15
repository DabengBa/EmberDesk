# Canonical Chat Query And Recovery

## 意图与核心流程

一句话意图：在 chat authority cutover 后，用 canonical indexes、backup manifests 和
operator repair 完成 search/recent、附件一致性、恢复与 Node 26 性能闭环。

Search/recent 从 session/message indexes 查询并重建现有 response shape。Backup 将 DB
revision、projection status 和 managed attachment manifest 绑定为可校验单元。Restore
先验证、隔离 staging、事务替换 canonical state，再产生新 audit；corruption 或 interrupted
operation 必须可诊断、可恢复。

## 范围 / 不做范围

本阶段包括：

- Search/recent query indexes 与 route parity。
- Attachment reference audit、backup/restore、retention 和 operator repair。
- Large-chat query/write/backup benchmarks、阈值与 Node 26.3.0 release proof。

本阶段不包括：

- 不改变 renderer、generation、streaming、message actions 或客户端 load-more。
- 不引入 server pagination、后台 job framework 或外部数据库。

## 边界规则 / 验收

R1: Search/recent payload、排序、limit、过滤和 character/group 语义必须与现有 routes 等价。

R2: Normal canonical search/recent 不得依赖 JSONL directory full scan。

R3: Attachment refs 必须阻止返回已删除或越权 managed media；dangling refs 可审计修复。

R4: Backup manifest 必须绑定 DB revision、schema version、projection state、attachment
hash/inventory，缺失任一项不得声称可恢复。

R5: Restore 必须先验证后提交，失败保持原 authority 可用；成功后必须重新 audit。

R6: Corrupt DB、missing projection、open repair 和 interrupted restore 必须有稳定 operator
status/reason code，不允许静默 fallback 造成双权威。

R7: Node 26 proof 必须覆盖 large-chat search/recent、session save、concurrent read 和 backup，
并记录可复现数据规模与阈值。

R8: 性能不达标时优先调整 indexes/query/schema；不得在本包临时改变浏览器 payload 合同。

## 架构 / 约束

- 依赖 canonical chat authority cutover。
- 使用现有 operator、backup readiness 和 managed media manifest contracts。
- Release proof 必须在 Node.js 26.3.0；其他 Node 版本仅诊断。

## 数据 / 集成

可新增 search/recent indexes、backup metadata、restore journal 和 attachment repair records，
但不复制 message payload 为第二事实源。

## 验证

```bash
bun run --cwd tests test:unit -- canonical-chat-query.test.js canonical-chat-backup-restore.test.js canonical-sqlite-operator.test.js chat-route-service.test.js --runInBand
bun run test:compat
bun run docs:check
```

另在 Node.js 26.3.0 执行并记录 large-chat benchmark/route proof。

## Doc ID 契约

- `page.chat_workspace`：更新 search/recent、backup/restore 与 attachment recovery 行为。
- `feature.chat_message_rendering`：确认查询/恢复后 message payload 仍满足 rendering contract。

## 参考资料

- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `src/endpoints/chat-route-service.js`
- `src/endpoints/chat-backup-helpers.js`

