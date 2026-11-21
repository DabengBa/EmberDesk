---
description: "Historical lifecycle and retirement of the derived character-index SQLite sidecar."
kind: technical
topic: derived-cache-sqlite
---

# Derived Cache SQLite Helper

## Retirement

The former `src/derived-cache-sqlite.js` supplied common SQLite lifecycle handling for the retired `src/endpoints/character-index.js`. Both modules and their dedicated helper tests have been removed. Character routes do not open, rebuild, or remove existing `<user root>/_cache/character-index.sqlite` files. The interaction-performance reporter still accepts historical measurements.

The sidecar was a rebuildable accelerator, not user storage. Canonical data remains under `<user root>/storage/emberdesk.sqlite`, with separate [canonical store management](canonical-sqlite-store-manager.md). See [Interaction Performance Indexing](interaction-performance-indexing.md) for the old schema and the current character route paths.

## Historical lifecycle

The helper detected `node:sqlite` support, cached handles by user root and sidecar key, applied WAL and `synchronous = NORMAL`, and used `meta.schema_version` with owner-provided schema hooks. It reset structurally invalid caches and disabled repeated failures for the running process. That disposable-cache recovery policy never applied to canonical SQLite.

Historical status records exposed the mode, SQLite support, database path, schema version and reset count. Disablement reasons included `force_off`, `unsupported`, and `reset_threshold_exceeded`. There is no active sidecar status endpoint.

## Validation

```bash
pnpm --dir tests run test:unit -- character-runtime-routes.test.js --runInBand
```
