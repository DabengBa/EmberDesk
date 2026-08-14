# Frontend Structure Contracts

## Module Responsibility

This document records the tests-only helper boundary for frontend structure contracts.

The helper boundary covers:

- reading repository files from focused Jest tests
- locating tags by class
- checking source markers with readable contract names
- checking document order
- checking button role/name affordances
- preserving selector uniqueness and wiring markers for compact frontend surfaces

It does not render the app, replace Playwright proof, or change production markup.

## Architecture And Constraints

`tests/helpers/frontend-structure-contract.js` centralizes repeated structure assertions that were previously scattered through individual tests.

Important constraints:

- prefer user-perceivable structure such as role, accessible name, label, `aria-live`, document order, and selector uniqueness
- use source-string markers only for wiring facts that are not honest runtime interactions in a unit test
- keep failure messages tied to a named contract and file path
- do not add parser dependencies for the first slice
- do not migrate broad character-list or world-info structure tests without a separate scoped change

## Core Implementation

The delivered migration covers the fallback provider and fallback secret map contract:

- fallback provider selectors remain embedded in the API configuration drawer
- fallback controls keep role/name button affordances
- fallback status keeps `aria-live="polite"`
- fallback provider warning keeps note semantics
- `SECRET_KEYS.OPENAI_FALLBACK` maps to `#fallback_provider_api_key`
- key-control wiring in `public/scripts/openai.js` remains source-marker protected

The helper is intentionally small so future migrations can keep contract inventories explicit instead of hiding important selectors behind a generic snapshot.

## Validation

Focused proof:

```bash
pnpm --dir tests run test:unit -- frontend-structure-contract.test.js chat-workspace-structure.test.js secrets-input-map.test.js character-list-structure.test.js world-info-card-rendering.test.js --runInBand
pnpm run test:compat
```

## Related Semantic IDs And Binding Points

Semantic IDs:

- `page.api_configuration`
- `feature.fallback_provider`
- `page.chat_workspace`

Stable binding points:

- `tests/helpers/frontend-structure-contract.js`
- `tests/chat-workspace-structure.test.js`
- `tests/secrets-input-map.test.js`
- `public/index.html`
- `public/scripts/openai.js`
- `public/scripts/secrets.js`

Related docs:

- [Frontend jQuery Slice Migration](frontend-jquery-slice-migration.md)
- [Third-Party Extension Compatibility](third-party-extension-compatibility.md)
- [API Configuration](../db/pages/api-configuration.md)
