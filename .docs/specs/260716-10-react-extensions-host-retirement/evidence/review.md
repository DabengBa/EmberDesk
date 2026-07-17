# Final Review — React Extensions Host Legacy Retirement

**Date:** 2026-07-17  
**Stage:** final-review  
**Classifier:** `touches_frontend=true`, `run_frontend_review=true`, user+tech docs recommended (already updated in Task 5)

## Surfaces reviewed

- Domain/service spine: `extension-host-domain.js`, `extension-host-service.js`, `extension-compatibility-slots.js`
- Public barrel: `public/scripts/extensions.js`
- Shell mount/hide: `public/script.js` Extensions Host host/controller bridge
- React panel: `app/workspace-panels.tsx` `ExtensionsHostWorkspacePanel`
- Flags: `src/workspace-react-features.js` always-on `extensionsHost`
- Tests: unit host service, compat, E2E host/runtime/shell
- Docs: feature/page/term, ledger, history, compat tech, roadmap, flag flow

## Spec requirements check

| Req | Verdict | Notes |
|---|---|---|
| R1 lifecycle sole owner | Pass | Session + deferred loader + React host status/retry |
| R2 stable slots | Pass | Slot manager claims protected IDs outside React JSX |
| R3 operations via services | Pass | Domain/service envelopes; Manage/Install bridge actions |
| R4 Extras | Pass | React controls + bridge update/connect/autoconnect |
| R5 JS-Slash-Runner/aliases | Pass | compat + runtime E2E |
| R6 thin barrel | Pass | Domain/service imports; no second lifecycle state |
| R7 delete flag/fallback | Pass | Always-true flag; hide legacy chrome; no product dual-owner path |
| R8 no auto worktree clean | Pass | Safety envelopes preserved |
| R9 validation + docs | Pass | Task 5 proof + semantic sole-owner docs |

## Findings

### R-01 Retry wired to Manage instead of deferred reload — **fixed**

- **Severity:** medium  
- **Scope:** `public/script.js` bridge `retryDeferredExtensions`  
- **Issue:** Recovery action `retryDeferredExtensions` called `openExtensionsHostManager()`, which opens Manage after ensure, not a pure deferred retry.  
- **Fix:** Added `retryDeferredExtensionsHostLoad()` in `extensions.js` (session `ensureDeferredReady`) and routed the bridge case to it. Unit assertion locks the mapping.  
- **Validation:** `extension-host-service.test.js` + `react-workspace-panels-helpers.test.js` pass.

### Frontend / UX notes (no open finding)

- Visible dual-owner Manage/Install/Extras chrome is hidden under React ownership (`hideLegacyExtensionsHostControls`).
- Protected mounts stay attached; markers use `data-extensions-host-compat-slot` without React-owned duplicate IDs.
- Mobile host E2E covers 390×844 reachability.
- Primary CTA sequence (open Extensions → host actions → manage) unchanged at product level; UX walkthrough not required beyond existing E2E.

## Residual accepted risk

- Residual hidden legacy inputs remain as service/bridge scaffolding (not product dual-owner chrome).
- Workspace shell still coordinates drawers; shell itself is out of this package’s retirement scope.

## Decision

Review complete with R-01 fixed and revalidated. Proceed to documentation-and-wrap.
