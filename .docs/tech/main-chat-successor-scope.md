# Main Chat Successor Scope

## Module Responsibility

This document owns the implementation-facing scope for the post-roadmap main-chat successor workstream. It records the UX north star, protected compatibility surfaces, validation gates, and the 10-spec execution sequence.

It does not redefine user-facing product semantics. User-visible behavior remains owned by `.docs/db/`, especially:

- `page.chat_workspace`
- `feature.chat_message_rendering`
- `feature.chat_message_actions`
- `term.shared_browser_library`

## Status

Status: active successor scope, created after `.docs/tech/modernization-roadmap.md` was frozen on 2026-06-05.

The frozen roadmap must not receive new implementation slices. Main-chat follow-up work now starts from durable briefs or a separate ADR-backed design when the change affects framework, storage, extension contracts, or other hard-to-reverse architecture. Dated `spec.md` / `plan.md` process files are not durable entrypoints after wrap-up.

## UX North Star

When a user opens the main chat workspace, they should quickly recover context and continue work:

- know the current character or chat context
- see readable message content quickly
- understand whether generation is idle, streaming, stopped, or failed
- recover from stop/error states without losing the conversation
- navigate long chats without losing reading position
- discover common message actions by pointer, keyboard, and touch

This scope treats competitive trends as UX pressure, not as automatic feature commitments. ChatGPT Projects, ChatGPT Canvas, ChatGPT rich in-chat writing/code blocks, Claude Artifacts, Claude Research, Gemini Deep Research, Open WebUI, Msty, and Perplexity Spaces all point toward persistent context, editable work outputs, transparent process, source-aware work, visible tool use, local ownership, and accessible tool/knowledge entry points. EmberDesk should absorb those as small, testable improvements before considering larger ADR-level changes.

Current UX correction advice is recorded in `.docs/tech/main-chat-ux-trend-recommendations.md`. Treat that note as the next design pressure map for main-chat successor proposals: recovery, orientation, touch reachability, action clarity, context/tool scope disclosure, and source/tool usage evidence first; project memory, side workspaces, rich work blocks, knowledge/RAG, source-aware research, tools, MCP, code execution, and automations only through ADR-backed design.

## Archived Successor Sequence

Durable traceability for the delivered 10-slice successor sequence lives in `.docs/tech/briefs/260607-01-main-chat-successor-spec-set.md`. The sequence delivered:

1. scope lock and protected boundary summary
2. baseline validation evidence
3. rendering call-chain map
4. stored-message render descriptor helper
5. message DOM identity hardening
6. long-chat render-window proof
7. streaming browser proof
8. message-actions controller boundary
9. interaction-performance evidence
10. closure gate and durable docs

## Protected Surfaces

Do not change these as incidental cleanup:

- `#chat > .mes`
- `.mes_text`
- `.mes[mesid]`
- `.last_mes`
- `is_user`
- `is_system`
- `.mes_reasoning_details`
- `.mes_reasoning`
- `.mes_media_wrapper`
- `.mes_file_wrapper`
- `.swipe_left`
- `.swipe_right`
- message action role/name/focus affordances
- `eventSource`
- `event_types`
- `@sillytavern/*` browser aliases
- slash-command public exports

Any planned change to these surfaces needs focused compatibility proof and, when user-visible semantics change, an owning `.docs/db` update.

## Validation Matrix

| Change Surface | Minimum Validation |
|---|---|
| Main-chat static DOM or action affordance | `pnpm --dir tests run test:unit -- chat-workspace-structure.test.js third-party-extension-compatibility.test.js --runInBand` |
| Stored message rendering | `pnpm --dir tests run test:e2e -- chat-message-rendering.e2e.js` |
| Message layout and role/name discovery | `pnpm --dir tests run test:e2e -- chat-message-layout.e2e.js` |
| Third-party compatibility surfaces | `pnpm run test:compat` |
| Semantic docs | `pnpm run docs:check` |
| Interaction performance evidence | `pnpm --dir tests run test:unit -- interaction-performance-report.test.js --runInBand` plus the relevant runner scenario |
| Streaming proof | a local deterministic streaming E2E or a documented blocker if no honest local streaming hook exists |

## Successor Gate Classification Matrix

Use this gate before turning a main-chat follow-up idea into implementation work:

