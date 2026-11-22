---
description: "Workspace entry wiring, extracted domain owners, React popup runtime, and retained browser compatibility boundaries."
kind: technical
topic: workspace-composition-root
---

# Workspace Composition Root

## Module Responsibility

`app/client.tsx` creates the single React root used by `/`, `/login`, `/setup`, and `/settings`. The authenticated workspace route commits `WorkspaceHost` and its compatibility DOM, then `app/components/workspace/workspace-entry.ts` prepares the same app's panel module and loads the native controller. `app/compat/workspace-portals.tsx` renders workspace panels and popups under that root and its providers. There is no separate workspace document or panel build.

`public/script.js` is the native controller's composition root and compatibility entry, not a second UI. It installs browser contracts, preserves first-party exports, and invokes the workspace bootstrap. It still owns shell state, DOM handlers, and generation integration adapters.

The frontend migration gap slice moves the following responsibilities to their domain owners. The roots keep explicit wiring and stable exports; no domain imports either root to use these extracted capabilities.

| Responsibility | Runtime owner | Entry wiring |
| --- | --- | --- |
| User message construction, attachments, guarded insertion and save/events | `public/scripts/user-message-service.js` | `sendMessageAsUser()` delegates through a narrow message port |
| Runtime settings payload, conflict/retry and strict save behavior | `public/scripts/runtime-settings-persistence.js`, using the existing settings write owner | `saveSettings()` and payload exports delegate; existing debounce and revision state are retained |
| World Info search, sort, global activation and scan-depth commands | `public/scripts/world-info-workbench-service.js` | `public/scripts/world-info.js` forwards these commands |
| Character Authoring and text replacement | `app/components/authoring/AuthoringWorkspacePanel.tsx`, `CharacterAuthoringTextReplaceDialog.tsx` | `app/workspace-panels.tsx` mounts the domain components |
| Main-chat rows, scroll lock, message selection and shortcuts | `app/components/main-chat/MainChatMessageListWorkspacePanel.tsx`, `useMainChatHotkeys.ts` | React projects the existing chat model, even if the model is updated before the list mounts; the mount marker is observational |
| Panel shell layout | `app/components/panels/WorkspacePanelShell.tsx` | Workspace entry supplies each panel's content |
| Popup lifecycle and cropping | `app/components/local-dialogs/PopupRuntime.tsx` | Cached workspace bundle exports `createPopupRuntime`; bootstrap installs it into the thin JS `Popup` bridge |
| Generation callers and session coordination | `app/lib/generation/caller.ts`, `app/lib/generation/service.ts` and shared state in `app/lib/generation/shared-state.ts` | The bridge emits the existing public modules; one caller instance and the existing executor retain the stable `Generate`, quiet/raw, regenerate and synchronous stop contracts |
| Workspace generation request, subscription and preparation state | `app/lib/generation/workspace.ts` | The Vite workspace runtime entry exports the owner; typed ports coordinate target snapshots, send and preview preparation while the root supplies live shell state, file/DOM adapters, subscription and UI effects |
| Reasoning message access and formatting | `public/scripts/reasoning.js`, existing `message-service.js` and `message-shell-context.js` | Reasoning reads current chat/API/substitution/save capabilities lazily through the existing message context; formatter and message updater are imported from their domain owner, not the root |
| Legacy message-action motion, dialogue masks and chat scrolling | `public/scripts/chat-ui-motion.js`, used by existing controllers | Native opacity animations and scrolling replace the FE3 jQuery/transit calls without taking ownership of React message rows |
| Character selection and duplication | `public/scripts/character-lifecycle-service.js` | `/script.js` retains thin compatibility delegates and wires the existing live shell state and specific commands |
| Character lorebook association dialog | `app/components/character-world-info/CharacterWorldInfoEditor.tsx`, coordinated by `character-lifecycle-service.js` | Cached workspace bundle mounts native React search/select/checkbox controls inside the existing Popup runtime |
| Character tags and bulk operations | `public/scripts/tags.js`, `character-tags-service.js`, `BulkEditOverlay.js`, `bulk-edit.js` | Specific live ports in `character-tags-shell-context.js` and the existing lifecycle context replace their root imports; no additional state store |
| Provider, prompt management and preset context | `public/scripts/openai.js`, `public/scripts/PromptManager.js`, `public/scripts/preset-manager.js` | OpenAI owns the live provider settings; generation shared state owns runtime prompt entries, separate from Prompt Manager presets |
| External World Info activations | `public/scripts/world-info-service.js` (`WorldInfoBuffer`) | Generation snapshots activation entries and consumes them after success only if their identities are unchanged |


