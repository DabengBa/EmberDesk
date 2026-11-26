---
description: "Jest stays the Node runner and Playwright the E2E runner; test lanes follow real dependencies, not file layout, and unavailable phase timings stay null."
kind: adr
topic: jest-playwright-runner-boundary
id: "ADR-0002"
status: active
supersedes: null
created_at: 2026-11-26
affects_symbols:
  - "public/scripts/st-context.js#getContext"
---

# Jest And Playwright Runner Boundary

## Context

The repository already carries Jest-specific compatibility gates, Playwright fixtures, and a separate `tests` package. Test classification had drifted toward directory names and filename convenience, which obscured what each lane actually proves and made the inventory report claim timings the runner cannot expose.

## Decision

Keep Jest for Node-side tests and Playwright for browser E2E; Vitest MUST NOT be added as a second runner. The existing compatibility gates and fixtures are proof infrastructure, not incidental configuration, so replacing the runner is a migration project that does not improve the proof boundary. A test's lane is determined by the resources it actually depends on: deterministic logic is Unit, real filesystem/SQLite/HTTP/module boundaries are Integration, and browser runtime or cross-module user flows are E2E. Reading React or browser source files does not make a test a Component test; the Component lane stays empty until a real DOM-backed Jest component test exists. Jest JSON does not expose transform timing or complete per-file environment/teardown timing, so those inventory fields stay `null` rather than being fabricated from approximations. Playwright's discovery count is evidence of listing only, not a pass/fail result.

## Rejected

- Adding Vitest alongside Jest as a second runner, or replacing Jest wholesale: it duplicates configuration and gates without changing what is proven.
- Assigning lanes by directory, historical location, or filename; classification must follow actual dependencies.
- Promoting source-contract tests that merely read DOM tokens to Component lane status.
- Populating unavailable Jest JSON timing fields with approximations or inferred values.

## Constraint

Focused proof MUST remain runnable against a named target file. Static resource and lifecycle flags from the inventory are audit candidates; production cleanup changes require focused runtime confirmation. Budget overruns are reported separately from failures and should be investigated through fixture setup, import cost, environment initialization, and cleanup before raising timeouts.
