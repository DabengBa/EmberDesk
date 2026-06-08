# Architecture Deepening Spec Set Intent

Date: 2026-06-09

## Original Request

用户先要求对提交 `00c60a8b9 feat(chat): keep a fallback line ready for recovery` 做 `$code-review` 并修复发现的问题，随后要求使用 `C:\SyncFiles\Softwares_Downloads\dev\Agents-Prompt\低频skills\improve-codebase-architecture` 检查项目。检查输出了五个架构深化候选项后，用户要求“针对每一项,编写一个或多个spec用于进一步分析和实现”。

## Context

`.docs/tech/modernization-roadmap.md` 已在 2026-06-05 冻结，后续架构工作必须通过 successor proposal、spec 或 ADR-backed design 启动，不能继续往旧 roadmap 追加实现切片。

2026-06-08 主聊天 successor proof set 和 fallback 自动恢复已经交付，2026-06-09 的 code review 又修复了 fallback/auto recovery 的两个回归风险：`continue`/`swipe` 失败恢复不能清空既有助手消息，fallback API key 保存后不能留在真实输入框中。本轮 specs 必须把这些事实当作当前状态，而不是重新设计同一条 fallback 功能。

## Intent

把五个架构深化候选项分别写成可审批、可实施的第一个交付切片。每个 spec 都应把浅层、分散的实现收束为更深的模块接口，让调用方和测试通过更小的接口获得更多行为覆盖，并提升后续维护的 locality。

本轮只写规格，不实现代码。

## Candidate Domains

1. 主聊天生成生命周期：围绕 `public/script.js` 的 `Generate()`、`StreamingProcessor`、`saveReply()` 和 `public/scripts/openai.js` 的 `sendOpenAIRequest()`，集中 attempt sequencing、stream finalization、失败行恢复和事件发出时机。
2. 角色卡写命令模块：围绕 `src/endpoints/characters.js` 的 create/edit/merge/import 写路径，把路由收敛为 adapter，让命令模块拥有 canonical card mutation、thumbnail 和 character-index 副作用顺序。
3. 外部内容下载/导入管线：围绕 `src/endpoints/content-manager.js`、`src/endpoints/assets.js` 和 `src/private-request-filter.js`，集中来源分类、白名单 fetch、下载 artifact 形状和失败分类。
4. Secret 和 provider connection UI 状态：围绕 `public/scripts/secrets.js`、`public/scripts/openai.js` 和 `src/endpoints/secrets.js`，把 provider-owned secret field 的读、写、清理和状态计算集中到一个前端状态模块，后端继续作为 storage adapter。
5. 结构复杂前端表面的契约测试：围绕 `tests/character-list-structure.test.js`、`tests/world-info-card-rendering.test.js`、`tests/chat-workspace-structure.test.js` 和 `tests/secrets-input-map.test.js`，抽出测试侧 helper，减少脆弱源码字符串检查。

## Constraints

- 不引入 React、Vue、TypeScript application code 或 SPA 框架。
- 不改变 file-backed canonical storage；SQLite character index、DiskCache 和 thumbnails 仍是 derived cache 或派生副作用。
- 不改变 `#chat > .mes`、`.mes_text`、`.mes[mesid]`、`.last_mes`、`eventSource`、`event_types`、`globalThis.SillyTavern`、`@sillytavern/*` 等兼容表面，除非单独 spec 明确要求并提供 compatibility proof。
- 不扩展 fallback provider 功能，不增加新的 provider routing 系统，不重复 2026-06-08 已交付的自动恢复功能。
- 不把 route response shape、secret storage shape、character card file shape 或 public browser module exports 当作普通 cleanup 变更。
- 每个 spec 只覆盖第一个可交付切片；后续更大拆分需要新的 spec 或 ADR。

## Recommended Spec Set

1. `.docs/specs/260609-01-chat-generation-lifecycle-coordinator/spec.md`
2. `.docs/specs/260609-02-character-card-write-command/spec.md`（当前 HEAD `f337e5ffe` 已交付；过程 spec/plan 不在当前树中，durable source 改用 `.docs/tech/briefs/260609-02-character-card-write-command.md` 与 `.docs/PROJECT_HISTORY.md`）
3. `.docs/specs/260609-03-external-content-import-pipeline/spec.md`
4. `.docs/specs/260609-04-provider-secret-field-state/spec.md`
5. `.docs/specs/260609-05-frontend-structure-contract-tests/spec.md`

## Evidence Trail

