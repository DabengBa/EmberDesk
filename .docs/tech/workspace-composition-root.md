# Workspace Composition Root

## Module Responsibility

`public/script.js` is the browser workspace's composition root and public compatibility entry. It currently assembles the legacy workspace, installs extracted browser contracts, preserves approved `/script.js` exports, and invokes the workspace bootstrap. It is not yet an assembly-only file: domain state, DOM handlers, chat/generation behavior, and React bridge coordination remain in the file until separately verified extraction waves move their owners.

The first extracted contract modules are:

- `public/scripts/events.js` - owns `event_types` and the `eventSource` emitter.
- `public/scripts/request-context.js` - owns the CSRF token, `getRequestHeaders()`, and the jQuery Ajax prefilter.
- `public/scripts/public-api.js` - explicitly installs `globalThis.SillyTavern`.
- `public/scripts/world-info-shell-context.js` - owns the fail-closed internal context registry used by the World Info compatibility facade.

## Architecture And Constraints

- Each mutable state has one owner. The composition root may wire owners together, but it must not introduce a second store, universal service locator, or broad shell context.
- First-party modules under `public/scripts/`, excluding vendored `extensions/third-party/`, must not add reverse imports of `public/script.js`.
- The current static snapshot contains 70 exact first-party reverse-import entries. This is a frozen legacy compatibility snapshot, not a target architecture; future waves may only remove entries or narrow their imported names.
- `eventSource` and `event_types` are imported directly from `public/scripts/events.js`. `getRequestHeaders()` is imported directly from `public/scripts/request-context.js`.
- A first-party module must not import `eventSource`, `event_types`, or `getRequestHeaders` from `public/script.js`.
- Third-party extensions may continue to use the public `/script.js` path until an equivalent replacement contract is proven. This exception does not permit new first-party reverse dependencies.
- When an owner moves out of `script.js`, the old implementation is deleted in the same wave. A compatibility re-export or thin adapter is allowed only when the public path remains part of the approved contract.
- Rollback is a previous application version or a reverted change. The current version must not retain a second runtime owner as an in-process fallback.

## Core Implementation

### Module evaluation and contract installation

During `public/script.js` evaluation:

1. The root imports `eventSource` / `event_types`, request-context helpers, and the browser library.
2. `installPublicBrowserApi({ libs, getContext })` explicitly assigns the supported `globalThis.SillyTavern` object.
3. `registerWorldInfoShellContext(...)` registers callable shell capabilities and a lazy `extensionPromptRoles` accessor. It does not cause `world-info.js` to import the root.
4. `installAjaxCsrfPrefilter()` registers the jQuery request hook. The request-context module keeps the token private to that module and exposes headers through `getRequestHeaders()`.
5. The jQuery-ready callback invokes `bootstrapWorkspace()` once the browser shell and its imported modules are available.

### Bootstrap order

`bootstrapWorkspace()` currently performs the following ordered stages:

1. Fetch the CSRF token. A failure shows a persistent error and rejects initialization before the main bootstrap stages continue.
2. Create the splash overlay and initialization loader.
3. Register DOM/browser compatibility helpers, library shims, Markdown/DOMPurify patches, and browser fixes.
4. Initialize secrets, locale, core chat/slash/OpenAI/system-prompt modules, extensions, extension slash commands, presets, and system messages.
5. Load settings and apply post-settings UI bindings.
6. Load user avatars and characters, then initialize tokenizers.
7. Hydrate feature modules, including backgrounds, personas, slash autocomplete, World Info, chat observers, and workspace helpers.
8. Run scraper and late feature initialization.
9. Emit `event_types.APP_INITIALIZED`.
10. Hide the initialization loader, fix the viewport, mount the React workspace shell chrome, and emit `event_types.APP_READY`.
11. Queue deferred version, background, extension, and panel warmup work after readiness.

`APP_READY` therefore follows core initialization, loader removal, viewport preparation, and React shell mounting. Deferred work is not allowed to delay the readiness event or make a secondary panel failure block the already initialized shell.

### Extracted request and public API contracts

`request-context.js` preserves the existing request shape: JSON requests receive `Content-Type: application/json` and the current `X-CSRF-Token`; callers may omit the content type for requests such as `pingServer()`. `loadCsrfToken()` rejects its caller on fetch or response failure, so the bootstrap owner decides how initialization fails.

`public-api.js` has no module-evaluation side effect. The root calls `installPublicBrowserApi()` explicitly, which keeps public-global installation testable and prevents an imported helper from unexpectedly mutating the browser global.

## Static Contract And Proof

The exact reverse-import snapshot and parser live in `tests/helpers/script-js-reverse-import-contract.js`. `tests/script-js-composition-root.test.js` verifies:

- the current first-party reverse-import snapshot has not grown;
- side-effect, namespace, re-export, query-string, and dynamic reverse imports are detected;
- extracted event and request names do not reverse-import from `script.js`;
- request-context CSRF behavior and error propagation;
- explicit public API installation;
- `bootstrapWorkspace()` remains the startup entry and the obsolete `firstLoadInit` name is absent.

The contract does not prove that `script.js` is already thin. It proves only that the current extraction boundary is explicit and that future reverse dependencies cannot grow silently.

## Related Semantic IDs And Code Binding Points

Related semantic IDs:

- `page.chat_workspace`
- `feature.startup_bootstrap`
- `term.shared_browser_library`

Primary code binding points:

- `public/script.js`: root imports, public API installation, World Info context registration, CSRF prefilter installation, `bootstrapWorkspace()`, and approved re-exports.
- `public/scripts/events.js`: event table and emitter owner.
- `public/scripts/request-context.js`: request headers, CSRF loading, and Ajax prefilter.
- `public/scripts/public-api.js`: explicit public-global installer.
- `public/scripts/world-info-shell-context.js`: internal fail-closed context registry.
- `tests/helpers/script-js-reverse-import-contract.js`: exact legacy reverse-import snapshot.
- `tests/script-js-composition-root.test.js`: focused runtime and static gate.

Related documents:

- [ADR-0014](../adr/0014-workspace-composition-root.md)
- [Third-Party Extension Compatibility](third-party-extension-compatibility.md)
- [World Info Shell Context](world-info-shell-context.md)
- [Startup APP_READY Optimization](startup-app-ready-optimization.md)
- [Workspace Composition Root Processing Flow](../logic-description/workspace_composition_root_processing_flow.md)

## Validation

Focused composition-root and extension compatibility proof:

```bash
pnpm run test:compat
```

Standalone current-behavior proof:

```bash
uv run python .docs/logic-description/workspace_composition_root_sandbox_proof.py
```

Syntax and documentation proof:

```bash
node --check public/script.js
find public/scripts -type f -name '*.js' -print0 | xargs -0 -n1 node --check
pnpm run docs:check
pnpm run docs:build
```

Root validation runs ESLint for JavaScript and the TypeScript 7 compiler for
TS/TSX, including unused-local diagnostics. The former `typescript-eslint`
parser cannot run against TypeScript 7 because TS7 no longer exposes its
required Compiler API. Legacy JavaScript formatting and unused-code debt remain
separate from focused composition-root contract proof and typecheck.
