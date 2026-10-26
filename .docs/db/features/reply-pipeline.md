---
id: feature.reply_pipeline
type: feature
name: Reply Pipeline
related: [feature.tool_bindings, page.chat_workspace]
---

# Feature: Reply Pipeline

## ID 解释

`feature.reply_pipeline` represents the preset-carried multi-step reply orchestration: one user turn is answered by an ordered sequence of controlled tool calls (`analyze → review → respond`, author-defined), each step seeing the previous steps' results. It covers step normalization, per-round step instructions, request shaping, the final-direct reply write, and the closing fallback round. It does not cover tool binding storage or the tool-call transport itself (see [Tool Bindings](feature.tool_bindings)).

## Purpose

Make reply structure deterministic instead of model-discretionary. Parallel tool calls cannot see each other, and free recursion lets the model skip, repeat, or reorder steps — so the order is orchestrated by the app, while the model only authors each step's content.

## Ownership Direction

`public/scripts/reply-pipeline-core.js` owns pure logic (normalization, step resolution, step prompts, final-text extraction); `public/scripts/reply-pipeline.js` owns the run state machine and request shaping (append-only round context, fixed tool definitions, `tool_choice`, per-step `max_tokens`). `generation-service.js` executes decisions: it stamps invocations, saves cards, and performs the final-direct write plus cleanup. The plan itself lives in `oai_settings.reply_pipeline` — it travels with the preset.

## User-Visible Contract

- `reply_pipeline` is preset-carried: `{ enabled, enforce_mode?: 'auto'|'forced', result_field?, final, steps: [{ tool, prompt?, display?, max_tokens?, reasoning_effort?, id? }] }`. It is a `settingsToUpdate` field, so preset apply/save and the canonical settings document persistence all carry it; applying a preset without a `reply_pipeline` key clears the active pipeline.
- `final` names the reply-producing tool; the plan is truncated at that step (steps after it are unreachable), and an unknown or missing `final` resolves to the last step. Plans are clamped to `MAX_PIPELINE_STEPS` (5 = `ToolManager.RECURSE_LIMIT`).
- Committing a valid step tool name on blur or Enter automatically creates an enabled, non-stealth text binding; typing alone creates no bindings. Explicitly enabling the pipeline or committing a name activates an existing binding without replacing its custom schema or action. Blank/invalid names create nothing.
- Settings load, preset apply, and initial runtime initialization repair missing bindings for enabled pipelines. Passive repair preserves existing disabled/stealth flags. Generated bindings require a string `content` argument and return that text directly, without another JSON string layer. Code-registered tools are never replaced by generated placeholders. Removing steps or disabling the pipeline retains user bindings.
- Steps whose existing bindings remain disabled or `stealth` are skipped; a pipeline with no runnable steps is inert.
- Each round appends one system instruction naming the step's tool and its `prompt`. Shaping only applies to `type === 'normal'` request bodies and appends each round's material once, so retries do not duplicate it and quiet/raw/other generations never inherit stale step prompts, forced `tool_choice`, or step token caps.
- Within a run, the initial conversation is captured once. Later rounds append step-scoped material, step instructions, native assistant tool calls, and paired tool results without rebuilding earlier rounds from the live display card. Context overflow fails explicitly rather than silently trimming the captured prefix. This makes requests prefix-stable; actual provider cache reuse is not guaranteed.
- Pipeline requests keep the same ordered tool definitions throughout a run. Only the current step may execute; calls to later, completed, unrelated, or duplicate tools are rejected without running their actions. `enforce_mode: 'forced'` pins `tool_choice` to the current function; `auto` (default) relies on the step instruction. The closing fallback round keeps the definitions but uses `tool_choice: 'none'`. Non-pipeline generations keep their normal tool behavior. `steps[].max_tokens` applies to whichever of `max_tokens`/`max_completion_tokens` the model path produced. `steps[].reasoning_effort` (`auto|low|medium|high|min|max`) overrides `reasoning_effort` for that round through the same provider mapping the preset-level value uses.
- Preset prompts can scope to a step: an `injection_trigger` value of `pipeline:<tool>` appends that material when the step is driven; earlier material remains in subsequent request prefixes. Base `all`/`normal` prompts are captured once, not re-expanded each round. The closing round has no active step, so it appends no new step-scoped material. The prompt panel renders one `管线 <tool>` checkbox per runnable step.
- The prompt panel's bottom 回复管线 section is the step editor: one row per step (`tool` + per-round `prompt`), an enable toggle, and add/delete/up/down controls. Row order IS the plan and the last row always owns `final`; edits write `oai_settings.reply_pipeline` directly (step keys the UI doesn't expose — `display`, `max_tokens`, `reasoning_effort` — survive row edits).
- Steps advance one at a time after the current step executes. Invalid batches and out-of-order or repeated calls terminate the run with a visible error before actions execute. A plain-text response without tool calls follows normal completion and releases the run.
- When the final step completes, its result IS the reply: a plain string result is used directly; JSON object results require `result_field` (dot path), and a JSON scalar string is unwrapped. Errored, empty, or unusable results trigger one closing round with `tool_choice: 'none'` and an explicit "do not call tools" instruction; the failed final card's `hidden` display is lifted to `summary` so the error stays visible.
- The final-direct write keeps the AI_OUTPUT regex pass, skips stopping-string trimming, mirrors the normal generation tail (save, unblock, panel refresh), and preserves the streaming return shape.
- Cards: while a run is in flight, rounds merge into ONE live card message (matched by `extra.reply_pipeline_run`). On `final`, the card is folded INTO the reply — a single assistant message whose `mes` is escaped semantic tag text (`&lt;{tool}&gt;content&lt;/{tool}&gt;` per step — e.g. `&lt;analyze&gt;`/`&lt;review&gt;`/`&lt;respond&gt;`) and whose `extra.tool_invocations` carries all run invocations. Tag delimiters are escaped so tag names display literally (sanitizers would eat unknown elements); the raw tag-wrapped text is directly readable with zero regex. The last tag carries the reply raw — `<plot-options>`-style markup stays live — plus a `data-respond-options` chip row inside it. No JSON, no card chrome. AI_OUTPUT regexes restyle or strip blocks by matching `&lt;tag&gt;` entities (write-time on the whole `mes`, `markdownOnly` at display, `promptOnly` pre-send); prompt assembly drops earlier step blocks, unwraps the last tag to plain reply text, drops the chip row, and flattens pipeline-only cards into that single plain message — the same wire shape tools-off mode produces, so step invocations never travel as `tool_calls`/`role:tool` scaffolding in later turns. Cards that mix pipeline calls with ordinary tool calls keep the structured replay so real tool results stay paired. The closing-round (fallback) reply is a separate normal message; the failed run's card stays visible as evidence.
- A pipeline run starts only on a fresh turn (`GENERATION_STARTED` with `depth` 0); recursion rounds keep the active plan. The run state is released on final-direct, on the normal completion tail (fallback finish or mid-run plain-text abandonment), on stealth/empty stops, and on error.

## Known Limits

- Linear pipelines only; runnable steps are clamped to `MAX_PIPELINE_STEPS` (5, aligned with `ToolManager.RECURSE_LIMIT`) so the fallback round always stays inside the recursion budget.
- `forced` mode depends on upstream support for per-function `tool_choice`; gateways that reject it fall back to `auto` behavior by configuration.
- The runtime does not validate step result structure beyond the final-step extraction contract.