| Proposal Class | Route | Examples | Minimum Proof |
|---|---|---|---|
| Small successor brief | Durable brief plus focused delivery plan while active | provider-error retry copy, long-chat load-more proof, mobile reachability proof, message action priority, pure helper extraction | Focused unit or E2E for the touched behavior, plus the validation row for the touched surface. |
| Compatibility-hardening brief | Durable brief plus explicit protected-surface proof while active | selector role/name hardening, extension import compatibility, message-row identity proof, `/lib.js` behavior proof | `pnpm run test:compat` plus focused structure/shared-library tests and semantic docs only when user-visible behavior changes. |
| ADR-required | numbered `.docs/adr/` decision before implementation, or a successor proposal that explicitly leads to ADR | project memory, artifact/canvas side workspace, rich in-chat work block, RAG/knowledge stack, source-aware research mode, tool execution, MCP, code execution, scheduled automations, provider protocol rewrite, framework migration, `/lib.js` replacement, database-first canonical storage | ADR must cover data ownership, migration/recovery, extension compatibility, validation gates, security boundaries, pre-send scope disclosure, post-response usage evidence, and user-visible recovery behavior. |
| Out of scope for main-chat successor | Do not implement in this workstream without a separate roadmap or product decision | SPA migration, TypeScript application migration, multi-user permissions, scheduled automations, canonical storage replacement, broad endpoint splits unrelated to main chat | No implementation. Preserve the frozen roadmap and open a separate design only after explicit approval. |

Trend references are evidence for UX pressure, not approvals. If a proposal changes storage, security, provider protocol, framework boundary, extension compatibility, or user data ownership, route it as ADR-required even when the visible UI looks small.

## UX Evidence Fields

Baseline and closure records should distinguish direct proof from narrative-only evidence for:

- chat open to first readable message
- send to local echo
- first token
- stream stop to usable
- long-chat load-more to stable
- visible message action discovery
- mobile reachability
- keyboard/focus behavior
- loading, empty, error, stopped, and retry states

Unmeasured claims must stay out of release history and user-facing docs.

## Long-Chat Follow-Up Candidates

Spec 06 proves the existing bounded render window, load-more affordance, loaded message identity, and scroll-position stability. It does not deliver new long-chat navigation controls.

Future UX slices should consider:

- message search or jump-to-message for long histories
- a lightweight visible range indicator so users know which part of a long chat they are reading
- context summary support that helps users re-enter very long chats without rendering or rereading the full history

These remain successor candidates until approved by a separate spec or ADR-backed design.

## Trend-Gated Successor Categories

The following trend-inspired categories are not ordinary UI cleanup. They require a separate successor proposal or ADR before implementation:

- project-scoped memory or workspace context
- artifact/canvas side workspaces or rich in-chat work blocks
- deep-research style long-running tasks, plans, reports, or source selection
- knowledge/RAG stacks, chunk visualization, query tuning, retrieval/source transparency, or document sync
- tool execution, OpenAPI/MCP tool binding, code execution, automations, or scheduled prompts
- multi-user channels, permissions, sharing, or access control

For each category, the design must state data ownership, user-visible context scope, pre-send scope disclosure, post-response source/tool evidence, recovery behavior, extension compatibility, validation gates, security boundaries, and whether canonical user data remains file-backed.

## Post-Recovery UX Directions

The 2026-06-08 recovery hardening pass delivered provider-failure retry, touch/action proof, row/control helpers, and the first ADR gate matrix. The separate long-chat jump-to-latest control was removed on 2026-06-09; current long-chat proof stays focused on load-more stability and latest-row reachability. The next user-experience proposals should not restart with visual restyling. They should focus on trust surfaces that prepare EmberDesk for larger workspace capabilities:

1. Context and tool scope disclosure.
   - Show the active chat, files, memory, World Info, web, RAG, MCP, code, and automation scope before send.
   - Keep the surface compact enough for the dense main-chat shell.

2. Source and tool usage audit.
   - Show which sources or tools were used, skipped, or failed after a response.
   - Include retry or repair affordances when the failure is recoverable.

3. Long-chat orientation beyond load-more.
   - Search, jump-to-message, visible range, and summaries remain candidates, but must preserve `chat` order, `.mes[mesid]`, row identity, and extension selectors.

4. Artifact/canvas or rich work-block ADR.
   - Do not implement until versioning, export, sandboxing, mobile behavior, extension impact, and recovery after partial output are designed.
   - Evaluate whether the work should live beside the transcript or inside stable rendered message rows before touching message rendering.

5. Local ownership and backup affordances.
   - Any durable memory, project, automation, or artifact proposal must define export, backup, missing-file recovery, and diagnostic path behavior.