These extractions do not claim that all historical `script.js` domain code has been removed. Existing character, generation integration and compatibility responsibilities remain visible in that entry; this slice does not move the whole file into a replacement facade. Message formatting already belongs to `message-service.js`; the root keeps its compatibility re-export rather than another implementation.

The first extracted contract modules are:

- `public/scripts/events.js` - owns `event_types` and the `eventSource` emitter.
- `public/scripts/request-context.js` - owns CSRF token loading and `getRequestHeaders()`.
- `public/scripts/public-api.js` - explicitly installs `globalThis.SillyTavern`.
- `public/scripts/world-info-shell-context.js` - owns the fail-closed internal context registry used by the World Info compatibility facade.

## Architecture And Constraints

- Each mutable state has one owner. The composition root may wire owners together, but it must not introduce a second store, universal service locator, or broad shell context.
- First-party modules under `public/scripts/`, excluding vendored `extensions/third-party/`, must not add reverse imports of `public/script.js`.
- The exact first-party reverse-import snapshot records the remaining legacy compatibility surface, not a target architecture; future waves may only remove entries or narrow their imported names. FE1 removes the tags and two bulk-operation entries; provider, prompt manager, preset manager and FE3 reasoning no longer import the root at runtime. No additional snapshot or gate is introduced.
- `eventSource` and `event_types` are imported directly from `public/scripts/events.js`. `getRequestHeaders()` is imported directly from `public/scripts/request-context.js`.
- A first-party module must not import `eventSource`, `event_types`, or `getRequestHeaders` from `public/script.js`.
- The public `/script.js` path remains an internal first-party compatibility boundary. There is no third-party extension runtime; this boundary does not permit new first-party reverse dependencies.
- When an owner moves out of `script.js`, the old implementation is deleted in the same wave. A compatibility re-export or thin adapter is allowed only when the public path remains part of the approved contract.
- Rollback is a previous application version or a reverted change. The current version must not retain a second runtime owner as an in-process fallback.

## Core Implementation

### Module evaluation and contract installation

During `public/script.js` evaluation:

1. The root imports `eventSource` / `event_types`, request-context helpers, and the browser library.
2. `installPublicBrowserApi({ getContext })` explicitly assigns the first-party compatibility object `globalThis.SillyTavern`.
3. `registerWorldInfoShellContext(...)` registers callable shell capabilities and a lazy `extensionPromptRoles` accessor. It does not cause `world-info.js` to import the root.
4. `app/components/workspace/workspace-entry.ts` loads the original browser module URLs for the event emitter, i18n and `/script.js` in that order. It passes the native i18n exports and a narrow live frontend-frame port to their React adapters before mounting the composer and initial panels. React does not read `SillyTavern.getContext()` for these capabilities. The entry calls `startWorkspaceRuntime(revealWorkspace)`, which awaits the remaining native bindings and bootstrap via `bindLegacyShellHandlers()`. It does not wait for `window.load`.

The native graph keeps its original URLs. It imports TypeScript owners from three ES-module entries in the same Vite app build, served under `/react/login/workspace/`: `runtime.js` for shared generation state, callers, workspace generation, settings writes and drawers; `generation-service.js` for the generation service; and `generation-attempt.js` loaded only when the lifecycle is needed. The service imports native dependencies by their original `/scripts/` URLs, sharing the registries and event state used by the shell. In development, Vite serves those same three entry URLs from source before the backend proxy. No prebuild writes source files into `public/`.

The same-entry browser target has native `structuredClone`; the classic `public/lib/polyfill.js` is retained because the target includes Firefox 114, which does not provide `Array.prototype.toSorted`.

### Bootstrap order

`bootstrapWorkspace()` currently performs the following ordered stages:

