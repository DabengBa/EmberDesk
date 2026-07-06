---
created: 2026-07-07
source: user-request
confirmed: true
last_updated: 2026-07-07
---

# Legacy Cutover And Deletion Gates

## User Original Request

用户要求继续按 Workspace React replacement roadmap 推进“真实替换”，并在前序 `260706-01` 至 `260706-04` 已把 shell control、legacy-hosted panel entry、authoring surface、supporting panel content owner 逐步切入后，收口每条 legacy owner、fallback path、public export 和 compatibility surface 的最终处理结果。

## Background & Motivation

当前 EmberDesk 的 same-entry React workspace shell 已经覆盖 panel registry、character/group authoring、World Info、Backgrounds、Extensions 和部分 main-chat owner state，但仓库仍保留多类 legacy 资产：

- 纯过渡期遗留的旧 owner / fallback path
- 仍承担公共 contract 的 global / event / import facade
- protected extension mount points
- rollback 仍依赖的 compatibility host

如果继续把这些对象统称为“以后再删的 legacy”，项目会同时承受双路径测试矩阵、文档漂移、owner 责任不清和 review 误判。这个规格的目标不是为了追求删除数量，而是把每一条路径的真实地位说清，并给出可审计的 cutover/deletion gate。

## Intent Domains

### Domain 1: every legacy path gets an explicit durable verdict

- **User expectation:** 真实替换不能停留在“新实现已经加上了”；每个 legacy path 都要有去向。
- **Current status:** planned by spec set `260706-05`.
- **Clarified delivery target:** 建立一份 durable cutover ledger，覆盖 shell/drawer、Character/Group authoring、World Info、Backgrounds、Extensions、main-chat visible owner、public globals、browser import aliases、protected mount points，并把每项标为 `delete`、`freeze-supported`、`compatibility-facade` 或 `blocked`。
- **Change history:**
  - 2026-07-07: 按用户要求先做 `$grill-with-docs` 联网质询，再与仓库 docs/tests/代码现状交叉验证；结论从“立即大删”收窄为“先建立可审计 ledger，再按证据裁决”。

### Domain 2: public compatibility surfaces are not treated as hidden duplicate implementations

- **User expectation:** 该删的删，不该删的不要继续挂着“临时 fallback”名义。
- **Current status:** planned by spec set `260706-05`.
- **Clarified delivery target:** `globalThis.SillyTavern`、`eventSource`、`event_types`、`@sillytavern/*`、protected extension mount points 默认按 frozen public compatibility surface / facade 处理，而不是默认 deletion candidates；若未来要删，必须有单独迁移窗口、consumer 迁移证据和 ADR 级别变更说明。
- **Repository evidence:** `.docs/tech/third-party-extension-compatibility.md`、`.docs/tech/react-modernization-roadmap.md`、`tests/third-party-extension-compatibility.test.js` 已将这些面作为受保护 contract 记录。

### Domain 3: deletion is the final step after proof, not the proof itself

- **User expectation:** 删除要以证据为前提，而不是把“代码能删”误当成“替换完成”。
- **Current status:** planned by spec set `260706-05`.
- **Clarified delivery target:** 对 `delete` 项必须同时具备 owner coverage、compat proof、doc updates、rollback boundary judgment；对 `blocked` 项必须写明阻塞原因；对 `freeze-supported` / `compatibility-facade` 项必须写清 owner、允许变更边界和重新评估条件。
- **External evidence summary:** strangler-fig / transitional-architecture 资料支持渐进替换与最终 decommission，但强调 coexistence 期间要有清晰 facade/adapter 责任；feature-toggle 资料强调长生命周期 fallback/flag 有 carrying cost，必须主动清点和移除或明确长期政策。

### Domain 4: maintainer-facing evidence stays structured, user-facing UI stays quiet

- **User expectation:** 文档和状态表达要精简、统一，不靠大段说明文字。
- **Current status:** planned by spec set `260706-05`.
- **Clarified delivery target:** 维护者视角需要一个可扫读的 structured ledger，但终端用户视角不应新增 cutover 裁决文案、兼容面徽标或管理后台。active/pressed 与局部 error/needs-attention 等任务状态继续是用户唯一需要感知的状态来源。
- **Second-review synthesis:** Claude Code 只读设计评审认为这轮不该扩展成新 UI；如果需要 ledger，优先 `.docs/tech` 结构化文档，按 surface domain 分组，组内优先展示 `blocked` 和 `compatibility-facade` 项。

## Confirmed Design Defaults

