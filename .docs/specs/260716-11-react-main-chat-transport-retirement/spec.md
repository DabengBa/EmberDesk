# React Main Chat Transport Legacy 退休

## 意图与核心流程

用一个 generation service 统一所有 Main Chat 与自动化 generation request。React composer/actions 发出 visible commands；slash/extension/quiet/background adapters 发出 non-visible commands；service 负责 request assembly、provider routing、streaming、abort、recovery 和 final result，再交给当前 renderer。

前置依赖：compatibility baseline 与 Extensions Host runtime proof 已交付。

## 范围 / 不做范围

包括 direct/group、所有 main API/provider、submit/continue/regenerate/retry/swipe、dry-run、nested-visible、quiet/background、streaming/stop、fallback/recovery、events、legacy transport owner 删除。

不完成 row renderer/edit/windowing，不重写 backend provider endpoints，不改变 prompt semantics 或聊天存储 authority。

## 边界规则 / 验收

R1: generation command 必须显式覆盖 visible direct、visible group、non-OpenAI、submit、continue、regenerate/retry、swipe、dry-run、nested-visible、quiet/background 与 extension-triggered request；不允许 `unsupported -> legacy` 分支。

R2: request assembly 必须保持 provider-specific payload、prompt/world-info/regex/tool call、max tokens、streaming options、group context 与 current settings semantics；backend endpoint/payload contract 不变。

R3: streaming lifecycle 必须保持 connecting/streaming/finalizing/idle、first token、partial output、continue/swipe baseline、stop/abort、user controls 和 one-row finalization；service 不直接依赖 legacy DOM。

R4: bounded auto recovery 保持 original、one primary retry、optional fallback、manual retry CTA；user abort、quiet/dry-run exclusion与 fallback readiness 规则保持。

R5: quiet/background 保持 non-visible/no-row/return-string 语义；nested/dry-run 不产生错误可见 row；group 与 extension automation 的 completion/error shape 保持。

R6: `eventSource`/`event_types` 的 generate-before/after、stream token、message received/rendered 与 extension-observed timing 必须符合 compatibility baseline。

R7: `Generate()`、`StreamingProcessor`、`prepareVisibleGeneration` bridge、visible/quiet transport owner split、hidden transport fallback markers、`mainChatMessageList` transport flag 与 legacy route 必须删除。若 public function name 必须兼容，只能薄 delegator 到 generation service。

R8: failed request 不得重复 user/assistant rows、丢失 composer text 或错误持久化 partial result；success 只保存一次完整 result。

R9: unit/E2E/performance 必须覆盖 request matrix、providers、group、quiet/background、dry-run/nested、stop、retry/fallback、extension generation；semantic docs 更新。

## 架构 / 约束

- generation service 是 framework-neutral command/lifecycle owner；React 使用 TanStack mutation 调用。
- request kind/capabilities 使用现有明确枚举，不建立动态 provider plugin framework。
- provider-specific builders 可保留专用模块，但生命周期与 finalization 统一。
- renderer 通过明确 mutation/result interface 接收 tokens/final result；本包不迁移 DOM renderer。
- public adapters 保持已有 extension API，内部只 delegate。

## 数据 / 集成

- chat array/canonical storage、provider endpoints、settings/secrets、prompt itemization 保持。
- generation result 使用稳定 message identity 与 attempt id，支持下一 renderer spec。
- abort controller 与 retry state 由 generation service 单一拥有。

## 验证

```bash
bun run --cwd tests test:unit -- chat-generation-command-service.test.js chat-generation-lifecycle.test.js chat-generation-auto-recovery.test.js chat-completions-openai-fallback.test.js chat-completions-google.test.js main-chat-bridge-contract.test.js react-workspace-panels-helpers.test.js --runInBand
bun run test:compat
bun run build:react:workspace-panels
bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js third-party-extension-runtime.e2e.js --workers=1
bun run perf:interaction
bun run docs:check
```

## Doc ID 契约

- `page.chat_workspace`：全部 generation family 与 composer/stop result。
- `feature.chat_generation_auto_recovery`：retry/fallback/manual recovery。
- `feature.chat_message_actions`：regenerate/retry/swipe/continue command outcome。
- `feature.fallback_provider`：fallback readiness 与 attempt。

## 参考资料

- `.docs/adr/0012-react-migrated-surface-legacy-retirement.md`
- `.docs/tech/main-chat-generation-lifecycle.md`
- `public/script.js`
- `public/scripts/chat-generation-lifecycle.js`
- `public/scripts/chat-generation-command-service.js`
- `tests/chat-message-streaming.e2e.js`
- Inference：统一 command/lifecycle service、保留 provider builders，是覆盖 request matrix 且避免一个巨型 React component 的最小边界。
