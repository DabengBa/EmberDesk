---
id: feature.wire_log
type: feature
name: Wire Log (Upstream Request Trace)
related: [page.settings, page.chat_workspace, feature.prompt_inspector, feature.reply_pipeline]
---

# Feature: Wire Log

## ID 解释

`feature.wire_log` is the upstream request/response trace recorder and its viewer. Every chat-completions generation can leave one JSON record on disk — the exact body sent upstream, the redacted headers, the response (full body, or the raw SSE text plus an assembled view for streams), timing, and a sanitized generation context — browsable in a `链路日志` overlay. It is a diagnostic trace of what actually left the machine, not a prompt assembler (that is [Prompt Inspector](feature.prompt_inspector)), not chat history, and not a retry/replay surface.

## Purpose

When a reply is wrong, the question is almost always "what did we actually send, and what came back?" Prompt-side inspection cannot answer it: prompt post-processing, provider-specific shaping, resume-after-abort partial streams, and transport failures all happen after assembly. Wire log records that exact boundary so a bad turn can be diagnosed from evidence instead of reconstruction.

## Ownership Direction

`src/wire-log-store.js` owns the on-disk shape (one record = one file under `<user root>/wire-logs/<YYYY-MM-DD>/`, written temp-then-rename) plus listing, reading, deleting and purging. `src/wire-log-tap.js` owns passive observation: the SSE assembler and the per-session trace context (`createRecordTrace`). `src/wire-log-recorder.js` owns the session lifecycle (begin / complete / stream / fail / flush), the normalized options, and the per-session retention sweep. `src/endpoints/backends/chat-completions.js` is the only writer: it reads `feature_settings.wire_log` from the canonical settings document, opens a recorder, and drives the session. `src/endpoints/wire-log.js` is the viewer API and the settings read/write route. The viewer UI (`app/components/wire-log/`) never touches the filesystem — it only calls `/api/wire-logs`.

## User-Visible Contract

- Logging is **opt-out**. With nothing stored, generation writes records: `enabled` defaults to true and only an explicit `enabled: false` turns it off. The viewer's config route and the generation path read the same normalizer, so they cannot disagree about the default. An unreadable settings document resolves to "on with defaults" rather than silently muting evidence.
- Config (`GET`/`POST /api/wire-logs/config`): `{ enabled, captureBody, maxFileBytes, retentionDays, redact }`. `captureBody` (default true) can withhold bodies while still recording byte counts, tool/message counts and timing. `maxFileBytes` (default 2 MiB) replaces an oversized body with a `{__truncated, bytes, limit}` marker instead of dropping the record. `redact` always includes `authorization`, `x-api-key`, `cookie`, `proxy-authorization` and masks those values as `***redacted***`; response headers go through the same mask because a proxy can echo request headers. POST merges only the `feature_settings.wire_log` leaf — every other settings key survives byte-for-byte — and unknown keys are dropped.
- The viewer's **正文捕获上限** (`maxFileBytes`, default 2 MiB) bounds captured body content, not the total JSON file size. Metadata and separate raw/assembled stream representations can make the saved file larger than that value. Oversized bodies are marked as truncated; an unbounded upstream stream does not cause unbounded accumulation of captured text.
- Retention is a **rolling 48-hour window**, expressed as `retentionDays: 2`, based on each record's timestamp rather than “today + yesterday” partitions. Cleanup is triggered by the next generation with recording enabled, once per request-owned recorder; opening the viewer alone does not purge old records. Only records strictly older than the cutoff are expired: records at the cutoff or newer survive, including those sharing a date partition with expired records. Cleanup failures are reported diagnostically without changing the generation result.
- The context stamped on a record is a fixed allow-list — `type`, `model`, `source`, `chatId`, `charName`, `pipelineRun`, `pipelineStep`, `regenerate` — so a client-supplied `_trace` can never inject arbitrary structure, and `_trace` itself is stripped before the body reaches the provider. `chatId` (the active chat file) is what lets the viewer scope to the current conversation: it comes from the client's `_trace` when present, with the endpoint's own `chatId` as the authoritative override, and is resolved once per session rather than re-read mid-stream (a chat can be renamed while a turn is in flight).
- The list route (`GET /api/wire-logs`) returns metadata only — id, timestamp, status, error message, context, request url/bytes/truncated/tool+message counts, response status/bytes/duration/ttft/chunks. It never carries bodies or headers, so filtering and rendering a row cannot leak prompt text. Filters: `date` (`YYYY-MM-DD`), `status`, `type`, `chatId`, `limit` (default 100, clamped to 500); an empty `chatId` means "no filter", not "match nothing".
- `GET /api/wire-logs/:id` returns the full record; `DELETE /api/wire-logs/:id` deletes one. Record ids and dates are validated before being used as path segments, so a traversal attempt is rejected as a 400 rather than reaching the filesystem.
- A generation that fails, is aborted mid-stream, or returns a 4xx/5xx upstream status still produces exactly one record: `complete`/`fail` settle once, and an aborted stream keeps everything captured up to the abort. A logging failure (unwritable root, serialization error) is reported through `onError` and never changes the HTTP response the user receives.
- The viewer opens scoped to the chat currently on screen, with a `查看全部` toggle to drop the scope; status and date filters are server-side, keyword and model filters run locally.
- Open `链路日志` from the chat-options menu. The modal keeps keyboard focus inside while open; Escape or the close button returns focus to the chat-options entry. On narrow screens, filters and detail actions wrap without squeezing button labels into vertical text.
- A selected record shows its conversation, character, generation type and available pipeline association alongside the actual request and response. Quiet/background work does not borrow a foreground pipeline step; closing rounds may belong to a run without claiming its previous step. Switching conversations during a response does not reassign the original request's log.
- Copy the full JSON, request messages, or response text; download the full JSON; delete the selected record. A disabled recording switch stays disabled after another ordinary settings save and a refresh. Saving failures remain visible and do not claim success.

