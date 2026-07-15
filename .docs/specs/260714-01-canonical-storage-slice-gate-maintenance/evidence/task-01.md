# Task 01 Evidence

## Red

Command:

```bash
bun run --cwd tests test:unit -- canonical-sqlite.test.js canonical-storage-slice-registry.test.js canonical-sqlite-operator.test.js canonical-settings-store.test.js canonical-secrets-store.test.js canonical-managed-media-store.test.js --runInBand --forceExit
```

Result: failed before implementation because
`getCanonicalStorageSliceFeatureFlagSnapshot` did not exist, default descriptors had no
`flagKey`/snapshot capability, and operator status did not expose sources.

## Green

Command:

```bash
bun run --cwd tests test:unit -- canonical-storage-slice-registry.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-operator.test.js canonical-sqlite-migrations.test.js canonical-settings-store.test.js canonical-secrets-store.test.js canonical-managed-media-store.test.js --runInBand --forceExit
```

Result: 7 suites, 60 tests passed.

## Summary

- Missing slice values retain global effective flags.
- Explicit slice values override only their own slice.
- Invalid explicit values disable the slice and return
  `invalid_slice_flag_configuration`.

