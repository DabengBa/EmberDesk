---
description: "Jest transform cache and Node native TypeScript module-resolution quirks that are not visible from passing unit tests."
kind: technical
topic: server-typescript
id: QUIRK-JEST-NATIVE-TS-RESOLUTION
external_service: jest-node-native-typescript
verified_date: 2026-11-14
---

# Jest Native TypeScript Resolution Quirk

## Symptom

Jest 29's default transform cache key does not include the transformer or helper implementation, so changing a helper can reuse stale transformed output when the same cache directory is reused; a fresh temporary cache directory hides the problem. Jest's module resolution is not equivalent to Node's native TypeScript execution: a Jest pass does not prove that native Node resolution succeeds.

## Invariant Action

After a transformer or helper change, invalidate the Jest transform cache or verify output with two independent Jest processes sharing one cache directory and a deliberately changed helper. Prove server TypeScript with both native Node execution and `pnpm run typecheck`; a Jest pass alone MUST NOT count as runtime resolution proof.
