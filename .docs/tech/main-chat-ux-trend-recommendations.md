# Main Chat UX Trend Recommendations

## Module Responsibility

This note records UX correction advice for the post-roadmap main-chat successor workstream. It turns current competitor trends into EmberDesk-specific design pressure, prioritization, and guardrails.

It does not describe shipped product behavior. User-visible semantics remain owned by `.docs/db/`, especially `page.chat_workspace`, `feature.chat_message_rendering`, and `feature.chat_message_actions`.

## Product Fit

EmberDesk should not copy the clean consumer-chat pattern. `PRODUCT.md` and `DESIGN.md` define a dense, private, warm, power-user workspace. Competitive trends are useful only when they improve daily recovery, control, and continuity without breaking self-hosted ownership or extension compatibility.

The practical UX target is:

- users can recover from failures without refreshing or losing context
- users can re-enter long chats without becoming lost
- users can operate message actions by pointer, keyboard, and touch
- users can see generation state clearly enough to trust stop, retry, and continue paths
- future project, artifact, research, knowledge, and tool surfaces enter through ADR-backed designs instead of incidental main-chat patches

## Competitive Trend Reading

The relevant 2026 trend is not "add a bigger chat UI." It is persistent work context with visible recovery paths, explainable context use, local data ownership, and permission-aware tool surfaces:

- ChatGPT Projects groups chats, files, app links, instructions, tools, and memory boundaries around ongoing work; project-only memory makes context scope part of the product model.
- ChatGPT Canvas and Claude Artifacts place generated work in an adjacent workspace, with editing, version, export, and share or publish affordances outside the transcript. OpenAI's 2026 ChatGPT release notes also show a counter-trend: some writing and coding work is moving back into richer in-chat blocks for current models, so EmberDesk should not assume the only future is a permanent side workspace.
- Claude Research and Gemini Deep Research expose long-running research as a multi-step process with source use, citations, reports, and user-visible waiting states.
- Open WebUI positions chat as an extensible workbench: files, web search, code execution, queueing, knowledge/RAG, notes, tools, models, agents, channels, RBAC, and permissions live near conversation.
- Msty Studio and Msty Claw reinforce local-first data ownership, backup/export, diagnostics, working briefs, memory banks, task automation, and explicit runtime/permission controls.
- Perplexity Spaces reinforces the same pattern from the research side: custom instructions, preferred models, documents, and sources are grouped around an ongoing workspace.

### 2026-06-08 Web-Checked Signals

These observations should shape successor proposals, but they are not implementation commitments:

| Signal | UX Meaning For EmberDesk | Correction |
|---|---|---|
| Project containers now combine chats, files, instructions, and memory boundaries. | Users expect continuity, but self-hosted users also expect explicit data ownership. | Future project/context work must show exactly which files, chats, and memories are in scope before a prompt is sent. |
| Artifact/canvas surfaces make generated work editable outside the transcript. | The transcript alone is no longer enough for long-form or structured work. | Do not bolt a side workspace onto main chat casually; require an ADR for artifact ownership, versioning, export, security, and extension impact. |
| Writing/code output can also return to rich in-chat blocks instead of a separate canvas. | Side workspaces are not the only current pattern; direct chat blocks may preserve flow better for dense workbenches. | Rich in-chat work blocks still need version, export, recovery, rendering, and extension-compatibility gates. |
| Claude-style repair CTAs and artifact error flows make failure actionable. | Users forgive failures faster when the next safe action is obvious. | Provider and render failures should expose a clear retry/continue/fix action that does not duplicate rows or lose user input. |
| Deep Research style flows reveal plan, waiting state, report, and sources. | Long-running work needs process visibility, not just a spinner. | Any future background generation or research mode must expose stage, cancellation, recovery, and source/report boundaries. |
| Open WebUI and Msty make tools/RAG powerful but explicit through knowledge, tool, query, and permission controls. | Power users want control over retrieval and tools; general users need sane defaults. | Knowledge/tool features must be visible, inspectable, and permission-scoped. Hidden retrieval is a trust regression. |
| Perplexity Spaces and similar research workspaces keep sources close to the task. | Source transparency has become part of UX, not a secondary citation feature. | Retrieval or web-search features should show source scope and failure states near the conversation, not only in final text. |
| Native agentic tool modes now use feature toggles, tool permissions, and post-response usage evidence. | Tool use is a user-trust event, not invisible plumbing. | Future tool, MCP, code execution, web, and RAG features must show what is enabled before send and what was actually used after response. |
| Local-first competitors expose backup, diagnostics, data paths, and permission baselines. | Self-hosted users expect recovery and auditability before they trust durable context. | Any future project, memory, artifact, or automation surface must include export/backup, missing-file recovery, and local-data ownership wording. |