## Closure Checkpoint: 2026-06-08

The 10-spec successor proof set closed the first main-chat successor checkpoint with these delivered facts:

- scope, baseline, and rendering call-chain docs exist outside the frozen roadmap
- stored non-streaming message rows now use a pure render descriptor helper without changing visible output
- message DOM identity, action role/name, focus, touch-target, and protected wrapper proof is stronger
- deterministic browser streaming proof covers successful token append and user stop-to-usable recovery
- long-chat proof covers bounded initial rendering, load-more, older row insertion, anchor position stability, and latest-row reachability
- message action extra-menu expand/collapse behavior is owned by a root-scoped controller with duplicate-init and cleanup proof
- interaction performance evidence covers warm open to first readable message, send to local echo, first token, stop to usable, and long-chat load-more to stable

## Recovery Coordinator Addendum: 2026-06-09

The next architecture-deepening slice extracted visible generation attempt planning into `public/scripts/chat-generation-lifecycle.js`. The successor scope remains active, but this slice did not reopen rendering or provider routing:

- `Generate()` remains the browser compatibility entry point.
- `StreamingProcessor` remains the token append owner.
- automatic recovery stays limited to visible main-chat OpenAI-compatible generation.
- quiet/background/nested/dry-run/user-abort paths stay excluded from lifecycle retries.
- `continue` and `swipe` preserve the existing assistant-row baseline on final failure.
- fallback readiness uses the same `hasFallbackProviderSettings()` helper as the API drawer.

Detailed implementation notes live in [Main Chat Generation Lifecycle](main-chat-generation-lifecycle.md).

UX closure status:

| Area | Status | Evidence or Boundary |
|---|---|---|
| Mobile primary entry | partial | Message action touch-target size and non-overlap are covered by browser proof; a full mobile viewport walkthrough remains a future hardening candidate. |
| Keyboard/focus | passed for touched surfaces | Send-form controls, chat options, message actions, and visible action focus are covered by structure or browser proof. |
| Error recovery copy | partial | Streaming user stop recovers to usable state; provider-error retry copy remains a future UX candidate. |
| Loading/empty/error states | partial | Baseline and stored rendering proof cover current loaded states; no new loading, empty, or provider-error UI was delivered. |
| Long chat | passed for current behavior | Bounded rendering, load-more, row identity, anchor stability, and latest-row reachability are covered by `tests/chat-message-rendering.e2e.js`. |
| Streaming stop/retry | partial | Successful stream and stop-to-usable are covered; provider-error retry UX is not delivered. |
| Message action discoverability | passed | Role/name, focus, hover, menu reveal, and real rendered-row proof are covered. |
| Extension compatibility | passed | `test:compat` and third-party compatibility docs cover protected surfaces. |
| Performance claims | passed with caveat | Main-chat runner records local evidence only; numbers are not release-wide product promises. |

## Out Of Scope Without Separate Design

These are not part of the 10-spec sequence unless a later ADR or successor proposal approves them:

- SPA or TypeScript application migration
- Canvas or artifact-style side workspace
- async tasks or scheduled agents
- database-first canonical storage
- broad `/lib.js` replacement
- broad endpoint splits unrelated to main-chat proof
- real-provider streaming integration tests that require external keys

## External Trend References

- ChatGPT Projects: https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt
- ChatGPT Canvas: https://openai.com/index/introducing-canvas/
- ChatGPT Release Notes: https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- Claude Artifacts: https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- Claude Projects: https://support.anthropic.com/en/articles/9517075-what-are-projects
- Claude Research: https://support.anthropic.com/en/articles/11088861-using-research-on-claude-ai
- Gemini Deep Research: https://support.google.com/gemini/answer/15719111
- Open WebUI features: https://docs.openwebui.com/features
- Open WebUI tools: https://docs.openwebui.com/features/extensibility/plugin/tools/
- Open WebUI Agentic Search: https://docs.openwebui.com/features/chat-conversations/web-search/agentic-search/
- Msty Studio: https://docs.msty.ai/studio/
- Msty Claw: https://docs.msty.ai/claw/overview

## Related Local References

- `.docs/tech/modernization-roadmap.md`
- `.docs/tech/main-chat-ux-trend-recommendations.md`
- `.docs/tech/briefs/260607-01-main-chat-successor-spec-set.md`
- `.docs/tech/briefs/260606-01-chat-message-affordance-proof.md`
- `.docs/tech/briefs/260606-02-chat-message-rendering-proof.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
