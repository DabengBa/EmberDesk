# Phase 3 Sprint 2: 消息列表 - Rich Message Body

## 所属阶段

- **路线图**：[React 现代化路线图](../../tech/react-modernization-roadmap.md#phase-3-主聊天工作区迁移6-个月最高风险)
- **Phase**：[Phase 3 - 主聊天工作区迁移](README.md)
- **Sprint**：Phase 3 Sprint 2（全局 Sprint 15/40）
- **预计工期**：2 周
- **风险等级**：中
- **交付状态**：已交付
- **实施入口**：本页是路线图级 Sprint 摘要；进入实现时以 dated spec [`260620-02-react-phase3-sprint2-main-chat-rich-message-bodies/spec.md`](../260620-02-react-phase3-sprint2-main-chat-rich-message-bodies/spec.md) 为准

---

## 目标

在不破坏 outer `.mes` row shell、streaming、load-more 和 message actions owner 的前提下，为已定稿消息行建立 guarded React rich-body snapshot / owner-marker boundary。

### 主要交付物

1. 为 eligible finalized rows 建立 narrow rich-body bridge payload
2. 在 React 中用 Zod 校验这些 payload，并只在既有 `.mes_block` 内插入 hidden per-row owner markers
3. 继续复用 legacy `getMessageTextHTML()` / `messageFormatting()` 与媒体/附件装配输出，而不是在本 Sprint 重新发明 Markdown / LaTeX / sanitizer / media parser
4. 保持 outer `.mes[mesid]`、header/buttons/swipe affordance、`#show_more_messages` 与 delegated handlers
5. 为 per-row fail-closed fallback 提供验证路径

### 成功标准

- ✅ flag 开启时，eligible finalized rows 会得到 hidden owner markers，但 outer `.mes[mesid]` direct-child 关系保持
- ✅ stored chat / long chat / finalized streaming row 继续显示与当前一致的 Markdown、代码高亮、LaTeX、reasoning、媒体和文件内容
- ✅ active streaming row、editing row、load-more 和 message actions 继续保留 legacy owner
- ✅ 任一 row 的 rich-body mount 或 schema 校验失败时，该行立即退回 legacy，不出现双重内容或空白 wrapper

---

## 技术设计

### 真实迁移边界

- 本 Sprint 不是“新增 Markdown/媒体能力”。这些能力已经存在于 legacy `messageFormatting()`、`getMessageTextHTML()`、reasoning/media/file wrappers 和相关工具链里。
- 本 Sprint 的真实任务是：把 rich-body bridge / owner-marker 边界从 legacy 扩到 React，同时继续复用 legacy 已经格式化/消毒/装配完成的结果。
- outer `.mes` row shell 继续由 legacy `updateMessageElement()` 和 `message_template` 拥有。
- 实际交付没有引入第二套 React rich-body renderer；React 只校验 snapshot，并在既有 `.mes_block` 内认领该行。

### 推荐实现边界

1. 保持 `features.react.panels.mainChatMessageList` 作为 Sprint 1 和 Sprint 2 共用 flag。
2. 为当前可见、非 streaming、非编辑态、已定稿 rows 生成 rich-body snapshot。
3. 在 React 中只校验 snapshot，并向既有 `.mes_block` 插入 hidden per-row owner markers，不新建平行可见 rich-body tree。
4. rich-body HTML 必须继续来自 legacy helper 输出；React 不在本 Sprint 独立重写 Markdown / LaTeX / 代码高亮 / sanitizer / attachment 逻辑。
5. 任何单行失败都要 fail-closed 到 legacy。

---

## 验证清单

- [x] outer `#chat > .mes[mesid]` 关系保持
- [x] eligible stored/finalized rows 的 rich-body snapshot / hidden owner markers 能挂到既有 `.mes_block`，且视觉结果继续由 legacy rendering chain 提供
- [x] active streaming row 继续由 legacy 处理，finalization 后不复制 assistant row
- [x] long chat + `#show_more_messages` 继续可用
- [x] 任一 row mount 失败时，该行退回 legacy

---

## 下一步

👉 [Phase 3 Sprint 3: 消息列表 - 滚动和定位](phase3-sprint3-message-list-scroll.md)