## Recommended Corrections

### 1. Make Recovery A First-Class Main-Chat Surface

Correction: prioritize provider-error/retry UX before visual redesign.

Reason: current closure proof covers user stop-to-usable, but not provider failure recovery. Competitors increasingly expose explicit recovery actions: Claude Artifacts has a direct error-fix CTA, and Gemini Deep Research treats long-running work as resumable after waiting.

Successor impact:

- Provider-error recovery work should require a visible recovery CTA or an explicitly reused Send/Continue recovery entry.
- Error copy must be short and operational: what failed, what remains safe, what the next action does.
- The proof must verify no duplicate empty assistant row and no lost user message.
- User stop and provider failure must remain visually distinct. Stopping is user intent; provider failure is a recoverable error.

### 2. Keep Long-Chat Navigation Narrow Before Search Or Summary

Correction: keep the shipped long-chat surface at bounded rendering plus load-more stability; defer search, jump-to-message, range indicator, and summary until separate specs.

Reason: ChatGPT Projects, Perplexity Spaces, and Open WebUI emphasize organizing persistent context, while EmberDesk already has bounded long-chat rendering. The first gap is user orientation after loading older messages, not a full information-retrieval surface.

Successor impact:

- Long-chat follow-up work must not change `chat` order, `mesid`, `power_user.chat_truncation`, or `#show_more_messages` behavior.
- The separate jump-to-latest control was removed on 2026-06-09; reintroducing a return-to-newest control requires a fresh spec and proof.
- Future search/range/summary work should require its own UX proof and extension compatibility check.
- If a future range indicator is added, it should describe the visible slice of history without implying hidden summarization or retrieval.

### 3. Treat Mobile As A Reachability Gate, Not A Redesign Brief

Correction: harden mobile walkthrough proof for composer, actions, load-more, and stop/recovery before changing layout strategy.

Reason: artifact and side-workspace products often degrade on mobile when the secondary workspace is too heavy. EmberDesk should avoid that by proving core chat work remains reachable on narrow viewports before introducing new adjacent surfaces.

Successor impact:

- Mobile walkthrough hardening should test at least one narrow phone viewport and one wider mobile/tablet viewport.
- New controls should expand hit area before adding visible text.
- No state should require hover-only discovery.

### 4. Make Message Actions Task-Tiered

Correction: organize actions by use frequency and risk, not by inherited DOM order alone.

Reason: artifact/workspace competitors make direct manipulation central, but EmberDesk cannot sacrifice dense reading. Copy/Edit/Message Actions should remain fast; destructive actions should not visually compete. Touch and keyboard access matter because modern AI workspaces now expect the same surface to survive desktop, tablet, and mobile use.

Successor impact:

- Message action priority work should keep `Copy`, `Edit`, and `Message Actions` as first-tier actions.
- Checkpoint, swipe, reasoning, and media/gallery are secondary.
- Delete/remove actions are danger tier and require clear accessible names.
- Secondary actions should remain discoverable through a consistent overflow/action menu instead of permanently expanding the row height.

### 5. Continue Refactors Only Where They Preserve User Trust

Correction: next helper/controller work should reduce main-chat complexity without changing message body HTML, streaming token append, provider protocol, or extension surfaces.

Reason: Open WebUI/Msty trends point toward extensibility, but EmberDesk already has high extension compatibility risk. A refactor that breaks selectors or event timing is a UX regression even if the code is cleaner.

Successor impact:

- Non-streaming row helper work should begin with row identity and metadata, not message body formatting.
- Streaming state-controller work should extract control-state decisions only, not token append or provider retry.

### 6. Require Evidence Before Performance Claims

Correction: performance work should be allowed to close as evidence-only if no stable bottleneck appears.

