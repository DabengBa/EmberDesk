# Task 03 Evidence

## Baseline

The focused baseline had three expected failures from domain tests hard-coding catalog tail
versions: settings expected v5, secrets expected `[1, 2, 3, 4, 5]`, while the catalog already
contained v6.

## Green

Command:

```bash
bun run --cwd tests test:unit -- canonical-storage-slice-registry.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-operator.test.js canonical-sqlite-migrations.test.js canonical-settings-store.test.js canonical-secrets-store.test.js canonical-managed-media-store.test.js --runInBand --forceExit
```

Result: 7 suites, 60 tests passed.

## Summary

- Shared test helper asserts a named migration is recorded plus its domain tables exist.
- Settings, secrets, and managed-media tests no longer assert the catalog final version.
- A test-only unrelated later migration leaves all three domain assertions green.

