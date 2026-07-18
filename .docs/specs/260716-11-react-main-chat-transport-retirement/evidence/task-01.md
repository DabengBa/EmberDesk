# Task 01 Evidence — Generation command matrix & lifecycle service

## Summary

Introduced framework-neutral `public/scripts/chat-generation-command-service.js` as the generation command/lifecycle matrix owner. Every visible and non-visible request kind classifies as `generation-service` with explicit path/reason/capabilities; unknown kinds are rejected with `unsupported-with-reason` and never route to a `legacy` owner.

## TDD notes

- Greenfield module: tests in `tests/chat-generation-command-service.test.js` define the command matrix contract (classification, attempt planning, success/failure/abort simulation).
- Existing lifecycle and auto-recovery suites remain green without behavioral change.

## Commands

```bash
bun run --cwd tests test:unit -- chat-generation-command-service.test.js chat-generation-lifecycle.test.js chat-generation-auto-recovery.test.js chat-completions-openai-fallback.test.js chat-completions-google.test.js main-chat-bridge-contract.test.js react-workspace-panels-helpers.test.js --runInBand
```

## Result

- 7 suites / 129 tests passed
- PM: for each matrix kind, `createGenerationCommandPlan` + `simulateGenerationCommandOutcome` yield explicit owner, attempts, baseline strategy, and finalization; JSON of plan/command never contains `"legacy"`

## Artifacts

- `public/scripts/chat-generation-command-service.js`
- `tests/chat-generation-command-service.test.js`
