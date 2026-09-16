---
name: emberdesk-local-browser-testing
description: Build and run isolated EmberDesk browser instances for workspace, settings, character authoring, and baseline comparisons.
---

# EmberDesk local browser testing

## Runtime and bundles
- Read AGENTS.md and package.json for the current Node/pnpm contract; do not use the machine's default Node without checking it.
- Install with the documented frozen-lockfile/ignore-scripts policy. If pnpm reports ignored dependency builds, report the nonzero result rather than silently approving scripts. Inspect git diff for automatic pnpm workspace changes before retrying.
- Build `build:lib`, `build:react`, `build:react:character-library`, and `build:react:workspace-panels` in each checkout. Separate baseline builds prevent testing stale PR bundles.

## Isolated instances
- Start from the target checkout with `pnpm run start --configPath /absolute/temp/config.yaml --dataRoot /absolute/temp/data --port 8000`; use a different config, data root, and port for baseline.
- Keep CSRF and security defaults enabled. Fresh config/data automatically opens `/setup`; create a local test administrator through the browser.
- For concurrent local instances, use localhost for one and 127.0.0.1 for the other (or separate browser profiles), since cookies are not isolated by port.

## UI navigation and checks
- Workspace nav buttons have accessible labels such as `Open Character Library` and `Open Settings`, even when only icons are visible.
- Character Library > New (`Create New Character`) opens React authoring. Fill Name, Description, and First message, then Save. Check both immediate editor state and persisted fields after reselect/reload; creation and selection are distinct steps.
- Chat options > Start new chat > Yes creates a solo session. Wait for the greeting/state transition before reloading, then use Manage chat files to verify distinct persisted sessions.
- Settings opens an overlay with General and User Interface tabs. Native browser Find can scroll to deep labels. The fixed footer save button is labeled `保存设置`; verify `Saved` then reload/reopen and inspect exact values.
- For removal tests, combine screenshots of the relevant visible surface with zero DOM counts; existence/absence checks alone do not prove surrounding UI is visible.
- If an anomaly appears, compare the same flow on the base revision using separately built assets and isolated data before claiming it was introduced by a PR.

## Devin Secrets Needed
- None for fresh local setup, character authoring, chat opening/creation, or settings persistence.
- Actual model generation requires an authorized provider credential; do not claim generation coverage without one.
