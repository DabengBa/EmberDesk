# Workspace Composition Root Processing Flow

## Metadata

- Owner: Workspace Composition Root implementation documentation
- Current code binding:
  - `public/script.js`
  - `public/scripts/events.js`
  - `public/scripts/request-context.js`
  - `public/scripts/public-api.js`
  - `public/scripts/world-info-shell-context.js`
  - `tests/helpers/script-js-reverse-import-contract.js`
  - `tests/script-js-composition-root.test.js`
- Related tech doc: [Workspace Composition Root](../tech/workspace-composition-root.md)
- Related ADR: [ADR-0014](../adr/0014-workspace-composition-root.md)
- Related semantic docs:
  - [Chat Workspace](../db/pages/chat-workspace.md)
  - [Workspace Startup Bootstrap](../db/features/startup-bootstrap.md)
  - [Shared Browser Library](../db/terms/shared-browser-library.md)

## Goals And Non-Goals

Goals:

- Document the current browser module composition and startup order.
- Make extracted event, request-context, and public API ownership explicit.
- Record the current reverse-import gate and its failure behavior.
- Provide a standalone proof that reproduces the order and boundary rules without importing production code.

Non-goals:

- Claim that `public/script.js` is already assembly-only.
- Describe every domain owner still implemented in `script.js`.
- Replace the user-visible startup contract in `.docs/db/`.
- Define a new public extension API or a second runtime owner.

## Input Discovery And Parsing Rules

The composition root discovers its dependencies through static ES-module imports in `public/script.js`. The relevant direct owners are:

| Input or contract | Current owner | Root action |
|---|---|---|
| `eventSource`, `event_types` | `public/scripts/events.js` | import and use; expose approved compatibility names |
| CSRF token and request headers | `public/scripts/request-context.js` | install the Ajax prefilter, load the token during bootstrap, use headers |
| `globalThis.SillyTavern` | `public/scripts/public-api.js` | explicitly install `{ libs, getContext }` |
| World Info shell capabilities | `public/scripts/world-info-shell-context.js` | register callable capabilities and lazy values |
| legacy domain modules | `public/scripts/**` plus remaining root code | import and initialize in the existing sequence |

The reverse-import scanner recursively examines first-party `public/scripts/**/*.js`, skips `extensions/third-party/**`, tokenizes static and dynamic import forms, and compares the exact `(file, kind, specifier, names)` records with the current 70-entry snapshot.

## Outputs

The processing outputs are:

- an installed `globalThis.SillyTavern` object with `libs` and `getContext`;
- a request-context module containing the current CSRF token and header builder;
- the initialized `eventSource` / `event_types` contract;
- a registered World Info shell context;
- `APP_INITIALIZED` and `APP_READY` events when core bootstrap succeeds;
- a persistent startup error and rejected bootstrap when CSRF initialization fails;
- a static contract result that is clean only when no reverse-import entry or forbidden extracted-name importer has changed.

## Staged Processing Flow

### Module composition

1. `public/script.js` imports the extracted owners and the remaining workspace modules.
2. The root calls `installPublicBrowserApi({ libs, getContext })`.
3. The root registers the World Info shell context. The `extensionPromptRoles` value is read through a getter after the root has initialized that value.
4. The root installs the jQuery Ajax CSRF prefilter.
5. The jQuery-ready callback calls `bootstrapWorkspace()`.

### Bootstrap

1. `bootstrapWorkspace()` calls `loadCsrfToken()` inside the measured `csrfToken` stage.
2. If token loading fails, it shows `Couldn't get CSRF token. Please refresh the page.`, throws `Initialization failed`, and does not emit `APP_INITIALIZED` or `APP_READY`.
3. On success, it creates the splash overlay and runs the ordered UI, settings, character, feature, scraper, and late initialization stages.
4. It emits `APP_INITIALIZED` after late feature initialization.
5. It hides the initialization loader, fixes the viewport, mounts the React workspace shell chrome, and emits `APP_READY`.
6. It queues deferred version, backgrounds, extensions, and panel warmup work in a microtask after `APP_READY`.

### Reverse-import contract

1. The scanner ignores comments and string contents that are not import expressions.
2. It records static imports, re-exports, side-effect imports, namespace imports, and dynamic imports whose specifier resolves to `script.js`.
3. It skips vendored third-party extension directories.
4. It compares the result to the exact allowlist snapshot.
5. Separate checks reject first-party imports of `eventSource`, `event_types`, or `getRequestHeaders` from `script.js`.
6. Any new record or forbidden extracted-name import fails the focused test; existing allowlisted legacy records remain visible until a later extraction removes them.

## Key Rules

- `public/scripts/events.js` is the single first-party owner of the event table and emitter.
- `public/scripts/request-context.js` is the single first-party owner of the CSRF token and request-header builder.
- `public/scripts/public-api.js` has no installation side effect until called by the root.
- World Info shell context registration is lazy where initialization order requires it and fails closed when absent.
- `APP_READY` follows core initialization and shell mounting; deferred secondary work runs after it.
- CSRF failure propagates to the bootstrap owner instead of being hidden by a fallback token or a second request context.
- The allowlist documents current legacy coupling; it does not authorize new reverse dependencies.

## Output Schema

```json
{
  "publicApi": {
    "installed": true,
    "keys": ["libs", "getContext"]
  },
  "requestContext": {
    "csrfLoaded": true,
    "headers": ["Content-Type", "X-CSRF-Token"]
  },
  "bootstrap": {
    "events": ["APP_INITIALIZED", "APP_READY"],
    "deferredWorkQueuedAfterReady": true
  },
  "reverseImportContract": {
    "entries": 70,
    "newEntries": 0,
    "forbiddenExtractedNameImporters": []
  }
}
```

## Sandbox Verification

Run:

```bash
uv run python .docs/logic-description/workspace_composition_root_sandbox_proof.py
```

The proof uses fake module records, a fake request context, an explicit public API installer, and a small bootstrap model. It verifies approved direct ownership, detection of forbidden reverse imports, successful event order, explicit API installation, and CSRF failure propagation.

## Boundaries And Failure Modes

- The current 70-entry allowlist means the browser still has legacy reverse dependencies. A clean static gate is not proof of zero reverse imports or an assembly-only root.
- A new first-party reverse import fails the exact snapshot gate even if the imported name is not one of the extracted contracts.
- Importing an extracted name from `script.js` fails the forbidden-name gate.
- A missing CSRF token blocks bootstrap before the normal initialization loader is created; the user receives a persistent error and must refresh or otherwise recover outside this flow.
- A deferred background, extension, or panel warmup failure occurs after `APP_READY` and must not undo core shell readiness; its local owner reports the failure.
- A missing World Info context fails closed rather than silently re-importing `script.js`.
