---
description: "public/scripts/world-info-shell-context.js owns the narrow runtime context that lets public/scripts/world-info.js remain the World Info compatibility facade without importing ../script.js directly. It is one of the composition-root..."
kind: technical
topic: world-info-shell-context
---

# World Info Shell Context

## Module Responsibility

`public/scripts/world-info-shell-context.js` owns the narrow runtime context that lets `public/scripts/world-info.js` remain the World Info compatibility facade without importing `../script.js` directly. It is one of the composition-root seams registered by `public/script.js`, alongside the extracted event and request-context modules.

The module is internal to the browser workspace. It is not a public extension API and it does not replace the user-facing World Info behavior documented in [World Info Panel](../db/features/world-info-panel.md).

## Architecture And Constraints

- `public/script.js` registers the shell context during browser module startup with `registerWorldInfoShellContext(...)`.
- `public/scripts/events.js` owns the emitter/table supplied through the registered context.
- `public/scripts/request-context.js` owns `getRequestHeaders()` supplied through the registered context.
- `public/scripts/world-info-shell-adapter.js` provides lazy bindings for shell-owned state, events, settings, character helpers, and metadata. The facade composes those capabilities with the World Info services.
- Registration must avoid eager reads of shell constants that are declared later in `public/script.js`. Values that can be affected by module initialization order use callable accessors, such as `get extensionPromptRoles() { return extension_prompt_roles; }`.
- The context fails closed when missing. World Info code should receive `World Info shell context is not registered.` instead of silently falling back to stale globals.
- The context must preserve the existing `eventSource` contract. Function-valued properties read through the World Info proxy are bound back to the underlying emitter so calls such as `eventSource.on(...)` and `eventSource.emit(...)` keep the emitter `this`.

## Core Implementation

Current binding points:

- `public/scripts/world-info-shell-context.js` stores, requires, clears, and reads event-source properties from the registered shell context.
- `public/script.js` registers settings, request-header, chat metadata, character, event, extension-prompt-role, save, and selection capabilities for World Info.
- `public/scripts/world-info.js` keeps the compatibility barrel, service composition, and thin shell bridges. It has no second selected-entry state or legacy entry renderer/form controller.
- `public/scripts/world-info-shell-adapter.js` owns live shell proxies; `public/scripts/world-info-runtime.js` registers chat and force-activation listeners and invokes slash registration once.
- `tests/world-info-shell-context.test.js` proves the fail-closed missing-context rule, the direct-import removal from `world-info.js`, lazy `extensionPromptRoles` registration, and event-source method binding.

The context deliberately does not own editor state, imports, scanning, or storage semantics.

### Ownership and data flow

- `world-info-editor-composition.js` creates one lazy `world-info-workbench-service.js` session. That session owns book/entry selection, search, sort, and workbench commands. React owns the visible DOM and local unsaved field drafts; hidden selector elements are compatibility mirrors, not a second entry editor.
- React sends the source book name with each field update. Session revisions reject stale selection/snapshot work; an old entry callback cannot write a same-UID entry in the newly selected book. The shell mount scheduler prevents an older snapshot from mounting after a newer one.
- `world-info-repository.js` is shared by the editor and scanner. Its per-book queue covers the complete read/modify/write operation for field and bulk commands. Only a successful HTTP save updates the shared cache and emits `WORLDINFO_UPDATED`; a rejected save preserves the confirmed scan input and lets React retain its draft for retry. The compatibility whole-book save still has whole-document replacement semantics. Queues are browser-local, not cross-client transactions.
- `world-info-import-command.js` owns parsing/conversion, upload outcomes, and sequential batch execution; `world-info-import-ui.js` owns conflict dialogs, progress, and result feedback. Existing converters and batch result helpers are reused.
- `world-info-book-commands.js` and `world-info-entry-commands.js` own book/reference mutations and entry defaults/commands. Book, editor, panel, and reference UI modules adapt existing dialogs and shell controls; `world-info-book-sync.js` refreshes book lists and compatibility selectors. Cross-book moves retain target-first/source-second ordering, not an invented multi-book transaction.
- `world-info-slash-adapter.js` retains existing command registration and synchronous compatibility surfaces without bringing entry DOM controllers back.
- `world-info-service.js` owns scan buffers, ordering, matching, and activation. It reads through the repository and does not depend on the facade or workbench. Scan rules, regex placement, awaited scan/activation events, and lossless retired fields are unchanged. `world-info-keywords.js` exposes the existing regex-aware tokenizer to both the domain and React editor without importing shell or i18n into the React bundle.

Canonical server storage and HTTP payloads are unchanged. The refactor does not introduce a second state store, runtime UI fallback, or a new TypeScript loader for public browser modules.

## Related Semantic IDs And Code Binding Points

Semantic IDs:

- `feature.startup_bootstrap`
- `feature.world_info_panel`
- `feature.character_library_panel`
- `page.chat_workspace`

Code binding points:

- `public/script.js`
- `public/scripts/events.js`
- `public/scripts/request-context.js`
- `public/scripts/world-info-shell-context.js`
- `public/scripts/world-info.js`
- `public/lib/eventemitter.js`
- `tests/world-info-shell-context.test.js`

Related docs:

- [Workspace Shell Panel Dock Coordination](workspace-shell-panel-dock-coordination.md)
- [Third-Party Extension Compatibility](third-party-extension-compatibility.md)
- [Workspace Composition Root](workspace-composition-root.md)
- [Workspace Composition Root Processing Flow](../logic-description/workspace_composition_root_processing_flow.md)
- [World Info Shell Context Processing Flow](../logic-description/world_info_shell_context_processing_flow.md)

## Validation

Focused proof:

```bash
pnpm --dir tests run test:unit -- world-info-shell-context.test.js --runInBand
pnpm --dir tests run test:unit -- world-info-session-races.test.js world-info-repository.test.js world-info-import-command.test.js world-info-scan-service.test.js --runInBand
pnpm run test:compat
pnpm --dir tests run test:e2e world-info-workbench.e2e.js
```

Browser proof for startup and drawer interaction should verify that the workspace leaves global `Initializing...`, then that opening World Info while Character Management is locked leaves both panels visible.

The workbench browser suite additionally covers same-UID cross-book stale edits through the real command bridge, batch import, comma-containing regex keywords, bulk saves after reload, and rejected saves with retained-draft retry. Source ownership assertions are supporting evidence, not substitutes for these browser checks.
