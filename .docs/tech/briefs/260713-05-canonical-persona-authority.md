---
created: 2026-07-13
source: user
confirmed: true
last_updated: 2026-07-14
feature_slug: canonical-persona-authority
status: superseded
---

# Canonical Persona Authority Intent

## 2026-07-14 结论

本 brief 已被当前代码事实取代，不再对应可执行实施包。

现有 canonical settings 已经以带 revision 的完整 JSON document 保存
`power_user.personas`、`power_user.persona_descriptions`、默认 persona 和连接状态；
`public/scripts/personas.js` 的 mutation 也仍通过完整 settings 保存合同工作。对这种低频、
强兼容、嵌套字段可能由扩展补充的数据，单独规范化 persona tables 会引入双向
compose/decompose、未知字段往返和 rollback 复杂度，但当前没有可证明的查询或一致性收益。

长期所有权调整为：

- persona 记录、默认值和 character/group connections：canonical settings document；
- persona avatar 身份与生命周期：canonical managed media；
- chat-local persona lock：后续 canonical chat metadata。

旧 process directory 已在 2026-07-14 经用户确认后删除；当前结论仅由本 brief、路线图和
owning docs 维护。

## 目标结果

将 persona identity、name、description、title、prompt placement、default state 和
character/group connections 从 settings document 规范化到 canonical tables，并引用
managed persona avatar identity。

以上是被取代的原始目标，不再是当前推荐架构。

## 约束

- Chat-local persona lock 当前属于 `chat_metadata`，由 chat authority spec 最终接管。
- Settings API 在迁移期间继续组合现有 `power_user.personas` 和
  `power_user.persona_descriptions` payload。
- Persona macros、events、selection 和 avatar compatibility URL 保持。

## 验收标准

- Persona create/update/delete/default/connection 行为在 DB-first 模式下保持。
- Settings projection 与 canonical persona rows 的 drift 可检测。
- 删除 persona 不会留下失效 default、connection 或 chat-lock 引用。

## 参考资料

- `public/scripts/personas.js`
- `public/scripts/power-user.js`
- `public/script.js`
- `src/user-directories.js`
