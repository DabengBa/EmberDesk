# Task 5 Evidence — Operations, browser/mobile, semantic docs

## Summary

Completed sole-owner Extensions Host validation: desktop + mobile host E2E, third-party runtime, shell navigation with Extensions, and semantic/ledger/history docs updated to sole-owner.

## Commands / Results

```bash
bun run test:compat
# PASS  third-party-extension-compatibility.test.js (12 tests)

PLAYWRIGHT_REUSE_SERVER=0 bun run --cwd tests test:e2e -- \
  extensions-host.e2e.js third-party-extension-runtime.e2e.js \
  workspace-shell-panel-navigation.e2e.js --workers=1
# 12 passed

bun run docs:check
# Validated 30 semantic docs
```

## What was validated (PM)

| Area | Proof |
|---|---|
| React sole owner + protected mounts | `extensions-host.e2e.js` owner=`react`, mounts attached, legacy manage/install hidden |
| Manage action | React manage opens popup without dropping `#extensions_settings` / `#regex_container` |
| Mobile | 390×844 viewport keeps host controls + mounts |
| JS-Slash-Runner / aliases / slash / regex | `third-party-extension-runtime.e2e.js` |
| Same-entry shell open/close/switch with Extensions | `workspace-shell-panel-navigation.e2e.js` |
| Semantic sole-owner docs | `feature.extension_panel_open`, `page.chat_workspace`, `term.shared_browser_library`, ledger, PROJECT_HISTORY, compat tech, roadmap |

## Doc / artifact updates

- `.docs/db/features/extension-panel-open.md` — sole-owner contract
- `.docs/db/pages/chat-workspace.md` — supporting-panel state includes Extensions Host sole owner
- `.docs/db/terms/shared-browser-library.md` — sole-owner host wording
- `.docs/tech/legacy-cutover-ledger.md` — Extensions Host `sole-owner` + freeze-supported slots/barrel
- `.docs/PROJECT_HISTORY.md` — 2026-07-17 sole-owner row
- `.docs/tech/third-party-extension-compatibility.md` — mount lifecycle under sole owner
- `.docs/tech/react-modernization-roadmap.md` — Sprint 7 sole-owner notes
- `tests/extensions-host.e2e.js` — host + manage + mobile
- `tests/helpers/workspace-react-playwright-flags.js` — enable shell takeover for this proof
- `tests/workspace-shell-panel-navigation.e2e.js` — Settings sole-owner selectors + drawer preserve case (AI Config/Formatting are `/settings` routes)

## Notes

- Shell-nav Settings/AI Config cases were stale after Settings sole-owner; fixed as part of this task’s proof surface so Task 5 Proof command is honest.
- Product flag `extensionsHost` remains true-only / always-on (retired as dual-owner switch in Task 4).
