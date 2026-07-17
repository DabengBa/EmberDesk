# Multi-agent code-review synthesis — 2026-07-17

## Fan-out

| surface | agent | status |
|---|---|---|
| docs-frontend | CodeBuddy | completed |
| backend-core | Codex | completed |
| security-compat | Codex (x2) | failed (upstream moderation 400) — coordinator self-pass |
| tests-proof | CodeBuddy | completed |

## Confirmed and fixed

| ID | Severity | Fix |
|---|---|---|
| R-02 | high | `moveExtension` sends `{source,destination}`; unit asserts body |
| R-03 | high | hide legacy only on `result.mounted`; restore on failure |
| R-04 | medium | `retryDeferredExtensionsHostLoad` uses barrel `ensureDeferredExtensionsReady` |
| R-05 | medium | remove empty React slot placeholders; update unit assertions |
| R-06 | medium | hide header row structurally; Extras heading via i18n keys |
| R-07 | medium | E2E requires React shell nav; manage requires popup; slash catch ≠ success |

## Rejected / deferred

- Spec R2 “slots must not depend on legacy drawer”: intentional same-entry drawer shell; freeze-supported mounts stay in drawer DOM by design (ledger sole-owner + freeze slots). Not a product bug.
- “Service spine not production lifecycle owner”: Manage/Install still open established popups by design in this package; service owns ops envelopes for future cutover. Architecture residual, not silent breakage of user path.
- Disabled-flag E2E: product flag retired always-on; negative path is fail-closed missing bundle, not flag-off dual owner.

## Validation

```
bun run --cwd tests test:unit -- extension-host-service.test.js react-workspace-panels-helpers.test.js --runInBand  # 39 passed
bun run test:compat  # 12 passed
PLAYWRIGHT_REUSE_SERVER=0 bun run --cwd tests test:e2e -- extensions-host.e2e.js third-party-extension-runtime.e2e.js --workers=1  # 4 passed
```
