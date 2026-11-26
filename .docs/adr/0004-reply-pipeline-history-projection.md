---
description: "Server-side history projection merges retained summaries into one story_history call, submits unsummarized messages individually, and keeps synthetic pairs request-only."
kind: adr
topic: reply-pipeline-history-projection
id: "ADR-0004"
status: active
supersedes: null
created_at: 2026-11-26
affects_symbols:
  - "public/scripts/reply-pipeline-core.js#MAX_PIPELINE_STEPS"
  - "public/scripts/reply-pipeline-core.js#normalizeReplyPipeline"
  - "src/server-prompt/history.ts#createStoryProjection"
  - "src/server-prompt/history.ts#projectHistory"
---

# Reply Pipeline History Projection

## Context

Multi-step reply pipelines execute real tool calls, but the next user turn need not replay that execution log verbatim. Earlier discussion contrasted replaying only the last real step, synthesizing one whole-round call, and merging summaries; the core problem is choosing a history representation that preserves role, name, summary provenance, and budget pairing without pretending to execute tools.

## Decision

Server-side history projection merges retained wrapped memory summaries into a single `story_history({content})` call placed at the first retained summary; unsummarized older messages are submitted individually as `submit_story({kind, content, name?})`; the latest user input is a separate `story_continuation_input({kind:'user'})` referenced by step instructions. Each synthetic call is paired with an immediate `OK` tool receipt using the same id. Synthetic pairs are request-only: they are never written back to chat storage and never execute a tool. Full tool-projection bodies go in call arguments with short receipts, adopted after the earlier candidates were evaluated. Budget trimming keeps each call/receipt pair together.

## Rejected

- Candidate A: replay only the last real `respond` call. It deletes real history, duplicates the body in arguments and result, and cannot handle custom final tools, `result_field`, or post-processing where parameters, raw result, and visible text differ.
- Candidate B: synthesize a `pipeline_reply({})` call with the body in the tool result (or an isolated tool result). It invents a tool that never ran, changes authorship of the assistant's own words, and cannot drop the paired call without breaking the protocol; clearing real `respond` arguments also violates the default binding contract.
- Treating projection as persistence, UI rewrite, or tool execution; these are separate concerns and the synthetic calls do not appear in the current turn's tool list.
- Merging unsummarized old messages into `story_history`; only messages actually replaced by retained summaries are merged.

## Constraint

Synthetic calls MUST use stable source-derived ids that avoid real invocation ids and do not renumber when a new summary appears. Call and receipt MUST be retained or trimmed as one budget group. Pipeline history MUST NOT be enableable by merely renaming a custom tool to `submit_story`; it follows the active pipeline state and the same projection for inspector and real requests.
