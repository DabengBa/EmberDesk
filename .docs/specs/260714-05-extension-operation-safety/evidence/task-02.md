# Task 02 Evidence

## Summary
Wired install/update/switch/move/delete routes in `src/endpoints/extensions.js` through shared preflight decisions. Failures return structured envelopes; success shapes remain legacy-compatible. Dirty Git worktrees are blocked before mutation.

## TDD
- Extended `extension-operation-safety.test.js` with route fixtures for forbidden global install, dirty delete non-mutation, plain delete success shape, and forbidden move.
- Proof passed with existing update-state tests.

## Proof
```bash
bun run --cwd tests test:unit -- extension-operation-safety.test.js extension-repo-update-state.test.js --runInBand
```
Result: PASS (14 tests)

## Artifacts
- `src/endpoints/extensions.js`
- `src/extension-operation-safety.js`
- `tests/extension-operation-safety.test.js`