- 本规格优先交付 ledger、gate、durable docs 和必要的小范围代码/测试清理，而不是追求一次性删除大量路径。
- 同一入口下不允许继续把 React owner 和 legacy owner 都当“正常主路径”维护。
- 用户可见 shell entry 的 active/toggle 语义必须与实际 owner 状态一致；不能靠多段说明文字解释为什么同一按钮现在其实代表不同旧路径。
- public compatibility surfaces 的默认语言是“冻结支持”或“兼容 facade”，不是“迟早删除但现在先放着”。
- `delete` / `freeze-supported` / `compatibility-facade` / `blocked` 这些治理词汇只属于维护者文档，不属于终端用户 UI。
- `pinnedOpen` / locked 事实继续留在 compatibility snapshot / diagnostics；本规格不因为审计需求把它重新做成可见状态。
- 若产出 maintainer-facing ledger，默认使用低噪声文档信息架构：按 domain 分组，组内先显示未解决项，完成项弱化，不新增 dashboard。

## Source Evidence

- `.docs/tech/briefs/260706-01-workspace-react-replacement-roadmap.md`
- `.docs/db/features/next-workspace-shell.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/world-info-panel.md`
- `.docs/db/features/background-library-panel.md`
- `.docs/db/features/extension-panel-open.md`
- `.docs/db/terms/shared-browser-library.md`
- `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`
- `.docs/tech/react-modernization-roadmap.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `src/workspace-react-features.js`
- `public/scripts/workspace-panel-host-controller.js`
- `public/scripts/workspace-panels-react-bridge.js`
- `tests/third-party-extension-compatibility.test.js`
- `tests/global-compatibility-bridge.test.js`
- `https://martinfowler.com/bliki/StranglerFigApplication.html`
- `https://martinfowler.com/articles/patterns-legacy-displacement/`
- `https://martinfowler.com/articles/feature-toggles.html`
- `https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig`
- `https://www.w3.org/WAI/ARIA/apg/patterns/button/`

## Non-Goals

- 不把所有 legacy 名称对象一律删除。
- 不删除仍承担 public contract 的 globals、event surfaces、browser import aliases 或 protected extension mount points。
- 不在没有迁移计划和 consumer 证据时重写第三方扩展生态边界。
- 不新增 separate-route workspace shell 或重新打开已关闭的全 SPA 方向。
- 不把内部 cutover 裁决状态做成终端用户可见提示、徽标或新的维护后台页面。

## Implementation Traceability

| Intent domain | Owning paths | Delivery status | Commit |
|---|---|---|---|
| Explicit durable verdict for every in-scope legacy path | `.docs/tech/legacy-cutover-ledger.md`; `.docs/tech/react-modernization-roadmap.md`; `.docs/PROJECT_HISTORY.md` | Delivered on 2026-07-07. Ledger covers shell/navigation, authoring, World Info, Backgrounds, Extensions, main-chat, and global compatibility exports with verdict, owner, rollback, evidence gate, doc owner, and blocking reason where needed. | Wrap-up commit `docs(spec): retire legacy cutover gates with full honors` |
| Public compatibility surfaces are not hidden duplicate implementations | `.docs/adr/0007-react-page-islands-with-legacy-fallbacks.md`; `.docs/tech/legacy-cutover-ledger.md`; `.docs/project-overview.md`; `.docs/db/terms/shared-browser-library.md`; `.docs/db/features/extension-panel-open.md` | Delivered on 2026-07-07. Public globals, event contracts, browser aliases, and protected extension mount points are documented as freeze-supported or compatibility-facade surfaces instead of vague deletion candidates. | Wrap-up commit `docs(spec): retire legacy cutover gates with full honors` |
| Deletion follows proof gates, not assumptions | `.docs/tech/legacy-cutover-ledger.md`; `tests/helpers/workspace-react-playwright-flags.js`; `tests/playwright.config.js`; `tests/workspace-react-panel-flags.test.js` | Delivered on 2026-07-07. Playwright proof flags now cover full-suite and targeted runs, build the needed React bundles, and avoid stale server reuse when React workspace flags are enabled. | Wrap-up commit `docs(spec): retire legacy cutover gates with full honors` |
| Maintainer evidence stays structured and user-facing UI stays quiet | `.docs/tech/legacy-cutover-ledger.md`; `.docs/db/pages/chat-workspace.md`; `.docs/db/features/next-workspace-shell.md`; `.docs/db/features/world-info-panel.md`; `.docs/db/features/background-library-panel.md`; `.docs/db/features/extension-panel-open.md` | Delivered on 2026-07-07. Governance verdicts stay in maintainer docs; user-facing semantics remain active/pressed, ready/loading/error, and local validation feedback. UX walkthrough screenshots in `/tmp/ux-walkthrough-260706-05` found no runtime UI defect requiring code changes. | Wrap-up commit `docs(spec): retire legacy cutover gates with full honors` |