1. Fetch the CSRF token. A failure shows a persistent error and rejects initialization before the main bootstrap stages continue.
2. Load the cached workspace bundle and install its React popup factory so synchronous dialog references are available to existing callers. React renders local startup placeholders independently of popup creation.
3. Install the Provider and preset live contexts and synchronous Prompt Manager domain; register DOM/browser compatibility helpers, Markdown/DOMPurify patches, and browser fixes.
4. Initialize secrets, locale, core chat and OpenAI modules, presets, and system messages.
5. Load settings and apply post-settings UI bindings.
6. Load user avatars and characters, then initialize tokenizers.
7. Hydrate feature modules, including macro autocomplete, World Info, chat observers, and workspace helpers.
8. Run scraper and late feature initialization.
9. Emit `event_types.APP_INITIALIZED`.
10. Fix the viewport and mount the React workspace shell chrome. The runtime wrapper commits the interactive workspace via `revealWorkspace`, then emits `event_types.APP_READY`.
11. Start deferred version, built-in feature, and panel warmup work after readiness.

`APP_READY` therefore follows core initialization, viewport preparation, React shell mounting and removal of the startup interaction block. Deferred work is not allowed to delay the readiness event or make a secondary panel failure block the already initialized shell.

### Extracted request and public API contracts

`request-context.js` preserves the existing request shape: JSON requests receive `Content-Type: application/json` and the current `X-CSRF-Token`; callers may omit the content type for requests such as `pingServer()`. `loadCsrfToken()` rejects its caller on fetch or response failure, so the bootstrap owner decides how initialization fails.

The composition root uses native DOM operations for background fitting,
standalone-mode class, connection hint and dialogue hiding. The workspace no
longer loads jQuery, jQuery UI or transit, and there is no Ajax CSRF prefilter;
request callers use `getRequestHeaders()`. `app/workspace-panels.tsx` retains
`flushSync` where consumers require synchronous React wiring. Focused coverage
includes `tests/script-js-composition-root.test.js`, compatibility tests and
the isolated browser scenarios in `tests/thirteenth-frontend.e2e.js`.

`public-api.js` has no module-evaluation side effect. The root calls `installPublicBrowserApi()` explicitly, which keeps public-global installation testable and prevents an imported helper from unexpectedly mutating the browser global.

### Tokenizers and notifications

`public/scripts/tokenizers.js` owns tokenizer requests and caching. Its
`getTokenCount`, `countTokensOpenAI`, `getTextTokens` and `decodeTextTokens`
return Promises; callers, including consumers of the `st-context.js` API,
must await them. Requests use asynchronous fetch and current request-context
headers. OpenAI counting captures the model for the request and cache key;
failed counts keep their existing fallback and are not cached as successful
OpenAI results. `tests/tokenizers-async.test.js` covers these contracts.

`public/scripts/notifications.js` is the single stateful notification owner.
First-party modules import it, and `globalThis.emberDeskNotifications` points
to the same instance for the React bridge. Notification methods return native elements, and `getContainer`
returns a native container when present or created. HTML strings are sanitized with DOMPurify; DOM nodes are trusted and
moved intact, including their existing listeners. This
does not establish a third-party extension runtime.
`tests/notifications.test.js` covers the notification API and lifecycle;
`tests/notifications-integration.e2e.js` covers the browser singleton,
modal, action loader and lifecycle integration.

### React popup ownership and retained resources

`public/scripts/popup.js` retains the public constructor, synchronous `dlg`/content/button references, result helpers and utilities. It forwards construction and lifecycle to the installed React factory and fails explicitly if that factory is missing. React creates the native dialog and owns open/close/cancel, focus restoration, asynchronous confirmation, custom controls and Cropper effects. HTML and DOM content are opaque consumer subtrees; their callers may still mount an existing editor or dropdown inside the React-owned dialog. There is no legacy dialog-controller fallback or hidden popup template.

`flushSync` at construction is intentional: ActionLoader, World Cascade and chat consumers read or modify references before `show()`. Popup preparation occurs after CSRF success without moving settings, locale or application-ready events. The cropper's ready state controls React button props, so changing the native disabled attribute cannot leave React suppressing a click.

