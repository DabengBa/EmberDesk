# Final Review (post-fix)

## Surfaces

- docs-frontend (coordinator; agent spawn unavailable)
- backend-core
- security-complexity-proof

## Confirmed findings (fixed)

### R-01 Client revision plumbing
- Severity: high
- Impact: With canonical writes enabled, React and legacy saves never sent `settings_revision`, so multi-session concurrency stayed last-write-wins despite server support.
- Fix: legacy `public/script.js` and React settings helpers/route send last-loaded revision and warn/reload on HTTP 409.

### R-02 Conflict body oversharing
- Severity: med
- Impact: 409 responses included full current settings document unnecessarily.
- Fix: return only `error` + `settings_revision`.

### R-03 Snapshot list write gate
- Severity: med
- Impact: Listing preferred write-state readiness, hiding readable canonical snapshots when writes were blocked.
- Fix: list via read state.

### R-04 Ambiguous `revision` protocol field
- Severity: med
- Impact: Top-level document field `revision` could be treated as concurrency token / stripped.
- Fix: only `settings_revision` is protocol.

## Rejected / residual

- Full UI redesign for conflict UX — out of scope; minimal reload/warn is enough.
- Missing-revision LWW for truly ancient clients — documented compat residual after client plumbing for first-party UIs.
- Jest open-handle from lodash throttle autosave — harness uses `--forceExit`; not a production defect.

## Re-validation

```bash
bun run --cwd tests test:unit -- canonical-settings-store.test.js settings-get-route.test.js settings-cache.test.js settings-react-route.test.js canonical-sqlite-operator.test.js canonical-storage-slice-registry.test.js --runInBand --forceExit
bun run docs:check
```
