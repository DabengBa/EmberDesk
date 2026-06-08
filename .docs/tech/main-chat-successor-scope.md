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

The frozen roadmap must not receive new implementation slices. Main-chat follow-up work now proceeds through `.docs/specs/260607-*` specs or a separate ADR-backed design when the change affects framework, storage, extension contracts, or other hard-to-reverse architecture.

## UX North Star

When a user opens the main chat workspace, they should quickly recover context and continue work:

- know the current character or chat context
- see readable message content quickly
- understand whether generation is idle, streaming, stopped, or failed
- recover from stop/error states without losing the conversation
- navigate long chats without losing reading position
- discover common message actions by pointer, keyboard, and touch

This scope treats competitive trends as UX pressure, not as automatic feature commitments. ChatGPT Projects, ChatGPT Canvas, Claude Artifacts, Gemini Deep Research, Open WebUI, and Msty all point toward persistent context, adjacent workspaces, transparent process, and accessible tool/knowledge entry points. EmberDesk should absorb those as small, testable improvements before considering larger ADR-level changes.

## Current Successor Sequence

1. `.docs/specs/260607-01-main-chat-successor-scope-lock/spec.md`
   - Create this durable scope, validation matrix, and protected boundary summary.
2. `.docs/specs/260607-02-main-chat-baseline-validation/spec.md`
   - Record current structure, browser, rendering, layout, and compatibility baseline.
3. `.docs/specs/260607-03-main-chat-rendering-call-chain-map/spec.md`
   - Map user journeys and code call chains before extraction work.
4. `.docs/specs/260607-04-stored-message-render-descriptor-helper/spec.md`
   - Extract a pure stored-message descriptor helper without changing rendered output.
5. `.docs/specs/260607-05-message-dom-identity-contract-hardening/spec.md`
   - Strengthen DOM, accessibility, focus, and touch proof around message rows.
6. `.docs/specs/260607-06-long-chat-render-window-proof/spec.md`
   - Prove long-chat bounded rendering, load-more, and position stability.
7. `.docs/specs/260607-07-streaming-browser-proof/spec.md`
   - Prove streaming token append, stop recovery, and final row identity before refactoring.
8. `.docs/specs/260607-08-message-actions-controller-boundary/spec.md`
   - Extract a low-risk action controller boundary while preserving action behavior.
9. `.docs/specs/260607-09-main-chat-interaction-performance-evidence/spec.md`
   - Add user-perceived interaction timing evidence for main-chat flows.
10. `.docs/specs/260607-10-main-chat-successor-closure-gate/spec.md`
   - Close delivered work with durable docs, UX checklist, validation, and process cleanup.

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
| Main-chat static DOM or action affordance | `bun run --cwd tests test:unit -- chat-workspace-structure.test.js third-party-extension-compatibility.test.js --runInBand` |
| Stored message rendering | `bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js` |
| Message layout and role/name discovery | `bun run --cwd tests test:e2e -- chat-message-layout.e2e.js` |
| Third-party compatibility surfaces | `bun run test:compat` |
| Semantic docs | `bun run docs:check` |
| Interaction performance evidence | `bun run --cwd tests test:unit -- interaction-performance-report.test.js --runInBand` plus the relevant runner scenario |
| Streaming proof | a local deterministic streaming E2E or a documented blocker if no honest local streaming hook exists |

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

- jump-to-latest or equivalent recovery entry after the user loads older history
- message search or jump-to-message for long histories
- a lightweight visible range indicator so users know which part of a long chat they are reading
- context summary support that helps users re-enter very long chats without rendering or rereading the full history

These remain successor candidates until approved by a separate spec or ADR-backed design.

## Closure Checkpoint: 2026-06-08

The 10-spec successor proof set closed the first main-chat successor checkpoint with these delivered facts:

- scope, baseline, and rendering call-chain docs exist outside the frozen roadmap
- stored non-streaming message rows now use a pure render descriptor helper without changing visible output
- message DOM identity, action role/name, focus, touch-target, and protected wrapper proof is stronger
- deterministic browser streaming proof covers successful token append and user stop-to-usable recovery
- long-chat proof covers bounded initial rendering, load-more, older row insertion, anchor position stability, and latest-row reachability
- message action extra-menu expand/collapse behavior is owned by a root-scoped controller with duplicate-init and cleanup proof
- interaction performance evidence covers warm open to first readable message, send to local echo, first token, stop to usable, and long-chat load-more to stable

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
- ChatGPT Canvas: https://help.openai.com/en/articles/9930697-what-is-the-canvas-featue-in-chatgpt
- Claude Artifacts: https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- Gemini Deep Research: https://gemini.google/overview/deep-research/
- Open WebUI features: https://docs.openwebui.com/features
- Open WebUI tools: https://docs.openwebui.com/features/extensibility/plugin/tools/
- Msty Knowledge Stacks: https://docs.msty.ai/studio/knowledge-stacks/overview

## Related Local References

- `.docs/tech/modernization-roadmap.md`
- `.docs/tech/briefs/260607-01-main-chat-successor-spec-set.md`
- `.docs/tech/briefs/260606-01-chat-message-affordance-proof.md`
- `.docs/tech/briefs/260606-02-chat-message-rendering-proof.md`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
