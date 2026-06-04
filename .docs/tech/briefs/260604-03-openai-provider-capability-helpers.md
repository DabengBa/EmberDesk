---
created: 2026-06-04
source: "User invoked $brainstorming after the modernization roadmap was updated to recommend OpenAI/provider capability helper extraction as the next work."
confirmed: true
last_updated: 2026-06-04
---

# Brief: 260604-03 OpenAI Provider Capability Helpers

## User Original Request

- "$brainstorming"
- Confirmation answer: use the roadmap default target, "OpenAI/provider capability helper extraction".

Working interpretation before design: the requested brainstorming target is the next roadmap-recommended modernization slice after World Info batch import was delivered, namely extracting pure OpenAI/provider capability helpers from `public/scripts/openai.js` without changing provider UI, secrets, proxy behavior, or request payload semantics.

## Background & Motivation

The modernization roadmap now names OpenAI/provider capability helper extraction as the next recommended slice. The relevant code is concentrated in `public/scripts/openai.js`, which currently owns provider selection, model resolution, reasoning/verbosity resolution, media inlining predicates, feature support flags, request parameter assembly, secret/proxy controls, and DOM binding.

The motivation is to improve testability and reduce repeated provider/model decision logic before any broader AI/API settings UI work or backend request-shape change. Current tests such as `tests/openai-segmented-controls.test.js` mostly assert source structure, so the next slice should introduce executable helper-level behavior proof while keeping existing user-visible behavior stable.

## Intent Domains

| Intent Domain | User Expectation | Current Status | Change History | Implementation Traceability |
|---|---|---|---|---|
| Next modernization slice | Continue from the roadmap into the next concrete implementation design | Delivered | 2026-06-04: user confirmed the roadmap default target after `$brainstorming`; 2026-06-04: delivery completed through review and wrap-up | Delivered design/process: `.docs/specs/260604-03-openai-provider-capability-helpers/` until wrap-up cleanup; durable record: `.docs/PROJECT_HISTORY.md` and `.docs/tech/modernization-roadmap.md` |
| Helper extraction | Move provider/model capability decisions into pure helpers with explicit inputs | Delivered | 2026-06-04: repo scan identified `getChatCompletionModel`, `getReasoningEffort`, `getVerbosity`, and media inlining predicates as the first safe boundary | Delivered code: `public/scripts/openai-provider-capabilities.js`; wrapper rewiring: `public/scripts/openai.js`; status: shipped through focused validation |
| Capability-ready contract | Preserve current behavior while shaping helper output so future model badges do not need another helper-contract rewrite | Delivered | 2026-06-04: UX review compared capability-aware model selectors and recommended structured capability output; accepted as helper contract work, not UI work; 2026-06-04 review hardening split descriptor capabilities from the media inlining toggle | Delivered code: `resolveChatCompletionModel()` returns `{ source, model, capabilities }`; capability fields remain `vision`, `video`, `audio`, and `reasoning` |
| Behavior preservation | Do not change visible AI/API settings layout, provider list, model defaults, secret/proxy routing, or backend request payload semantics | Delivered | 2026-06-04: roadmap and semantic docs mark provider/model selection and request construction as stability-sensitive | Delivered proof: `openai-provider-capabilities.test.js`, `openai-segmented-controls.test.js`, `frontend-shared-library-boundary.test.js`, `bun run test:compat`, and `bun run lint`; no UI, backend route, provider list, or payload semantic change |
| Regression proof | Replace structure-only confidence with behavior-level tests for extracted decisions | Delivered | 2026-06-04: existing `openai-segmented-controls.test.js` protects ordering and fallback normalization but does not execute helper branches | Delivered proof: `tests/openai-provider-capabilities.test.js` covers provider model selection, structured descriptors, reasoning effort, verbosity, and typed media support; final focused run passed 7 tests |
| Doc ownership | Avoid user-facing semantic doc churn unless implementation changes visible API configuration behavior | Delivered | 2026-06-04: `.docs/db/pages/api-configuration.md` and `.docs/db/features/chat-completion-select.md` already own visible provider/model semantics | Delivered docs: no `.docs/db` change required; durable tech/history updates landed in `.docs/PROJECT_HISTORY.md` and `.docs/tech/modernization-roadmap.md` |

## Assumptions

- This slice is a refactor/testability slice, not a provider feature addition.
- Current provider/model capability outcomes must stay equivalent for the covered branches.
- Helper inputs receive a fully resolved settings object for this slice. Future per-conversation overrides should be merged before calling the helper unless a later design explicitly introduces a `{ base, overrides }` helper contract.
- The first implementation should avoid backend route changes unless helper extraction proves a specific shared boundary is needed.
- External provider documentation is not required for pure extraction. It becomes required before changing API syntax, model capability rules, payload fields, or the user-visible reasoning effort options.

## Non-Goals

- Do not redesign the AI/API settings UI.
- Do not add or remove providers.
- Do not change `chat_completion_sources`, model defaults, model list loading, or provider selector semantics.
- Do not change secret storage, custom base URL, reverse proxy, connection profiles, auth, or request retry behavior.
- Do not change outbound request payload semantics, backend provider routes, streaming, message rendering, slash commands, regex behavior, extension imports, or `public/lib.js`.
- Do not add model capability badges, per-type media toggles, token impact hints, provider icons, or a new model selector UI in this slice.
