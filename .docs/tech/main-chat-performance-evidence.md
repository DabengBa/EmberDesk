# Main Chat Performance Evidence

## Module Responsibility

This note explains how EmberDesk records repeatable main-chat interaction performance evidence. It is a technical evidence guide for future optimization claims around `page.chat_workspace` and `feature.chat_message_rendering`.

It does not define user-visible performance promises, budgets, or semantic product behavior.

## Runner Owner

`scripts/interaction-performance-runner.mjs` owns the executable scenarios.

`src/interaction-performance-report.js` owns the report shape, payload normalization, timing summaries, and SQLite variant comparison structure.

## Main Chat Scenarios

The runner exposes the following main-chat scenarios through `--scenario main_chat` and `--list-scenarios`:

- `main_chat_warm_open_first_readable`: opens an existing character chat and records time until the first readable `.mes_text` appears.
- `main_chat_send_local_echo`: sends a local user message through the existing browser message path and records time until the local echo is rendered.
- `main_chat_stream_first_token`: uses a tests-only browser fetch stub for the chat-completions streaming endpoint and records time until the first streamed token appears.
- `main_chat_stream_stop_to_usable`: uses the same browser-only streaming stub, triggers the existing Abort request control, and records time until the composer is usable again.
- `main_chat_long_load_more`: opens a truncated long chat and records time from the existing load-more action until older message rows are stably visible.

These scenarios intentionally use the real app page, stable message-row selectors, and current browser event paths. They do not introduce production provider entries, provider protocol changes, or user-facing performance UI.

## Data Shape

The seeded profiles are machine-sensitive fixtures:

- `small`: 12 characters, 2 chat files per character, 50 messages in the measured main chat.
- `medium`: 60 characters, 4 chat files per character, 500 messages in the measured main chat.
- `large`: 180 characters, 6 chat files per character, 5000 messages in the measured main chat.

The measured main chat is the first session for the selected target character. Other seeded chats keep smaller message counts so route and list scenarios remain practical during full runner execution.

## Report Fields

Each scenario result records:

- scenario name
- runtime profile and dataset shape
- browser timing samples
- scenario-specific user-perceived metrics
- payload summaries with message counts and `mesid` ranges
- success, warning, and error summaries

The main-chat metrics are:

- `firstReadableMessageMs`
- `sendToLocalEchoMs`
- `firstTokenMs`
- `streamStopToUsableMs`
- `loadMoreToStableMs`

The report helper treats payload timings as noise for semantic comparison. Payload normalization keeps the stable facts that prove the interaction target, such as rendered row counts, first and last `mesid`, local echo state, stop recovery state, and load-more before/after `mesid` values.

## Interpretation Boundaries

Use these reports as repeatable local evidence, not release-wide guarantees.

Results vary with:

- Node.js runtime and CPU speed
- browser version and headless rendering behavior
- cold or warm filesystem cache
- derived-cache state
- dataset profile
- screenshot and diagnostics overhead
- local machine load

When claiming a performance improvement, compare before and after reports from the same machine, runtime, profile, variant selection, repeat count, and browser conditions. Do not compare a one-off local number against another developer's machine as a product KPI.

Known seed-environment noise such as the missing default persona thumbnail and tokenizer-count probe failures is filtered from perf validity because it does not change the measured main-chat interaction target.

## Validation

Focused proof for the report shape:

```bash
bun run --cwd tests test:unit -- interaction-performance-report.test.js character-list-structure.test.js --runInBand
```

Runner proof:

```bash
bun run perf:interaction
```

Focused browser rendering proof:

```bash
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js
```
