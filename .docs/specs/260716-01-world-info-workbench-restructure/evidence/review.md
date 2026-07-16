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

## Post-delivery multi-surface re-review

### R-04 React list ignored search/sort facade pipeline
- Severity: high
- Evidence: `getWorldInfoWorkbenchEntrySummaries` returned raw `Object.values` sorted by order/title, while search/sort actions only updated legacy filter DOM.
- Fix: reuse `addMissingWorldInfoFields` + `worldInfoFilter.applyFilters` + `sortWorldInfoEntries`.
- Validation: unit helpers assert filter/sort markers; suite PASS.

### R-05 Field blur remount stole editor focus
- Severity: high
- Evidence: default `shouldRemount=true` remounted after every `updateEntryFields`.
- Fix: `shouldRemount` skips `updateEntryFields` and `toggleActivationRules`.
- Validation: unit marker + rebuild PASS.

### R-06 Activation rules reveal re-exposed global multi-select dual owner
- Severity: medium
- Evidence: revealing `#wiGlobalPanel` made `#WIMultiSelector` visible beside React global summary.
- Fix: while rules open under React owner, force-hide multi-select and section header; only rules surface remains.
- Validation: unit card-rendering markers PASS.

### R-07 Mixed EN advanced labels vs Chinese workbench claim
- Severity: medium
- Evidence: Sticky/Cooldown/position option labels stayed English in React workbench.
- Fix: Chinese labels in workbench controls and facade position summary strings.
- Validation: `build:react:workspace-panels` PASS.
