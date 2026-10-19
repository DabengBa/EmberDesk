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

- `reply_pipeline` is preset-carried: `{ enabled, enforce_mode?: 'auto'|'forced', result_field?, final, steps: [{ tool, prompt?, display?, max_tokens?, id? }] }`.
- Steps whose tools are missing from the enabled bindings are skipped; a pipeline with no runnable steps is inert.
- Each round injects one system instruction naming the step's tool and its `prompt`; the instruction never leaks into later non-pipeline generations.
- `enforce_mode: 'forced'` pins `tool_choice` to the step's function; `auto` (default) relies on the step instruction.
- When the final step completes, its result IS the reply: a plain string result is used directly; JSON object results require `result_field` (dot path). Errored, empty, or unusable results trigger one closing round with **no `tools`** and an explicit "do not call tools" instruction.
- The final-direct write keeps the AI_OUTPUT regex pass, skips stopping-string trimming, mirrors the normal generation tail (save, unblock, panel refresh), and preserves the streaming return shape.
- Cards: each step round saves one tool-invocation card message carrying `extra.reply_pipeline_run` / `reply_pipeline_step` / `reply_pipeline_display`. The final step's card defaults to `hidden` (its content became the assistant message); earlier steps default to `summary` (collapsed `<details>`).
- A pipeline run starts only on a fresh turn (`GENERATION_STARTED` with `depth` 0); recursion rounds keep the active plan.

## Known Limits

- Linear pipelines only, and step count is bounded by `ToolManager.RECURSE_LIMIT`.
- `forced` mode depends on upstream support for per-function `tool_choice`; gateways that reject it fall back to `auto` behavior by configuration.
- The runtime does not validate step result structure beyond the final-step extraction contract.
