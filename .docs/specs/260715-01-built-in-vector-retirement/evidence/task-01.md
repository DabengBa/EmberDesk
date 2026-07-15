# Task 01 Evidence

- Red: `bun run --cwd tests test:unit -- vector-retirement.test.js --runInBand` failed because the retirement router and artifact removals did not exist.
- Green: the same command passes after replacing the route with the dependency-free `410` tombstone, deleting the vector runtime, removing `vectra`, and retaining the legacy directory contract.
- Supporting: `bun install --lockfile-only` regenerated `bun.lock` without `vectra`.
