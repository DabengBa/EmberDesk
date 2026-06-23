# Main Chat Baseline Validation

## Module Responsibility

This document records the current proof baseline for the main-chat successor workstream. It distinguishes release proof, local diagnostic proof, skipped checks, and UX evidence gaps.

It does not change product semantics and does not update `.docs/db/`.

## Baseline Context

- Date: 2026-06-08
- Workspace: `D:\DEV\EmberDesk`
- Scope: main-chat structure, stored message rendering, layout, action affordance, and third-party compatibility gates.
- Durable sources:
  - `.docs/tech/briefs/260607-01-main-chat-successor-spec-set.md`
  - `.docs/tech/main-chat-successor-scope.md`

## Required Commands

The baseline requires these commands:

```powershell
bun run --cwd tests test:unit -- chat-workspace-structure.test.js third-party-extension-compatibility.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-layout.e2e.js
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js
```

Optional aggregate compatibility gate:

```powershell
bun run test:compat
```

## Current Evidence

Status: baseline proof passed locally for this delivery run.

| Evidence | Status | Notes |
|---|---|---|
| Static message DOM and send-form structure | passed | `bun run --cwd tests test:unit -- chat-workspace-structure.test.js third-party-extension-compatibility.test.js --runInBand` passed on 2026-06-08; `chat-workspace-structure.test.js` covered send-form controls, chat options, message template identity, and message row action role/name affordances. |
| Third-party compatibility | passed | Same command passed on 2026-06-08; `third-party-extension-compatibility.test.js` kept extension mounts, Tavern Helper assets/imports, slash-command exports, character-list selector contracts, event emitter methods, and regex placement values stable. |
| Synthetic layout proof | passed | `bun run --cwd tests test:e2e -- chat-message-layout.e2e.js` passed on 2026-06-08 with 1 Playwright test. |
| Real stored chat rendering | passed | `bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js` passed on 2026-06-08 with 1 Playwright test. The web server logged expected seeded-environment warnings for a missing generated chat file and missing default user avatar thumbnail; they did not fail the proof. |

## UX Evidence Fields

| UX Field | Current Proof Level | Notes |
|---|---|---|
| Chat open to first readable message | direct E2E timing annotation | `chat-message-rendering.e2e.js` passed and records `first-message-visible-ms` while waiting for seeded stored message text. |
| Send to local echo | missing | Covered by future interaction performance evidence, not this baseline. |
| First token | missing | Requires deterministic streaming proof. |
| Stop to usable | missing | Requires deterministic streaming proof. |
| Long-chat load-more to stable | partial direct E2E | Current rendering E2E verifies bounded DOM and load-more visibility; position stability is covered by the long-chat proof spec. |
| Visible action discovery | direct structure and E2E | Static role/name proof and real rendered-row action checks passed. |
| Keyboard and focus | partial direct structure | Static tests cover role/tabindex. Browser focus traversal remains future hardening. |
| Mobile and touch reachability | missing | Covered by later DOM identity and action-controller specs if implemented. |

## Failure Handling

If a required command fails:

1. Record the exact command and failure type.
2. Classify whether the failure is environment, baseline regression, or planned-scope gap.
3. Do not weaken selectors, role/name assertions, or message text fidelity to make the baseline pass.
4. Treat unresolved baseline regression as a blocker for later rendering or streaming changes.

## Related Local References

- `.docs/tech/main-chat-successor-scope.md`
- `tests/chat-workspace-structure.test.js`
- `tests/third-party-extension-compatibility.test.js`
- `tests/chat-message-layout.e2e.js`
- `tests/chat-message-rendering.e2e.js`
- `.docs/tech/third-party-extension-compatibility.md`
- `.docs/db/pages/chat-workspace.md`
- `.docs/db/features/chat-message-rendering.md`
- `.docs/db/features/chat-message-actions.md`
