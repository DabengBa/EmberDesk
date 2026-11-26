---
id: feature.reply_pipeline
type: feature
name: Reply Pipeline
related: [feature.tool_bindings, page.chat_workspace]
---

# Feature: Reply Pipeline

## ID 解释

`feature.reply_pipeline` represents the preset-carried multi-step reply orchestration: one user turn is answered by an ordered sequence of user-authored logical steps. It covers step order, per-round instructions, request-only history representation, and the final direct reply. Tool registration itself belongs to [Tool Bindings](feature.tool_bindings).

## Purpose

Make reply structure deterministic instead of model-discretionary. Parallel tool calls cannot see each other, and free recursion lets the model skip, repeat, or reorder steps — so the order is governed by the app, while the model only authors each step's content.

## User-Visible Contract

- In an OpenAI-compatible character chat, the server owns the run and saves the final reply. Default steps continue even when the chat is closed or the page disconnects. A step that uses a custom script waits for that script to run in an attached browser; reopening the same chat resumes a waiting step. Stopping the run discards unfinished output rather than saving it.
- Send, regenerate, and continue use the active pipeline in saved character chats and temporary Assistant chats. Regenerate excludes the old generated reply; continue includes it as context and appends the new output to the same reply. A numbered step requires its matching step result, not ordinary text.
- Completed steps appear together in one temporary card while a run is in flight. In a character chat the card is restored when the chat is reopened, and only the final reply is saved together with completed steps and any final-step option chips. A temporary Assistant chat keeps its final reply in the current view only. Recoverable failures retry only the current round, using the configured fallback model after the primary retry. [Prompt Inspector](feature.prompt_inspector) previews each step and the closing round without running scripts.
- The pipeline is carried by the active preset. Applying a preset without a pipeline clears it; disabling the pipeline prevents later generations from using its tools while keeping bindings for re-enabling. An already-running pipeline finishes before the change takes effect.
- A blank step model inherits the preset model. Recovery can override a step's model; the closing round normally uses the preset model and can also recover. A known incompatible step model is rejected rather than silently replaced. The initial media and history prefix is captured for the first step and reused by later models and recovery attempts even if their media capabilities differ.
- Recovery belongs to the failed round: previously completed steps and their captured results are not replayed. Each step's dedicated prompt tail is expanded once with its initial attempt model and reused unchanged on retries, even when the fallback request uses a different model; consequently `{{model}}` in that snapshot still shows the initial model. Other macros and their side effects are not repeated. The shared prefix and completed steps remain fixed. Final success, exhausted recovery, and cancellation release the run.
- The final step produces the reply. Steps after it are unreachable; an unknown or missing final step uses the last configured step. Step plans stay within a small fixed limit so a closing round remains available.
- Committing a step name automatically creates an enabled text binding if none exists; merely typing a name does not. Explicitly enabling the pipeline activates an existing binding without replacing its custom behavior. Blank or invalid names create nothing. Removing a step or disabling the pipeline keeps user bindings. Steps whose bindings are disabled or hidden are skipped; a pipeline with no runnable steps is inert.
- Settings load, preset application, and initialization supply missing text bindings for enabled pipelines without replacing custom behavior or clearing disabled/hidden flags. Code-provided tools are never replaced by generated placeholders.
- Later rounds keep the conversation captured at the start of the run and append only step-scoped instructions and accepted step results; retries do not duplicate instructions, and other request generations do not inherit stale step instructions or limits. Earlier rounds are not rebuilt from the displayed card. A context overflow fails explicitly instead of silently dropping the captured prefix.
- With an active pipeline, retained memory summaries from [Chat Memory](feature.chat_memory) are combined chronologically into one request-only background-history entry when present; messages not replaced by summaries remain separate in order. The current user input is a separate request-only entry referenced by the step instruction. Inlined media keeps its native representation. Preset prompts, character description, matched World Info and injections remain separate, and World Info activation is unchanged. Edited replies contribute their effective text once, not stale tool arguments or intermediate content.
- Synthetic request-only entries do not change stored chat history or run tools, and are retained or dropped together within the request budget. [Prompt Inspector](feature.prompt_inspector) shows the same representation. Ordinary generation outside the pipeline keeps its existing request shape.
- Each round forces only its current step; missing, invalid, unrelated, or duplicate results fail that attempt before any browser action runs. Default steps pair the result with a short receipt; custom steps use the browser result. Steps can override response length and reasoning effort for their round.
- Preset prompt material can be scoped to a step, appearing when that step runs and remaining in later prefixes; earlier material is not expanded again each round. The closing round adds no new step-scoped material.
- In the prompt panel's 回复管线 section, row order is the plan, the last row is the final step, and rows can be added, removed, reordered, enabled, and edited without losing settings the panel does not expose.
- When the final step completes, its submitted content is the reply, including text that looks like structured markup. Empty or unusable results trigger one closing round that explicitly asks for a direct reply without tools. Its visible card remains readable rather than implying success.
- Completed steps are folded into the final assistant reply as readable, escaped step labels plus the final content and any option chips. Real tool calls and results in mixed runs remain paired for replay; text-only steps do not claim a tool call. Prompt assembly unwraps the final content and drops earlier step blocks and option chips. Outside that request representation the folded reply remains ordinary assistant text.
- On the server path, send, regenerate, or continue starts the run and later steps retain the captured plan.

## Acceptance Workflows

- As a user sending a message in a saved character chat with the pipeline enabled, watch a numbered step wait for a custom script, close the chat, then reopen it; EmberDesk must resume the waiting step in the same chat and save only the final reply, and failure is losing the waiting step or saving unfinished output.
- As a user regenerating a pipeline reply, confirm the old generated reply is excluded and a new final reply replaces it; as a user continuing the same reply, confirm the old reply is kept and the new text is appended without a duplicate user message or composer change.
- As a user whose fallback model takes over a failed step, inspect [Prompt Inspector](feature.prompt_inspector); the step's prompt tail must still show the initial attempt model in its `{{model}}` text while the retry uses the fallback model, and no completed step is run again.
- As a user stopping a run, confirm unfinished output is discarded and no partial reply is saved. As a user whose final step returns unusable content, confirm one closing round asks for a direct reply and the visible error stays readable.
- As a user with a preset that scopes prompt material to a step, confirm that material appears for that step and stays in later request prefixes without being expanded again, and that the closing round adds no new step material.
- As a user with a custom step binding already configured, commit that step name and enable the pipeline; the existing binding keeps its custom behavior and flags, and removing the step later does not delete the binding.

## Failure Signals

- Default steps continue after the chat is closed but are lost when it is reopened, or a waiting custom-script step never resumes.
- Regenerate includes the old generated reply, or continue replaces instead of appending to it.
- A retry expands a step's prompt tail again, shows the fallback model in the initial snapshot, or replays completed steps.
- Stop saves unfinished output or a closing round runs more than once.
- A synthetic request-only entry is written into chat history or executed as a tool.
- A text-only step is presented as a real tool call, or real tool calls and results lose their pairing in a mixed run.
- Applying a preset without a pipeline leaves the old pipeline active, or disabling it stops an already-running pipeline.

## Boundaries

- Tool registration and action behavior belong to [Tool Bindings](feature.tool_bindings).
- Chat workspace placement belongs to [Chat Workspace](page.chat_workspace).
- Bounded generation recovery and final manual retry belong to [Chat Generation Auto Recovery](feature.chat_generation_auto_recovery); see also [Chat Turn Regenerate](feature.chat_regenerate).
