# External Content Import Pipeline

## Module Responsibility

This document records the route-adjacent service boundary for importing external character, lorebook, and asset content from URLs or provider IDs.

The pipeline covers:

- external source classification
- host extraction and allowlist checks
- one fetch wrapper for external content requests
- provider artifact envelopes
- route-facing failure descriptors
- proof that provider secondary downloads do not bypass the wrapper seam

It does not change import UI feedback, canonical file writes, asset category rules, provider response formats, or `whitelistImportDomains` configuration semantics.

## Architecture And Constraints

`src/endpoints/external-content-import-service.js` is the shared service. `src/endpoints/content-manager.js` and `src/endpoints/assets.js` delegate source classification, allowlist checks, and external fetch behavior to that service while keeping their route-owned validation, headers, temp-file handling, stream copying, and legacy response shapes.

Important constraints:

- URL host decisions use `new URL(url).hostname`, not substring matching against the raw URL, path, or query
- provider helpers receive an injected `fetchExternalResource` dependency so metadata and artifact downloads use the same wrapper
- generic imports remain allowlist-bound
- private-address filtering remains owned by `src/private-request-filter.js` and the startup-installed fetch agent
- service envelopes are internal implementation details and must not become new browser-facing JSON contracts

## Core Implementation

`external-content-import-service.js` exports:

- `classifyExternalContentUrl()`
- `classifyExternalContentId()`
- `getHostFromUrl()`
- `isHostWhitelisted()`
- `fetchExternalResource()`
- `downloadExternalContentArtifact()`
- `downloadExternalAsset()`

`content-manager.js` exports `EXTERNAL_CONTENT_DOWNLOADERS` so focused tests can exercise the real provider downloaders with injected fetch dependencies. That table covers the current provider-specific import paths, including Chub lorebook metadata/raw content, Chub character metadata/avatar, Pygmalion, Janitor, and Perchance downloads.

The route layer still owns HTTP status mapping and response shape. The service returns typed result objects so callers can preserve existing behavior without duplicating classification or external fetch logic.

## Validation

Focused proof:

```powershell
bun run --cwd tests test:unit -- external-content-import-service.test.js private-request-filter.test.js express5-route-compatibility.test.js --runInBand
rg -n "\bfetch\(" src\endpoints\content-manager.js src\endpoints\assets.js src\endpoints\external-content-import-service.js
```

The `rg` command should return no matches. Provider secondary-download proof lives in `tests/external-content-import-service.test.js`.

## Related Semantic IDs And Binding Points

Semantic IDs:

- `feature.character_library_panel`
- `feature.world_info_panel`
- `term.character_card`

Stable binding points:

- `POST /api/content/importURL`
- `POST /api/content/importUUID`
- `POST /api/assets/download`
- `whitelistImportDomains`
- `src/private-request-filter.js`
- `src/endpoints/external-content-import-service.js`
- `EXTERNAL_CONTENT_DOWNLOADERS` in `src/endpoints/content-manager.js`

Related docs:

- [Modernization Roadmap](modernization-roadmap.md)
- [Server Startup Orchestration](server-startup-orchestration.md)
- [Character Library Panel](../db/features/character-library-panel.md)
- [World Info Panel](../db/features/world-info-panel.md)