| Resource | Disposition and consumer evidence |
| --- | --- |
| jQuery cookie and pagination | Removed: no first-party calls remained |
| dialog-polyfill and jquery-cropper wrapper | Removed: React uses native dialog and loads the native Cropper script and stylesheet when the crop dialog is requested |
| touch-punch | Removed: no jQuery UI mouse-widget consumers remain; workspace dragging uses its existing separate implementation |
| izoomify | Removed with its unused data attributes: no initialization call remained |
| jQuery, transit and jQuery UI | Removed from the workspace shell and vendored assets; first-party callers use native DOM and browser APIs. Frontend-frame compatibility is described in [First-Party Internal Compatibility Contracts](third-party-extension-compatibility.md). |
| Select2 | Removed with its placeholder plugin, styles, types and unused helpers. Character World Info and the global selector use React; browser checks cover selection, synchronization, dialogs and menus. Dynamic paths cannot be exhaustively established by static search alone. |
| Cropper | Retained as the native image-crop implementation used by the React popup |

Character selection and duplication keep their established busy checks, confirmation, request, event and refresh order in the lifecycle service. The React Library owns selection in its rendered list; favorite-character hotswap invokes the same selection operation directly. Authoring calls the avatar crop command and uses its returned preview; the native form input remains for serialization. Tags use live getters and existing domain operations rather than copying character, tag or bulk-selection state into the root or a new store.

Character lorebook controls use book names as values, including numeric names, rather than list indexes. Primary changes keep the established immediate character save and embedded-book clearing semantics; auxiliaries remain local `world_info.charLore` associations saved through the existing settings debounce. Create-mode associations remain on the create draft. Each dialog captures the character avatar/file name or create session identity, rejects stale actions and checks identity again after awaits. Replacing a cached card object during a refresh is allowed when the selected character and editing session still match. An already submitted edit still refreshes its own card, but its late completion cannot change another selected chat, authoring session or World Info button. The root's post-dialog draft sync also refuses a different authoring session.

Focused proof covers actual user-message/settings services and their root delegates, World Info command forwarding, composer identity, Regex persistence failures and popup API forwarding. `tests/frontend-migration-gaps.e2e.js` exercises the real bundle, same-name character drafts through rename, chat shortcuts, nested asynchronous popups, crop controls and the React character lorebook dialog. `tests/fe1-character-worldinfo-tags.e2e.js` covers named primary/auxiliary association, search, clearing, narrow screens and stale edit/create sessions; existing selection-race and tag suites cover the other FE1 workflows. `tests/local-dialogs.e2e.js` verifies the existing local-dialog owner alongside the compatibility bridge. Browser lanes use isolated data roots and do not reuse a user's server.

### FE3 caller and interaction boundaries

The root constructs the caller service once with explicit live ports. Temporary response length, generation admission, regenerate-in-flight state and pending restore belong to that instance. Greeting selection remains with the character-selection flow and is read only as a guard. Raw prompt construction moves with the caller; it does not call back into a root implementation. The service reuses the existing envelope, quiet lifecycle, raw request transport and installed typed executor. It introduces no second transport, universal context, registration bus or state store.

Native opacity work is owned per element: newer work cancels stale completion; the message-action controller also checks its epoch, containment and current React ownership. Settlement releases the controller's strong references even when a detached or newly React-owned element must skip visual completion; version checks keep an older settlement from releasing newer work. Cleanup cancels pending work and restores hints. Reduced motion, zero-duration and browsers without animation support finish synchronously. The dialogue controller retains its existing generation guard, with final hiding scheduled from native completion rather than a separate fixed timer. Native scrolling targets the existing chat container and geometry. No unrelated styles or global libraries are removed merely because this slice no longer calls them.

Legacy reasoning mounts a DOMPurify-sanitized DOM fragment with `replaceChildren`, matching the React rich-body boundary rather than assigning formatted strings to `innerHTML`. The existing formatter remains responsible for message CSS/resource policy; the final fragment pass preserves its scoped style elements and link targets, removes executable markup, and adds `noopener` to new-window links. React-owned chat rows still bypass the legacy renderer.

`tests/generation-caller-root.test.js` checks production live ports and compatibility wrappers; caller/lifecycle tests cover shared session behavior. `tests/fe3-chat-interactions.e2e.js` covers a real DOM legacy-menu fixture, real dialogue controls, chat scrolling and React reasoning/formatting identity. Existing bootstrap, regenerate and frontend-frame browser specs cover the affected startup, recovery and message-safety paths. These are ownership/implementation changes, not new product capabilities; FE3 therefore updates technical ownership documentation without changing `.docs/db` product semantics.

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