- `.docs/PROJECT_HISTORY.md`
- `.docs/tech/modernization-roadmap.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/tech/frontend-jquery-slice-migration.md`
- `.docs/tech/briefs/260607-01-main-chat-successor-spec-set.md`
- `.docs/tech/briefs/260608-01-main-chat-next-successor-spec-set.md`
- `.docs/tech/briefs/260608-09-main-chat-auto-retry-fallback-provider.md`
- `public/script.js`
- `public/scripts/openai.js`
- `public/scripts/secrets.js`
- `src/endpoints/characters.js`
- `src/endpoints/content-manager.js`
- `src/endpoints/assets.js`
- `src/private-request-filter.js`
- `src/endpoints/secrets.js`
- `tests/character-list-structure.test.js`
- `tests/world-info-card-rendering.test.js`
- `tests/chat-workspace-structure.test.js`
- `tests/secrets-input-map.test.js`
- OpenAI API docs, streaming responses: https://developers.openai.com/api/docs/guides/streaming-responses
- OpenAI API docs, rate limits: https://developers.openai.com/api/docs/guides/rate-limits
- OWASP SSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- Testing Library guiding principles: https://testing-library.com/docs/guiding-principles/
- Open WebUI features: https://docs.openwebui.com/features/
- Open WebUI RAG docs: https://docs.openwebui.com/features/rag/
- Msty Knowledge Stacks: https://docs.msty.studio/knowledge-stacks/overview
- ChatGPT Projects: https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt

## Grill Review Addendum: 2026-06-09

用户要求本轮不要继续提问，而是联网搜索、自问自答，并使用 Claude Code 只读复核后综合修改文档。

Self-Q&A 结论：

- Q: 外部产品趋势是否要求把本轮五个切片扩大成 workspace/project/RAG/tools 能力？A: 不应扩大。本轮目标是架构深化和局部可测试性，不是产品能力跃迁；这些方向继续走 successor/ADR gate。
- Q: 02 的空 process spec 目录是否要重新补一份 spec/plan？A: 不补过程文件。`f337e5ffe` 已交付角色卡写命令边界，当前 durable source 是 brief、project history、tech doc 和测试证据；重新生成已归档过程文件会制造假历史。
- Q: 外部证据真正改变了哪些验收？A: 它没有改变功能范围，但把有限重试、stream finalization、SSRF 二级 fetch 覆盖、selector/readiness 单一来源和 accessible contract testing 提升为硬验收。
- Q: Claude Code 第二意见如何处理？A: 2026-06-09 的新一轮 Claude Code 调用因 `MaxBudgetUsd` 触发退出码 1，未生成 `.docs/claude-review-grill-docs-260609.md`；事件流中已有可读综合意见，但只作为次要参考。此前 `.docs/claude-review-architecture-deepening-260609.md` 仍作为较完整的只读复核证据。

外部证据转译为本项目边界：

- OpenAI 的 streaming 和 rate-limit 文档强化了主聊天生命周期 spec 的两个约束：stream finalization 必须显式建模；自动恢复必须保持有限 attempt，不新增无限或后台重试，因为失败请求也会增加限流/成本压力。
- OWASP SSRF 防护资料强化了外部下载/导入 spec 的安全边界：外部 URL 获取应使用正向 allowlist、统一 fetch 入口和可证明的二级下载覆盖；provider helper 不能绕开下载 wrapper。
- Testing Library 的指导原则强化了结构契约测试 spec 的方向：能用用户可感知的 role/name/label 表达的结构，不应退回脆弱源码字符串检查。
- Open WebUI、Msty 和 ChatGPT Projects 显示同类工具正在把 chat、workspace/project、knowledge、tools、RAG、notes 和 terminal/code execution 聚合到一个长期工作环境中。对 EmberDesk 的结论不是把这些能力塞进本轮五个小切片，而是继续坚持 successor/ADR gate：知识栈、工具/MCP、side workspace、project memory、code execution 和 database-first storage 都需要单独设计，不应借架构深化偷渡。

Claude Code 只读复核综合取舍：

- 接受：Spec 01 应强调实现前用函数名/语义锚点复核当前 `Generate()`、`StreamingProcessor` 和 `saveReply()`，避免 `public/script.js` 行号漂移。
- 接受：Spec 03 必须显式证明所有 provider 的二级 fetch 路径也经过统一 wrapper，不能只覆盖 first fetch。
- 接受：Spec 04 应引用现有 fallback readiness helper，避免生命周期协调器和 provider secret UI 各自复制 readiness 语义。
- 接受：Spec 05 应说明新 helper 与现有 `getTagByClass()` 等局部 helper 的关系，并要求迁移前后 contract 覆盖不降低。
- 接受：Spec 02 实现前应盘点 create/edit 当前 `writeCharacterData()` 调用差异，命令模块不能假设两个 route 的写入参数完全一致。
- 拒绝：Claude 报告称 `tests/private-request-filter.test.js` 不存在；本地 `rg --files tests | rg "private-request-filter"` 已确认该文件存在。因此不把它当作缺失测试处理，但保留 SSRF proof 作为 Spec 03 的硬约束。
- 拒绝：把 02 的空过程目录视为待修复缺口。02 已经交付并归档，当前需要维护的是 durable brief/history 与实现事实一致，而不是重建已结束流程的 `spec.md`/`plan.md`。

