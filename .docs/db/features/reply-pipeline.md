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

`public/scripts/reply-pipeline-core.js` owns pure logic (normalization, step resolution, step prompts, final-text extraction); `public/scripts/reply-pipeline.js` owns the run state machine and request shaping (step prompt injection, forced `tool_choice`, closing-round tool removal, per-step `max_tokens`). `generation-service.js` executes decisions: it stamps invocations, saves cards, and performs the final-direct write plus cleanup. The plan itself lives in `oai_settings.reply_pipeline` — it travels with the preset.

## User-Visible Contract

- `reply_pipeline` is preset-carried: `{ enabled, enforce_mode?: 'auto'|'forced', result_field?, final, steps: [{ tool, prompt?, display?, max_tokens?, reasoning_effort?, id? }] }`. It is a `settingsToUpdate` field, so preset apply/save and `settings.json` persistence all carry it; applying a preset without a `reply_pipeline` key clears the active pipeline.
- `final` names the reply-producing tool; the plan is truncated at that step (steps after it are unreachable), and an unknown or missing `final` resolves to the last step. Plans are clamped to `MAX_PIPELINE_STEPS` (5 = `ToolManager.RECURSE_LIMIT`).
- Steps whose tools are missing from the enabled bindings — or whose binding is `stealth` — are skipped; a pipeline with no runnable steps is inert.
- Each round injects one system instruction naming the step's tool and its `prompt`. Shaping only applies to `type === 'normal'` request bodies and is applied once per messages array (retries re-emit the event on the shared array), so quiet/raw/other generations never inherit stale step prompts, forced `tool_choice`, or step token caps.
- `enforce_mode: 'forced'` pins `tool_choice` to the step's function; `auto` (default) relies on the step instruction. `steps[].max_tokens` applies to whichever of `max_tokens`/`max_completion_tokens` the model path produced. `steps[].reasoning_effort` (`auto|low|medium|high|min|max`) overrides `reasoning_effort` for that round through the same provider mapping the preset-level value uses.
- Preset prompts can scope to a single round: an `injection_trigger` value of `pipeline:<tool>` fires only while that step is being driven (matching is additive — `all`/`normal` prompts keep firing on every pipeline round). The closing round has no active step, so step-scoped prompts never inject there. The prompt panel renders one `管线 <tool>` checkbox per runnable step.
- The prompt panel's bottom 回复管线 section is the step editor: one row per step (`tool` + per-round `prompt`), an enable toggle, and add/delete/up/down controls. Row order IS the plan and the last row always owns `final`; edits write `oai_settings.reply_pipeline` directly (step keys the UI doesn't expose — `display`, `max_tokens`, `reasoning_effort` — survive row edits).
- Step matching is forward-progress: the plan advances to just after the furthest step whose tool was invoked, so batched or out-of-order calls are accepted but already-finished steps never rewind the plan; a round with no matching step re-asks the current one.
- When the final step completes, its result IS the reply: a plain string result is used directly; JSON object results require `result_field` (dot path), and a JSON scalar string is unwrapped. Errored, empty, or unusable results trigger one closing round with **no `tools`** and an explicit "do not call tools" instruction; the failed final card's `hidden` display is lifted to `summary` so the error stays visible.
- The final-direct write keeps the AI_OUTPUT regex pass, skips stopping-string trimming, mirrors the normal generation tail (save, unblock, panel refresh), and preserves the streaming return shape.
- Cards: one pipeline run merges into ONE card message — later rounds find the existing card by `extra.reply_pipeline_run`, append to `extra.tool_invocations`, regenerate `mes`, and re-render in place (structured replay is unchanged: each invocation still replays as assistant `tool_calls` + `role:tool`). The card renders `<details data-pipeline-run>` with one `<section data-tool-invocation data-pipeline-step data-pipeline-display>` block per round; `hidden` is a block-level flag, so a hidden final step never suppresses the card itself. A step's array params lift to a `data-respond-options` chip row outside the fold so options stay clickable while collapsed. The whole message hides (`replyPipelineHidden`) only when every step is hidden AND no chips exist. Card `mes` passes through AI_OUTPUT regexes at write/merge time, so users can restyle or restructure step blocks via `data-*` anchors; `MESSAGE_SANITIZE` rewrites classes inside `mes` to `custom-*`, which is why all hooks are `data-*`.
- A pipeline run starts only on a fresh turn (`GENERATION_STARTED` with `depth` 0); recursion rounds keep the active plan. The run state is released on final-direct, on the normal completion tail (fallback finish or mid-run plain-text abandonment), on stealth/empty stops, and on error.

## Known Limits

- Linear pipelines only; runnable steps are clamped to `MAX_PIPELINE_STEPS` (5, aligned with `ToolManager.RECURSE_LIMIT`) so the fallback round always stays inside the recursion budget.
- `forced` mode depends on upstream support for per-function `tool_choice`; gateways that reject it fall back to `auto` behavior by configuration.
- The runtime does not validate step result structure beyond the final-step extraction contract.
