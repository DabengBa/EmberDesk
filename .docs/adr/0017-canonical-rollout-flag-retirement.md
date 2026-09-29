# ADR-0017: Canonical Rollout Flag Retirement

- Status: Accepted
- Date: 2026-11-19
- Deciders: EmberDesk maintainers
- Supersedes: none
- Superseded by: none
- Amends: ADR-0011, ADR-0015, ADR-0016

## Context

Canonical SQLite was rolled out behind four staged gates (`reads`, `writes`, `chatStats`, `strict`) plus two durable switches (`enabled`, `shadowImport`). With all six slices on `projection: 'off'` (ADR-0016) the staged gates no longer model any supported configuration: reads and writes are canonical-only in every supported mode, and `strict` ceased to be an opt-in because there is no fallback left for it to prove. Keeping the keys would let operators configure combinations (`enabled: true, reads: false`) that silently do nothing or — worse — leave runtime code paths that still branch on them to dead file fallbacks.

## Decision

- `enabled` is the single authority switch and is now an **init-freeze**: `enabled: false` keeps the slice's DB closed (no open, no import, no audit) so operators can park a slice; every canonical touch returns the slice's structured unavailable/blocked result instead of reading or writing compatibility files.
- `shadowImport` stays: it controls whether the lazy-import pipeline may populate rows from compatibility files during init.
- `reads`, `writes`, `chatStats`, and `strict` are **retired**. Resolvers force them to `enabled` (a slice that is on reads and writes canonically; a frozen slice does neither). Explicitly configured values parse without error but emit a `retired canonical flag` warning and are ignored.
- Runtime file fallback is deleted: serving reads serve canonical rows or the slice's explicit unavailable result; mutation routes fail closed with structured 503/`CanonicalWriteBlockedError` when the canonical commit cannot proceed. The only retained file path is `canonical_flags_unavailable` (config unresolvable at all — bare environments where canonical cannot even be evaluated), which keeps the settings.json read/write so the shell can boot.
- Compatibility files remain import inputs, projections under `sync`, `export-all` output, and repair surfaces — never runtime authority.

## Consequences

- Audit-blocked reads hard-fail instead of degrading to files; operators see drift through the structured 503/500 surface and repair through `export-all`/repair tooling rather than a silent file read.
- Tests that pinned `reads: false`/`writes: false` file-fallback semantics are rewritten to init-freeze (`enabled: false`) or projection semantics; there is no supported "canonical on but files authoritative" state.
- Write-base read tiering from ADR-0016 is simplified: with writes always landing when the slice is enabled, canonical-first applies uniformly under `projection: 'off'`.
- Rollback to a file-authoritative deployment still requires `export-all` first; there is no in-place flag rollback because the retired flags no longer exist.