## Semantic Interaction IDs

- `feature.wire_log.record`: one generation producing one trace record.
- `feature.wire_log.viewer.open`: opening the `链路日志` overlay.
- `feature.wire_log.viewer.scope`: toggling between the current chat and all chats.
- `feature.wire_log.viewer.filter`: applying status / date / keyword / model filters.
- `feature.wire_log.viewer.detail`: opening one record's full request and response.
- `feature.wire_log.viewer.delete`: deleting one record.
- `feature.wire_log.config.toggle`: enabling or disabling recording.
- `feature.wire_log.config.body`: toggling body capture.

## Acceptance Workflows

- As a user with no wire log setting ever saved, send a message and open the viewer scoped to the current chat; the turn must appear with its request/response. Delete that record, then switch to "all chats"; it must be absent there too. Failure is an empty viewer on a fresh profile or a deleted record remaining in either list.
- As a user diagnosing a bad reply, open the record and read the request body; it must equal what the provider received (post-processed prompt included), with credentials masked and no `_trace` field. Failure is a body that differs from the upstream payload or leaks a key.
- As a user who aborts a streaming reply mid-flight, open the record; it must exist with status `error`, the partial SSE raw text, the partially assembled content, and its timing. Failure is a missing or fully empty record.
- As a user returning after several days, send a generation with recording enabled, then refresh the viewer after cleanup; records strictly older than the rolling 48-hour cutoff disappear, while records at or after the cutoff remain. Merely opening the viewer, or generating with recording disabled, does not trigger cleanup. Failure is expired records surviving a successful cleanup or an unexpired record being deleted because it shares an older date partition.
- As a user who turns the switch off, send a message; no wire-logs directory may be created at all. Failure is a directory created and left empty.
- As a user browsing another conversation's logs, toggle `查看全部`; the list must expand from the current chat to every chat. Failure is a filter that ignores `chatId` or matches nothing when chatId is absent.
- As a keyboard or mobile user, open the viewer from chat options, inspect a real record, copy/download it, and delete it. Tab and Shift+Tab remain inside the open viewer; Escape returns to chat options. Failure is unreachable controls, clipped horizontal content, or focus disappearing behind the modal.
- As a user disabling diagnostics, turn recording off, close the viewer, save another workspace setting, and refresh. The viewer must still offer `开启追踪`, not silently turn recording back on.

## Feature-Specific Evidence

- One JSON file per generation under `wire-logs/<YYYY-MM-DD>/`, with no `.tmp` residue after a write, is storage evidence.
- A record whose `request.body.messages` deep-equals the body the upstream stub received is request-parity evidence; a record surviving a write failure with an unchanged HTTP response is isolation evidence.
- `context.chatId` present on the record matching the `_trace.chatId` the client sent is session-filter evidence.
- An enabled generation schedules cleanup once for its request-owned recorder. Removal of records strictly older than its rolling 48-hour cutoff, with records at the cutoff and newer retained even in the same date partition, is retention evidence; no cleanup triggered solely by opening the viewer or a disabled generation is the complementary boundary.

## Failure Signals

- The viewer lists bodies or headers on list rows, or a stored record carries an unmasked credential.
- `_trace` reaches the upstream payload, or arbitrary client keys appear in the stored `context`.
- A logging error surfaces to the user as a failed generation, or a generation is delayed waiting on a purge.
- The config route and the generation path disagree about whether logging is on.
- `chatId` filtering returns every record regardless of scope, or returns nothing when the parameter is empty.