Risk classification:

- Tiger: 外部导入统一 fetch wrapper 未覆盖 provider 二级下载，会造成 SSRF/allowlist 绕过风险。上线前必须用 focused tests 覆盖每个 provider 的 metadata fetch 和 artifact fetch。
- Tiger: 主聊天生命周期抽取若混入 quiet/background generation，可能造成后台请求自动重放和额外成本。实现必须保持 visible main-chat only。
- Tiger: Provider secret UI 若再次发生 key/selector 漂移，可能泄露或误保存 raw key。Spec 04 必须让 selector 缺失和保存失败成为测试可见失败。
- Tiger: 角色卡写命令若副作用顺序错误，可能留下旧 PNG、旧 index row 或 stale thumbnail。Spec 02 必须测试 side-effect order，而不是只测 response shape。
- Paper Tiger: Projects/Canvas/Artifacts/RAG/tools 趋势会让当前 specs 显得保守；短期可控，因为当前目标是深化既有模块接口，不是产品能力跃迁。它们只有在用户明确要求新增长期上下文、工具或工作区能力时才升级为 ADR-backed successor。
- Elephant: 五个 specs 都是合理后续，但不能并行当作一个大批量 refactor。当前 02 已交付；剩余切片即使进入同一批实现，也必须在 review/validation 中按独立边界关闭，不能用一个宽泛测试结果替代各自的硬验收。

## Change History

- 2026-06-09: 创建架构深化 spec set 的用户意图记录，作为五个规格的上游 brief。
- 2026-06-09: 按 `grill-with-docs` 执行联网调研和 Claude Code 只读复核；将有限重试、SSRF 二级 fetch 覆盖、accessible contract testing、fallback readiness 单一来源、write command side-effect 顺序和 successor/ADR gate 风险写回 brief 与 specs。
- 2026-06-09: 追加无提问 grill 复核结果；记录 02 已随 `f337e5ffe` 归档、当前 Claude Code rerun 因预算上限未生成报告、外部证据只收紧验收不扩大范围。
- 2026-06-09: 交付 01/03/04/05 四个剩余切片：新增 `chat-generation-lifecycle.js`、`external-content-import-service.js`、`provider-secret-field-state.js` 和 `tests/helpers/frontend-structure-contract.js`，并将 durable implementation notes 分别写入 `.docs/tech/main-chat-generation-lifecycle.md`、`.docs/tech/external-content-import-pipeline.md`、`.docs/tech/provider-secret-field-state.md` 和 `.docs/tech/frontend-structure-contracts.md`。

## Delivery Addendum: 2026-06-09

本 brief 最初记录的是“先写规格”的意图；随后用户通过 `delivery-workflow` 批准并交付这些切片。当前 durable 状态如下：

- Spec 01: 主聊天 visible generation lifecycle 已抽到 `public/scripts/chat-generation-lifecycle.js`；`Generate()` 仍是入口，`StreamingProcessor` 仍是 token append owner，quiet/background/nested/dry-run/user-abort 路径保持排除。
- Spec 02: 角色卡写命令已在 `f337e5ffe` 归档；当前 durable source 是 `.docs/tech/briefs/260609-02-character-card-write-command.md`、`.docs/tech/interaction-performance-indexing.md` 和 `.docs/PROJECT_HISTORY.md`。
- Spec 03: 外部内容导入管线已抽到 `src/endpoints/external-content-import-service.js`；content-manager/assets 外部请求通过 service seam，provider 二级下载有真实 downloader trace proof。
- Spec 04: Provider secret field state 已抽到 `public/scripts/provider-secret-field-state.js`；fallback readiness 复用 `hasFallbackProviderSettings()`，fallback secret 使用专用 selector 和保存失败保留输入的规则。
- Spec 05: 前端结构契约 helper 已落到 `tests/helpers/frontend-structure-contract.js`；fallback provider/API key contract 迁移后仍覆盖 selector、order、role/name、aria-live 和 source-marker 断言。

最终验证证据记录在各 spec `plan.md ## Review` 中；wrap-up 后过程 `spec.md`/`plan.md` 删除，持久追溯以本 brief、`.docs/PROJECT_HISTORY.md`、新增技术文档、语义文档和测试文件为准。
