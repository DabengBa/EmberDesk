---
id: feature.wire_log
type: feature
name: Wire Log (Upstream Request Trace)
related: [page.settings, page.chat_workspace, feature.prompt_inspector, feature.reply_pipeline]
---

# Feature: Wire Log

## ID 解释

`feature.wire_log` is the upstream request/response trace recorder and its `链路日志` viewer. Each chat-completions generation can leave one record of what was sent, redacted request headers, the response, timing, and a bounded generation context. It is a diagnostic trace of what actually left the machine, not a prompt assembler ([Prompt Inspector](feature.prompt_inspector)), chat history, or a retry surface.

## Purpose

When a reply is wrong, answer “what did we actually send, and what came back?” Prompt-side inspection cannot cover post-assembly shaping, resume-after-abort partial streams, or transport failures. Wire log records that boundary so a bad turn can be diagnosed from evidence.

## User-Visible Contract

- Recording is on unless explicitly turned off. A settings document that cannot be read resolves to recording on.
- Request and response bodies are captured only when body capture is turned on. Otherwise records still include byte counts, tool/message counts, timing, and known non-negative token counts. Full bodies are never printed to the terminal; upstream failures appear with a status and safe error code rather than the provider's raw error.
- Credential-bearing request and response headers are always masked. The recorded request body has diagnostic tracking fields removed before it is sent upstream.
- A body-size limit applies to captured bodies, not to the total saved record. Oversized bodies are marked truncated; an unbounded upstream stream does not produce unbounded captured text.
- Records are kept in a rolling 48-hour window based on each record's timestamp. Cleanup runs on the next generation with recording enabled, not when the viewer is opened. Only records strictly older than the cutoff expire; records at or after the cutoff remain even if they share a calendar day with expired records. Cleanup failures are reported diagnostically without changing the generation result.
- Recorded generation context is a fixed set of diagnostic facts about the chat, character, generation type, and any pipeline association. Arbitrary client-supplied fields are neither stored nor sent upstream. The active chat is resolved once for a turn so a rename mid-generation does not reassign the record.
- The viewer list shows metadata only — never bodies or headers — so filtering and rendering a row cannot leak prompt text. It filters by date, status, generation type, and chat, with a bounded list length. An empty chat filter means no chat filter, not an empty result.
- One full record can be opened for detail. Delete removes one record. Record identifiers and dates are validated before use.
- A generation that fails, is aborted mid-stream, or receives an upstream error still produces exactly one record. An aborted stream keeps everything captured up to the abort. A logging failure never changes the generation result the user receives.
- Open `链路日志` from the chat-options menu. The viewer starts scoped to the current chat with a `查看全部` toggle to include every chat. Status and date filters apply to the stored set; keyword and model filters apply to the visible records.
- The modal keeps keyboard focus inside while open; Escape or the close button returns focus to the chat-options button. On narrow screens, filters and detail actions wrap without squeezing button labels.
- A selected record shows its conversation, character, generation type, pipeline association, request/response metadata, and opted-in bodies. Quiet/background generations do not claim a foreground pipeline step; closing rounds do not claim the previous step. Switching conversations during a response does not reassign the original record.
- The viewer can copy the full record, request messages, or response text; download the full record; and delete the selected record. A disabled recording switch stays disabled after another ordinary settings save and a refresh. Saving failures remain visible and do not claim success.
- With recording off, no trace directory is created at all.

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

- As a user with no wire log setting ever saved, send a message and open the viewer scoped to the current chat; the turn must appear with request/response metadata and no bodies. Delete that record, then switch to all chats; it must be absent there too. Failure is an empty viewer, unsolicited body capture, or a deleted record remaining in either list.
- As a user diagnosing a bad reply, enable body capture before sending, then open the record and read the request body; it must match what the provider received after final shaping, with credential headers masked and diagnostic tracking fields removed. Failure is a different body or unmasked credentials.
- With body capture on, abort a streaming reply mid-flight and open the record; it must exist with the error state, captured partial stream and assembled content, and timing. With capture off, the abort still produces a metadata record. Failure is a missing record or missing opted-in partial content.
- As a user returning after several days, send with recording enabled, then refresh the viewer after cleanup; records strictly older than the rolling 48-hour cutoff disappear while records at or after the cutoff remain. Merely opening the viewer, or generating with recording disabled, does not trigger cleanup. Failure is expired records surviving cleanup or an unexpired record deleted because it shares an older calendar day.
- As a user who turns recording off, send a message; no trace directory may be created at all. Failure is an empty directory created after recording was disabled.
- As a user browsing another conversation's logs, toggle `查看全部`; the list must expand from the current chat to every chat. Failure is a filter that ignores chat scope or matches nothing when the filter is cleared.
- As a keyboard or mobile user, open the viewer from chat options, inspect a record, copy/download it, and delete it. Tab and Shift+Tab stay inside the viewer and Escape returns to chat options. Failure is unreachable controls, clipped content, or focus behind the modal.
- As a user disabling diagnostics, turn recording off, save another workspace setting, and refresh; recording must stay off.

## Failure Signals

- The viewer lists bodies or headers on list rows, or a stored record carries an unmasked credential.
- Arbitrary client fields appear in the stored context or reach the upstream request.
- A logging error surfaces as a failed generation, or a generation is delayed waiting on cleanup.
- Recording state differs between the viewer and generation.
- Chat filtering returns every record regardless of scope or nothing when the filter is cleared.
- Recording off still creates a trace directory, or a disabled switch turns itself back on.

## Boundaries

- Prompt assembly and pre-send preview belong to [Prompt Inspector](feature.prompt_inspector).
- Generation-type and pipeline semantics belong to [Reply Pipeline](feature.reply_pipeline).
- Chat workspace placement belongs to [Chat Workspace](page.chat_workspace), and settings controls belong to [Settings](page.settings).
