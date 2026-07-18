# React Main Chat Renderer Legacy 退休

## 意图与核心流程

让 React 负责聊天打开、窗口化、所有 message rows、streaming update、edit/action、extension mutation 与阅读位置。Formatting/sanitization 保持为无 DOM owner 的 service；React 产生稳定兼容 DOM。

前置依赖：`react-main-chat-transport-retirement` 已交付。

## 范围 / 不做范围

包括 stored/finalized/streaming/editing/system/unsafe/extension rows、rich body、reasoning/media/files、actions/swipes、long-chat load-more/restore、legacy renderer/formatter DOM path/flag/fallback 删除。

不改变 generation transport、chat API/storage authority、markdown/regex/sanitizer output contract 或 root shell navigation。

## 边界规则 / 验收

R1: React 必须独立渲染所有 supported row families：user、assistant、system、first message、stored、finalized、active streaming、editing、swipe variants、reasoning、media、files、bias、error/recovery 和 extension-mutated。

R2: 每个 row 必须保留 `#chat > .mes`、`.mes_text`、`.mes[mesid]`、`.last_mes`、role attributes、reasoning/media/file/swipe/action selectors 与 message identity/order。

R3: markdown、code highlight、LaTeX、regex placement/order、macro/comment/system formatting、sanitization、reasoning/media/file/bias HTML 必须由 framework-neutral render service 生成；service 不直接插入 DOM。

R4: streaming tokens、finalization、edit start/save/cancel、copy/delete/regenerate/retry/swipe 与 extension actions 必须更新同一 React row，不得 remount 为第二 row、丢 focus 或重复 events。

R5: extension-owned mutations 必须通过稳定 mutation zones/imperative hosts 存活于 React reconciliation；JS-Slash-Runner `.TH-streaming`/`.TH-render` representative behavior 不得被覆盖或吞掉。

R6: React windowing 必须独立拥有 initial bounded range、load earlier、scroll anchor、per-chat restore、chat switch、return latest reachability 和 mobile；不得调用 legacy `showMoreMessages()`。

R7: `printMessages()`、`redisplayChat()`、`addOneMessage()`、DOM-owning `updateMessageElement()`、legacy formatting insertion、`showMoreMessages()`、row fallback classifiers/markers、message-list flag 与 build/unsafe fallback 必须删除。Documented formatting exports 可薄 delegate 到 render service。

R8: empty/loading/error/recovery、long chat、deleted message、late token、chat switch 与 failed edit 必须有确定状态；不得留下 blank chat、stale row 或 wrong-chat mutation。

R9: performance evidence 必须覆盖 stored chat first visible、5k/large history window、stream first token、scroll/load-more、edit/action；不得显著劣化。

R10: compatibility/E2E/semantic docs 必须证明 row selectors、events、extension mutations、desktop/mobile 与 sole owner。

## 架构 / 约束

- render descriptor/service 复用现有 formatter logic，逐步移除 DOM side effects。
- React row component 直接输出 protected structure；extension mutation zone 使用稳定 host node 和 lifecycle contract。
- TanStack Virtual 只窗口化 rows，不改变 logical order/message identity。
- actions 使用已有 controller semantics 或迁入 React command handlers，不复制 chat persistence。
- 不新增 renderer framework 或第二 markdown pipeline。

## 数据 / 集成

- chat message schema、mesid、swipes、reasoning/media/file fields、events 和 save API 保持。
- window snapshot 只存当前 page session 的 chat id/anchor/range。
- formatter public exports 若保留，输出与当前 contract 等价。

## 验证

```bash
bun run --cwd tests test:unit -- chat-message-render-descriptor.test.js chat-message-actions-controller.test.js chat-workspace-structure.test.js react-workspace-panels-helpers.test.js --runInBand
bun run test:compat
bun run build:react:workspace-panels
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js chat-message-layout.e2e.js chat-message-list-walkthrough.e2e.js chat-message-streaming.e2e.js third-party-extension-runtime.e2e.js --workers=1
bun run perf:interaction
bun run docs:check
```

## Doc ID 契约

- `feature.chat_message_rendering`：所有 row family、rich body、windowing、extension zones 与 sole owner。
- `feature.chat_message_actions`：edit/copy/delete/regenerate/retry/swipe actions。
- `feature.chat_generation_auto_recovery`：failed/final recovery row。
- `page.chat_workspace`：chat open/switch/scroll/empty/error。

## 参考资料

- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `.docs/tech/main-chat-rendering-call-chain.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `public/scripts/chat-message-render-descriptor.js`
- `app/workspace-panels.tsx`
- `tests/chat-message-rendering.e2e.js`
- Inference：稳定 imperative mutation zone 可让 React 成为 row owner，同时保留第三方 extension 对既有 DOM 的受支持修改。
