# Task 05 Evidence - Browser, compatibility, performance, and semantic docs

## Summary

The React Main Chat command boundary has browser proof for visible composer,
continue, and regenerate actions. The interaction benchmark now restores the
canonical Character Library drawer/list before measuring React rows, avoiding a
duplicate-ID tab fragment left under the hidden Backgrounds panel in the perf
page.

## Commands

```bash
bun run perf:interaction
bun run perf:interaction -- --scenario character_library_first_interactive --profile medium --repeats 1 --pairs 1 --variant sqlite_on_only
bun run test:compat
bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js third-party-extension-runtime.e2e.js --workers=1
EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST=true bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js --workers=1 --grep "visible composer owner serializes|visible composer dispatches|visible continue dispatches|visible regenerate dispatches"
bun run docs:check
```

The focused performance command was repeated after final-review diagnostic
simplification and exited successfully with a generated `report.md`.

## Result

- Full interaction performance suite passed and wrote
  `artifacts/interaction-perf/2026-07-17T23-18-52-936Z/report.md`.
- `character_library_first_interactive` produced 3/3 valid pairs. The median
  first visible row was 26.1 ms and the median first clickable row was 32.6 ms.
- Compatibility validation passed: 12 tests.
- The complete streaming/extension browser suite passed: 18 tests, 4 expected
  skips.
- The React-flag Main Chat matrix passed all 4 selected streaming tests.
- Semantic documentation validation passed for all 30 documents.
- The performance report retains pre-existing non-fatal warnings for
  filesystem-versus-indexed paths, pagination payload parity, and one main-chat
  warm-open page error. The command still exits successfully; these warnings do
  not alter the verified visible generation command boundary.

## Regression Guard

- `tests/character-list-structure.test.js` first failed before the runner
  restored the canonical `#rightNavHolder` and rebound the canonical list node.
- The focused Character Library structure/helper suite passed after the fix.

## Artifacts

- `scripts/interaction-performance-runner.mjs`
- `public/script.js`
- `app/workspace-panels.tsx`
- `tests/character-list-structure.test.js`
- `tests/chat-message-streaming.e2e.js`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-generation-auto-recovery.md`
- `.docs/db/features/chat-message-actions.md`
- `.docs/db/features/fallback-provider.md`
- `.docs/tech/main-chat-generation-lifecycle.md`

## UX Follow-up — 2026-07-18

An isolated Playwright walkthrough logged in through the visible UI, opened
Character Library, selected the seeded character, then used the real composer
and chat-options menu. The deterministic local streaming response was installed
only after the visible post-login path established that the test profile had no
safe real provider credential.

- The first real pointer click on `Abort request` timed out only when the React
  Main Chat composer portal was enabled. The same click passed without that
  portal, while the old DOM-programmatic click proof passed in both modes.
- The repair gives the React composer capture ownership of the visible stop
  control and defers its bridge dispatch to the next task; the existing
  `stopGeneration()` path remains the only abort/lifecycle implementation.
- RED proof:
  `EMBERDESK_FEATURES_REACT_PANELS_MAINCHATMESSAGELIST=true bun run --cwd tests test:e2e -- chat-message-streaming.e2e.js --workers=1 --grep "visible composer dispatches a service-owned request"`
  failed because the visible `Abort request` pointer click timed out.
- Green proof: the same command passed after the repair. The four-action
  visible matrix also passed with an isolated Playwright data root, as did the
  normal stop regression, 85 focused unit tests, compatibility validation, and
  the workspace-panels build.
- Screenshot-verified desktop path: send showed a local generation status and
  stop control; stop settled to one partial assistant row with the normal send
  control restored; Continue appended to the same row; Regenerate reused that
  row.
- Independent mobile boundary: selecting a character through the visible
  Character Library opens a Character Authoring overlay that intercepts the
  chat composer. The overlay prevented a normal mobile chat walkthrough before
  the stop action. This is a separate Character Authoring flow defect and was
  not bypassed with a forced click or changed in this transport slice.