Reason: current AI workspace tools compete on perceived continuity and speed. False performance claims undermine trust more than a no-op evidence closure.

Successor impact:

- Performance optimization candidates should declare primary and guardrail metrics before code changes.
- A first-token optimization cannot regress local echo or stop-to-usable.
- Runner warnings must block "performance improved" wording.

### 7. Gate Big Trend Features With ADRs

Correction: classify project memory, artifact/canvas side workspace, deep research, knowledge/RAG, source-aware research spaces, tool execution, automations, and multi-user channels as ADR-required or successor-proposal work.

Reason: these features affect storage, permissions, provider protocol, extension contracts, security, and user data boundaries. They are not ordinary main-chat UI slices.

Successor impact:

- Successor ADR-gate work should explicitly map these trend categories to ADR-backed design gates.
- ADR gate must include data ownership, migration/recovery, extension compatibility, validation, and security boundaries.
- The ADR must name the user-visible recovery model: how work is resumed after reload, provider error, tool error, partial export, missing source, or deleted local file.

### 8. Require Context And Tool Scope Disclosure Before Larger Workspaces

Correction: any proposal that lets the model use files, memory, project context, web results, tools, code execution, MCP, notes, channels, or automations must define both pre-send scope and post-response evidence.

Reason: the strongest competitive pattern is not just more capability. It is visible context control. ChatGPT Projects, Claude Projects, Open WebUI, Msty, and Perplexity Spaces all make the active work container or source set part of the workflow. EmberDesk's self-hosted advantage becomes weaker if retrieval, memory, or tool use happens without an inspectable local boundary.

Successor impact:

- Future project/context specs must show which chats, files, memories, world info, sources, and tools are in scope before a prompt is sent.
- Future tool/RAG/research specs must show which tools or sources were actually used after a response, including failures and skipped sources.
- Code execution, MCP tools, automations, and scheduled prompts must stay ADR-required because they affect filesystem, network, security, and recovery boundaries.
- The UI should prefer compact chips, an expandable scope drawer, or an audit strip over large explanatory panels that reduce chat density.
- Hidden retrieval or hidden tool injection should block approval unless an explicit privacy/security rationale is documented.

## UX Correction Backlog

These are the recommended design corrections ranked by user value and implementation risk:

| Priority | Correction | Why It Improves UX | Guardrail |
|---|---|---|---|
| P0 | Separate stop, provider error, and retry states in the composer and last assistant row. | Users can trust what happened and pick the next safe action without refreshing. | No duplicate assistant row; no lost user message; no provider protocol change. |
| P0 | Preserve long-chat load-more stability after loading older history. | Users can inspect older context without losing row identity or scroll position. | Preserve message identity, truncation, and extension selectors. |
| P1 | Make message actions tiered and touch-safe. | Frequent operations stay fast; destructive actions stop competing with reading. | Preserve legacy classes, `chid`/`mesid`, role/name, keyboard focus, and hover behavior. |
| P1 | Add mobile walkthrough proof for chat, composer, load-more, stop, retry, and actions. | Desktop success no longer hides broken reachability on narrow screens. | Prefer hit-area and overflow fixes over visible text that expands rows. |
| P1 | Define context-scope disclosure for future projects, knowledge, or files. | Users know which local data is being used before generation. | Separate ADR; file-backed ownership and privacy boundaries must be explicit. |
| P1 | Add post-response source/tool evidence for any RAG, web, MCP, code, or research feature. | Users can verify why the model answered a certain way and recover from missing or failed sources. | Separate ADR; do not hide failed tools or silently search private data. |
| P2 | Introduce source/retrieval transparency only after a knowledge/RAG ADR. | Power users can debug retrieval and general users can trust sources. | No hidden retrieval in main chat; no canonical data moved into derived caches. |
| P2 | Explore artifact/canvas workspace only after recovery and navigation are solid. | Long-form work can move out of the transcript without sacrificing chat density. | ADR must cover versioning, export, sandboxing, extension impact, and mobile behavior. |

## Prioritized UX Queue

1. Provider error / retry UX.
   - Highest user trust impact.
   - Smallest surface if implemented with deterministic local E2E.

