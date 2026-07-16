# Review Findings

## R-01 Desktop list/editor collapsed when mobileView shared
- Severity: high
- Evidence: `openEntry` set `mobileView='editor'` and list pane used `hidden={mobileView==='editor'}`, collapsing desktop split after any entry click.
- Fix: track `isNarrow` via `matchMedia('(max-width: 768px)')`; only switch mobileView on narrow; pane visibility uses `showListPane`/`showEditorPane`.
- Validation: rebuild workspace panels; unit helpers/card-rendering PASS.

## R-02 Activation rules entry lacked real secondary surface
- Severity: medium
- Evidence: toggle only flipped local React hint text while legacy global panel stayed inert-hidden.
- Fix: bridge action `toggleActivationRules` -> `setWorldInfoActivationRulesVisible` reveals only `#wiGlobalPanel` under React owner and opens rules content when collapsed.
- Validation: structure markers + unit PASS.

## R-03 Dead vectorized no-op in field update path
- Severity: low
- Evidence: empty guard did not preserve or reject anything useful.
- Fix: removed no-op; allowlist omission of `vectorized` keeps existing entry values intact on unrelated saves.
- Validation: unit converters/helpers still PASS.

## Doc IDs
- `bun run docs:check` validated 30 semantic docs after feature/page updates.