2. Long-chat load-more stability.
   - Directly protects orientation after load-more.
   - Low risk when it preserves identity, anchor position, and latest-row reachability.

3. Mobile walkthrough hardening.
   - Prevents desktop-only success from hiding touch and viewport failures.

4. Message action tiering.
   - Improves daily operations without changing message body rendering.

5. Streaming control-state boundary.
   - Enables future stop/retry clarity while avoiding provider protocol churn.

6. Non-streaming row population helper.
   - Engineering cleanup, only valuable if visible equivalence proof stays strong.

7. Performance candidate.
   - Run when runner evidence shows a stable bottleneck.

8. ADR gate and compatibility matrix.
   - Should be completed before any proposal for projects, artifacts, knowledge/RAG, tools, automations, or side workspaces.

### Post-Delivery Queue

Status on 2026-06-08: the first eight recommendations above have now been delivered or closed as evidence-only where appropriate. Do not reopen them as generic UX cleanup unless a regression appears.

The next UX proposal set should start from these directions:

1. Context/tool scope disclosure.
   - Design the compact pre-send surface that shows active chat, files, memory, world info, web, RAG, MCP, code, and automation scope.
   - This can be specified before implementing any new retrieval or tool capability.

2. Source and tool usage audit.
   - Define the post-response evidence strip for sources used, tools called, skipped sources, failed tools, and retry options.
   - This should be ADR-linked when it touches RAG, web, MCP, or code execution.

3. Long-chat orientation beyond load-more.
   - Search, jump-to-message, visible range, and optional summary remain useful, but they need their own proof and must preserve message identity.

4. Artifact/canvas or rich work-block ADR.
   - Only start after recovery, navigation, context scope, export, versioning, sandboxing, and mobile behavior are specified.
   - Evaluate both patterns: adjacent workspace for large editable artifacts, and in-chat rich blocks for work that should stay close to the transcript.

5. Local ownership and backup affordances.
   - Any durable memory, project, automation, or artifact feature should include export, backup, missing-file recovery, and diagnostic path behavior from the first design.

## Risks That Change Execution

### Tigers

- Error recovery without a clear CTA will feel unfinished. Block spec 01 approval unless the recovery action and proof are explicit.
- Long-chat navigation that mutates message identity can break third-party extensions. Block implementation if `mesid`, `chat`, or `power_user.chat_truncation` semantics change.
- Side workspace or RAG features without an ADR can silently change storage and privacy expectations. Block them at the successor gate.

### Paper Tigers

- "No Canvas/Artifacts yet" may look behind competitors. This is acceptable while EmberDesk is still protecting jQuery shell, file-backed storage, and extension compatibility.
- "No full mobile redesign" may look conservative. The higher-value first move is mobile reachability proof for existing core flows.

### Elephants

- The phrase "improve UX" can hide a conflict between power-user density and consumer-AI simplicity. EmberDesk should keep density and fix recovery/clarity first.
- Trend features such as knowledge stacks and agents are attractive, but they imply product ownership beyond main chat. They need separate owners, security review, and migration plans.

## Reference Links

- ChatGPT Projects: https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt
- OpenAI Projects Academy: https://openai.com/academy/projects/
- ChatGPT Canvas Help: https://help.openai.com/en/articles/9930697-what-is-the-canvas-featue-in-chatgpt-and-how-do-i-use-it
- ChatGPT Release Notes: https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- Claude Artifacts: https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- Claude Projects: https://support.anthropic.com/en/articles/9517075-what-are-projects
- Claude Research: https://support.anthropic.com/en/articles/11088861-using-research-on-claude-ai
- Gemini Deep Research: https://support.google.com/gemini/answer/15719111
- Open WebUI Features: https://docs.openwebui.com/features/
- Open WebUI Tools: https://docs.openwebui.com/features/extensibility/plugin/tools/
- Open WebUI Agentic Search: https://docs.openwebui.com/features/chat-conversations/web-search/agentic-search/
- Msty Studio: https://docs.msty.ai/studio/
- Msty Claw: https://docs.msty.ai/claw/overview
- Msty Studio Responses: https://docs.msty.ai/studio/conversations/responses
- Perplexity Spaces: https://www.perplexity.ai/help-center/en/articles/10352961-what-are-spaces/
