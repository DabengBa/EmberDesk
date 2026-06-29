# Third-Party Extension Compatibility

This document records the compatibility boundary that protects EmberDesk's current regex feature and the bundled Tavern Helper extension during frontend modernization.

Terminology: in this document, **Tavern Helper** / **酒馆助手** specifically means the upstream [N0VI028/JS-Slash-Runner](https://github.com/N0VI028/JS-Slash-Runner) extension and EmberDesk's bundled local copy of that extension. It is not a generic label for all SillyTavern-style helper plugins.

## Scope

The boundary covers:

- the built-in regex extension under `public/scripts/extensions/regex/`
- the extension panel mount points in `public/index.html`
- the extension wand menu templates under `public/scripts/templates/`
- the bundled local copy of `N0VI028/JS-Slash-Runner` under `public/scripts/extensions/third-party/JS-Slash-Runner/`
- the `@sillytavern/*` browser import aliases used by Tavern Helper
- the event and data shapes that Tavern Helper reads from SillyTavern modules
- the character list DOM identity contract that frontend slices must preserve for first-party modules and extension-adjacent scripts

This is a compatibility contract, not a request to refactor the extension or regex engine.

## Phase 4 Bridge Migration Guide

Phase 4 adds internal React/Zustand observation through `app/stores/*` and `app/compat/global-compatibility-bridge.js`. This bridge is an EmberDesk runtime adapter, not a new third-party extension API. Phase 7 closes the current roadmap with an explicit final policy instead of leaving these surfaces in a pending state: `globalThis.SillyTavern` and `@sillytavern/*` remain documented frozen compatibility facades, `eventSource` / `event_types` remain long-term supported public runtime contracts, `/lib.js` remains the preferred long-term shared browser utility surface for new ES-module extensions, and `__emberDeskReactCompatibilityBridge` remains internal-only.

| Surface | Current status | Future access path | Fallback / rollback |
|---|---|---|---|
| `globalThis.SillyTavern` | Frozen public compatibility facade | Keep the current object for upstream-style helpers and extension-adjacent context lookups; it is no longer a pending deletion candidate in the current roadmap. | Keep the existing object owner; React bridge failure must not replace it with a stub. |
| `eventSource` / `event_types` | Long-term supported public compatibility surface | Keep the current emitter methods, event names, and established runtime semantics as the supported contract for plugin/event consumers. | Keep event names and emitter methods stable; failed React bridge attach leaves existing exports untouched. |
| `@sillytavern/*` browser aliases | Frozen documented compatibility facade | Keep current alias resolution and protected export shapes for existing extension ecosystems such as Tavern Helper / JS-Slash-Runner; new ES-module utility imports should prefer `/lib.js` when possible. | Preserve alias resolution and export shapes; rollback is the existing browser module mapping. |
| Extension mount points (`#extensions_settings`, `#extensions_settings2`, `#regex_container`, wand menu) | Frozen public compatibility surface | React may own visible host controls and orchestration, but protected legacy nodes stay mount contract surfaces instead of a future removal candidate in this roadmap. | React may own the visible host controls, but protected legacy nodes remain frozen compatibility surfaces and rollback owners. |
| Regex engine exports and `regex_placement` values | Long-term supported public compatibility surface | Keep the current module owner and numeric placement values; any future behavior or export narrowing needs a fresh ADR plus focused compatibility proof. | Do not rename exports or change numeric placement values; rollback is the current regex module owner. |
| Slash parser / registry / executor exports | Frozen public compatibility surface | Keep `public/scripts/slash-commands.js` as the owner for parser, registry, executor, and public exports; React slash UI remains observational/visible UI only. | Keep `public/scripts/slash-commands.js` as owner; React failures fall back to legacy autocomplete and command execution. |
| Phase 4 React/Zustand bridge snapshots | Internal-only first-party adapter | First-party React islands may observe sanitized workspace/main-chat state through the bridge while public globals and aliases stay external contracts. | Bridge detach removes only `__emberDeskReactCompatibilityBridge`; no third-party extension should depend on it. |
| Full extension API retirement or facade freeze | Closed for the current roadmap | The current Phase 7 outcome is freeze-or-support, not deletion; any future retirement proposal requires a new ADR, migration note, and rollback proof. | Keep the current compatibility surface and tests. |

Phase 6 evidence collection must cover Tavern Helper / JS-Slash-Runner, Regex Manager behavior, Quick Reply-style event usage, Extensions Manager install/update/delete flows, alias resolution, event contracts, and protected mount-point lifecycle. Any migration candidate needs a rollback story that returns to the current legacy owner without data loss or extension API shrinkage.

## Phase 6 Priority Rule

Phase 6 uses `JS-Slash-Runner` as the primary compatibility gate.

- Any change that would break `JS-Slash-Runner` import resolution, mount lifecycle, event usage, slash-command integration, regex integration, or required public globals is a high-priority compatibility risk.
- Secondary extension evidence such as Quick Reply-style flows, Regex Manager-specific UI behavior, or Extensions Manager protocol checks only enters the same delivery wave when it covers a risk that `JS-Slash-Runner` does not already cover.
- A Phase 7 breaking candidate that would break `JS-Slash-Runner` without a replacement path, migration note, and rollback path is not eligible for delete-or-narrow decisions. The honest result is to freeze or delay that candidate.

## Phase 6 Contract Ledger

Use the following `JS-Slash-Runner criticality` values when reviewing or extending this compatibility boundary:

- `primary`: direct runtime dependency for `JS-Slash-Runner`
- `secondary`: not the main plugin integration path, but still a nearby compatibility risk
- `internal-only`: first-party bridge surface, not supported for third-party extension use

| Surface family | JS-Slash-Runner criticality | Current owner | Fallback / rollback owner | Primary proof | Phase 7 consumer | Current gap |
|---|---|---|---|---|---|---|
| `@sillytavern/*` browser aliases | `primary` | legacy browser module mapping under `public/` | existing alias mapping and source-relative bundle output | `bun run test:compat` | Sprint 4 / Sprint 7 | Static resolution is covered; behavior-specific alias consumers still rely on focused runtime checks. |
| `#extensions_settings`, `#extensions_settings2`, `#regex_container`, `#extensionsMenuButton`, `#extensionsMenu` | `primary` | protected extension drawer and wand menu compatibility nodes, with visible host controls routed through `public/scripts/extensions.js` | protected legacy DOM nodes remain rollback owners when flags are off or bundle import fails | `bun run test:compat` | Sprint 4 | Static presence is covered; visible host controls now use explicit helper facades, but browser/runtime evidence still needs to confirm no protected node disappears in rollback paths. |
| `eventSource` / `event_types` | `primary` | `public/script.js` and `public/scripts/events.js` | existing event emitter object and event-name table | `bun run test:compat` | Sprint 7 | Export/value stability is covered; not every runtime timing path is browser-proven. |
| slash-command public exports from `public/scripts/slash-commands.js` | `primary` | legacy slash parser / registry / executor | legacy autocomplete and command execution path | `bun run test:compat` | Sprint 4 | Public exports are frozen; plugin-specific end-to-end execution remains a manual/runtime evidence concern. |
| regex exports and `regex_placement` values | `primary` | `public/scripts/extensions/regex/engine.js` | legacy regex engine owner | `bun run test:compat` | Sprint 4 | Export/value stability is covered; plugin-specific transformation flows still need runtime evidence notes. |
| `globalThis.SillyTavern` | `secondary` | legacy browser shell | existing legacy global object | `bun run test:compat` | Sprint 7 | Current repo evidence treats it as a compatibility surface, but `JS-Slash-Runner` primarily consumes module imports and extension context helpers instead of this global. |
| message-row DOM contract | `secondary` | legacy main-chat rendering path | protected row structure and fail-closed React owner split | `bun run --cwd tests test:unit -- chat-workspace-structure.test.js third-party-extension-compatibility.test.js --runInBand`; `bun run --cwd tests test:e2e -- chat-message-layout.e2e.js`; `bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js` | Sprint 6 / Sprint 7 | Core row structure is covered; plugin-specific rich DOM mutations remain a later renderer cutover concern. |
| character-list DOM contract | `secondary` | legacy character list shell and guarded React row compatibility | legacy panel path from the same workspace entry | `bun run test:compat`; `bun run --cwd tests test:unit -- character-list-structure.test.js --runInBand` | Sprint 1 / Sprint 7 | Static row identity is covered; not a primary `JS-Slash-Runner` gate. |
| character route payload shape | `secondary` | legacy route payload contract | legacy browser-facing response shapes | `bun run --cwd tests test:unit -- character-read-service.test.js interaction-performance-index.test.js character-list-structure.test.js --runInBand` | Sprint 1 | Internal service envelope leakage is guarded, but not a primary plugin gate. |
| Phase 4 React compatibility bridge snapshots | `internal-only` | `app/compat/global-compatibility-bridge.js` | bridge detach removes only the internal bridge surface | `bun run --cwd tests test:unit -- global-compatibility-bridge.test.js --runInBand` | Sprint 7 | Snapshot safety is covered; the bridge is intentionally unsupported for third-party extension code. |

## Phase 6 JS-Slash-Runner Runtime Evidence

`JS-Slash-Runner` is the only mandatory primary sample for Phase 6 runtime compatibility work. Phase 6 proof is considered incomplete if the repo can only show static export stability but cannot explain how the plugin still mounts, consumes events, and reuses the protected slash/regex surfaces.

External dependency paths in this section were checked on 2026-06-23 against `JS-Slash-Runner` commit `b65f48a4856da9f0947224404d4c08910a8f350f` (`https://gitlab.com/novi028/JS-Slash-Runner/-/tree/b65f48a4856da9f0947224404d4c08910a8f350f`).

### Mandatory primary evidence surfaces

| Surface | Current plugin dependency path | Baseline proof | Remaining runtime evidence note | Phase 7 blocker when broken |
|---|---|---|---|---|
| Mount lifecycle | `src/index.ts` appends `#tavern_helper` to `#extensions_settings` | `bun run test:compat` | Phase 6 must still record that flag-off and bundle-import-failure paths leave the protected mount nodes intact for legacy ownership. | Yes |
| Alias resolution | `src/**` imports `@sillytavern/*` paths resolved into `public/` browser modules | `bun run test:compat` | Static alias presence passes in the 2026-06-23 proof set; Phase 6 still treats alias narrowing or path churn as a hard blocker until a migration path exists. | Yes |
| Event contract | `src/function/generate/*.ts`, `PromptViewer.vue`, `variable_manager/*.vue`, `tavern_regex.ts`, and render helpers consume `eventSource` / `event_types` | `bun run test:compat` | Event values and emitter methods are frozen, but Phase 6 still records that event timing semantics are not exhaustively browser-proven. | Yes |
| Slash-command integration | `src/function/slash.ts` imports `executeSlashCommandsWithOptions`; multiple panels rely on the protected slash surface | `bun run test:compat` | Public export stability is covered; Phase 6 still records that plugin-specific end-to-end slash execution remains a runtime compatibility concern, not a solved cutover path. | Yes |
| Regex integration | `src/function/generate/utils.ts` and `src/function/tavern_regex.ts` consume `getRegexedString` and `regex_placement.*` | `bun run test:compat` | Numeric placement stability is covered; Phase 6 still treats behavior drift in regex application order as a blocker until separately disproven. | Yes |
| Public globals vs. internal bridge | Type declarations and extension-adjacent helpers still assume public legacy globals exist, while React bridge snapshots remain first-party only | `bun run test:compat`; `bun run --cwd tests test:unit -- global-compatibility-bridge.test.js --runInBand` | Phase 6 must keep the rule that a failed bridge attach leaves public globals untouched and does not create a new plugin API. | Yes |

### Secondary evidence surfaces

These are useful only when they cover risk not already captured by the primary sample:

- Quick Reply-style slash or event flows
- Regex Manager-specific UI and workflow checks
- Extensions Manager install/update/delete protocol walkthroughs
- Protected mount-point lifecycle notes for extension hosts that do not directly belong to `JS-Slash-Runner`

If a secondary surface conflicts with the primary sample, the compatibility-preserving choice is the one that keeps `JS-Slash-Runner` working.

### Runtime blocker rules

- Missing or cleared protected mount nodes in flag-off, import-failure, or fallback states are blockers.
- Narrowing `@sillytavern/*`, slash exports, regex exports, event names, or event emitter methods without migration notes is a blocker.
- Treating `__emberDeskReactCompatibilityBridge` as a public replacement API is a blocker.
- Any deletion candidate that breaks `JS-Slash-Runner` and lacks a rollback path is a blocker.

## Protected Mount Points

Keep these DOM surfaces stable unless a migration plan updates both first-party code and third-party compatibility proof:

- `#extensions_settings`
- `#extensions_settings2`
- `#regex_container`
- `#extensionsMenuButton`
- `#extensionsMenu`
- `#chat > .mes`
- `.mes_text`
- `.mes[mesid]`
- `.last_mes`

`#extensionsMenuButton` and `#extensionsMenu` are rendered from `wandButton.html` and `wandMenu.html`, not from static `index.html`.

Tavern Helper currently mounts its Vue panel by appending `#tavern_helper` to `#extensions_settings`.

## Message Row DOM Contract

The main chat message list is a shared surface for first-party message actions, rendering tests, slash-command injected messages, and extension-adjacent scripts.

Keep these message-row selectors and identity attributes stable unless a migration plan updates first-party code and compatibility proof together:

- `#chat > .mes`
- `.mes_text`
- `.mes[mesid]`
- `.last_mes`
- `is_user`
- `is_system`
- `.mes_reasoning_details`
- `.mes_reasoning`
- `.mes_media_wrapper`
- `.mes_file_wrapper`
- `.swipe_left`
- `.swipe_right`

Message-row actions should remain discoverable by role/name when visible, while stored-message rendering remains owned by the message rendering path and its browser proof. Focusable action buttons must keep keyboard reachability, and visible action affordances must not cover `.mes_text` in a way that prevents reading or touch interaction.

Automatic generation recovery may add `.generation_auto_recovery_status` beside a message row, but that status must stay outside `.mes_text`. Recovery status text is a control/status surface, not part of the rendered message body that extensions and first-party actions read.

When `features.react.panels.mainChatMessageList` is enabled, the guarded React bridge may append a hidden `data-main-chat-message-actions-owner="react"` marker inside `.mes_buttons` for rows that already expose the protected action shell. That marker is additive only: it must not wrap, replace, or reorder `.extraMesButtonsHint`, `.extraMesButtons`, copy/edit/delete buttons, swipe controls, reasoning controls, or retry affordances. In particular, `.extraMesButtonsHint` must remain before `.extraMesButtons`, and any hidden action-owner marker must be appended after those protected controls rather than inserted between them.

## Character List DOM Contract

The character library panel is a shared DOM surface for selection, tags, keyboard navigation, bulk edit, and extension-adjacent scripts.

Keep these selectors and identity attributes stable unless a migration plan updates first-party code and compatibility proof together:

- `#rm_characters_block`
- `#rm_print_characters_block`
- `.character_select`
- `.group_select`
- `.bogus_folder_select`
- `.character_select[data-chid]`
- `.character_select[chid]`
- `id="CharID${chid}"`
- `.character_selected`
- `.bulk_select_checkbox`
- `.tags_inline`
- `.ch_fav`

`data-chid` is the standard row identity for new code. The legacy `chid` attribute remains a compatibility affordance because existing selectors still use `.character_select[chid="..."]`. New code should not prefer `chid` over `data-chid`.

The guarded React character-library panel island is inside this same compatibility boundary. When the React island is enabled, it may host the toolbar and virtualized list window, but generated rows must keep the protected selectors above, tag filtering continues to use the legacy tag controls and `entitiesFilter` semantics, and the React toolbar only hosts those controls instead of owning their selected tag state. Build-missing or flag-off states must keep the legacy panel path available from the same workspace entry.

The shared workspace-panel React scaffold for World Info, Background Library, and Extensions Host is not a compatibility exemption. The current World Info, Background Library, and Extensions Host React hosts mount beside legacy nodes, not on top of them. Extensions Host now owns the visible notify/manage/install/Extras UI path through explicit `public/scripts/extensions.js` helpers, but it still does not own or replace the protected extension settings columns, regex container, wand menu, extension content mount surfaces, or third-party extension protocol surfaces. When the matching flag is off, the current wrappers do not insert an empty migration host. If a flagged scaffold bundle fails to import, protected legacy nodes still remain the rollback owner. A React host must mount beside or around protected legacy nodes rather than clearing them as an incidental render target.

## Protected Module Surface

Tavern Helper source imports use the `@sillytavern/*` alias. Its build resolves those imports to browser files below `public/`.

High-risk import surfaces include:

- `@sillytavern/script`
- `@sillytavern/scripts/extensions`
- `@sillytavern/scripts/extensions/regex/engine`
- `@sillytavern/scripts/openai`
- `@sillytavern/scripts/preset-manager`
- `@sillytavern/scripts/world-info`
- `@sillytavern/scripts/slash-commands`
- `@sillytavern/scripts/utils`

Do not rename, move, or narrow these exported browser modules as incidental cleanup during jQuery slice migration.

## Slash Command Public Surface

`public/scripts/slash-commands.js` is a public browser module surface for compatible scripts and helper extensions. The protected exports include:

- `executeSlashCommands`
- `executeSlashCommandsWithOptions`
- `getSlashCommandsHelp`
- `registerSlashCommand`
- `parser`
- `CONNECT_API_MAP`
- `UNIQUE_APIS`
- `initDefaultSlashCommands`
- `COMMENT_NAME_DEFAULT`
- `processChatSlashCommands`
- `generateSystemMessage`
- `validateArrayArgString`
- `validateArrayArg`
- `getNameAndAvatarForMessage`
- `sendMessageAs`
- `sendNarratorMessage`
- `promptQuietForLoudResponse`
- `isExecutingCommandsFromChatInput`
- `commandsFromChatInputAbortController`
- `activateScriptButtons`
- `deactivateScriptButtons`
- `pauseScriptExecution`
- `stopScriptExecution`
- `executeSlashCommandsOnChatInput`
- `setSlashCommandAutoComplete`
- `initSlashCommandAutoComplete`

Do not remove, rename, or narrow these exports as incidental cleanup. Parser, command-registration, and execution semantics require focused compatibility proof before behavior changes.

When `features.react.panels.mainChatMessageList` is enabled, the guarded React main-chat island may observe slash-command state through a hidden `slashCommand` bridge marker. That marker is additive only: it can report active state, query length, autocomplete visibility, executing, paused, aborted, and error label, but it must not copy full command text or arguments, import parser internals, register commands, execute commands, replace the autocomplete DOM, or change the exports listed above. `executeSlashCommandsOnChatInput()`, `commandsFromChatInputAbortController`, `pauseScriptExecution()`, `stopScriptExecution()`, `setSlashCommandAutoComplete()`, and parser/registry semantics remain owned by `public/scripts/slash-commands.js`.

## Regex Data Contract

The current regex feature is stateful across global settings, character cards, and presets:

- global scripts: `extension_settings.regex`
- character scripts: `character.data.extensions.regex_scripts`
- preset scripts: `oai_settings.extensions.regex_scripts`
- character allow-list: `extension_settings.character_allowed_regex`
- preset allow-list: `extension_settings.preset_allowed_regex`

The regex engine exports that third-party code depends on include:

- `getRegexedString`
- `regex_placement.USER_INPUT`
- `regex_placement.AI_OUTPUT`
- `regex_placement.SLASH_COMMAND`
- `regex_placement.WORLD_INFO`
- `regex_placement.REASONING`

Changing the numeric values of `regex_placement` is a breaking change.

## Event Contract

Tavern Helper and compatible scripts depend on `eventSource` and `event_types` from `public/script.js` and `public/scripts/events.js`.

Stable event names include:

- `APP_READY`
- `CHAT_CHANGED`
- `CHAT_COMPLETION_SETTINGS_READY`
- `CHARACTER_DELETED`
- `CHARACTER_MESSAGE_RENDERED`
- `CHARACTER_RENAMED`
- `GENERATE_AFTER_DATA`
- `MESSAGE_RECEIVED`
- `OAI_PRESET_CHANGED_AFTER`
- `PRESET_DELETED`
- `PRESET_RENAMED_BEFORE`
- `SETTINGS_UPDATED`
- `USER_MESSAGE_RENDERED`

`eventSource` must keep `on`, `once`, `emit`, `emitAndWait`, `makeFirst`, `makeLast`, and `removeListener`.

## Phase 6 Global Export And Bridge Evidence

Phase 6 treats `globalThis.SillyTavern`, `eventSource`, and `event_types` as public compatibility surfaces, while the React compatibility bridge remains internal-only.

| Surface | Public or internal | Current `JS-Slash-Runner` consumer path | Failure rule | Proof |
|---|---|---|---|---|
| `globalThis.SillyTavern` | public compatibility surface | Adjacent and type-level compatibility surface; current plugin source primarily uses module imports and extension context helpers instead of this global | Do not replace or stub the existing object when React bridge attach fails | `bun run test:compat` |
| `eventSource` | public compatibility surface | Direct runtime consumer in `src/function/generate/*.ts`, `PromptViewer.vue`, `use_collapse_code_block.ts`, `variable_manager/*.vue`, and `tavern_regex.ts` | Keep emitter methods stable; bridge attach failure must leave the legacy object untouched | `bun run test:compat` |
| `event_types` | public compatibility surface | Direct runtime consumer across the same generate, prompt, render, and variable-manager paths listed above | Keep event names and values stable; React-owned slices cannot silently rename or narrow them | `bun run test:compat` |
| `__emberDeskReactCompatibilityBridge` | internal-only first-party adapter | No supported third-party consumer; Phase 4 uses it only for sanitized React-owned snapshots | Bridge detach removes only the internal bridge surface; it must not mutate or replace public globals | `bun run --cwd tests test:unit -- global-compatibility-bridge.test.js --runInBand` |

The internal bridge is not a migration target for third-party extensions. A Phase 7 cleanup may freeze or remove public globals only after a separate compatibility decision; it may not treat the bridge as an undocumented replacement.

## Character Route Compatibility

Character read internals may use service envelopes such as `result.mode`, `latencyHint`, `interactionPath`, filter context, or pagination context. Those are route-service implementation details, not browser or extension payload contracts.

The public character routes must continue to send legacy-shaped payloads:

- `/api/characters/all` returns an array of character payloads.
- `/api/characters/list` returns an array of shallow character summaries.
- `/api/characters/get` returns the character payload object or a legacy HTTP status such as 404.

Do not expose the internal read-service envelope fields to browser callers without a separate migration design.

## Frontend Migration Rules

Before each frontend jQuery slice, classify whether the slice touches this compatibility boundary.

Safe first targets are page-local surfaces that do not touch:

- regex extension code
- extension loading or extension panel rendering
- character import confirmation for regex or Tavern Helper scripts
- generation request assembly
- message rendering, message streaming, or markdown refresh
- world-info keyword and regex editing
- slash-command registration or parser internals

If a slice must touch one of those areas, add focused regression proof before changing behavior.

## Validation

Run this focused compatibility proof before and after frontend migration work:

```bash
bun run test:compat
```

The direct tests-package command remains equivalent when debugging from `tests/`:

```bash
(cd tests && bun run test:unit -- third-party-extension-compatibility.test.js --runInBand)
```

This test verifies mount points, Tavern Helper manifest and distributable files, `@sillytavern/*` import resolution, key module exports, slash-command public exports, event values, and regex placement values.
It also verifies the generated character-list row identity contract used by character library slices.

Structure tests may share assertions through `tests/helpers/frontend-structure-contract.js`, but the shared helper is a test-only contract boundary. It must not replace runtime compatibility proof for protected extension surfaces.

When message row rendering, message actions, or main chat workspace structure changes, also run the focused message proof that matches the touched surface:

```bash
bun run --cwd tests test:unit -- chat-workspace-structure.test.js third-party-extension-compatibility.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-layout.e2e.js
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js
```

When character read-service or character route work changes `/api/characters/all`, `/api/characters/list`, or `/api/characters/get`, also run:

```bash
bun run --cwd tests test:unit -- character-read-service.test.js interaction-performance-index.test.js character-list-structure.test.js --runInBand
```

That focused route proof verifies the internal read-service envelope stays internal and the legacy browser-facing payload shape remains stable.

## Phase 7 Input Package

Use the following package when a Phase 7 cutover candidate touches extension compatibility:

### Breaking-change review template

- `candidate surface`
- `current public contract`
- `known consumers`
- `current owner / rollback owner`
- `JS-Slash-Runner impact`
- `evidence summary`
- `user impact`
- `rollback trigger`
- `recommended next action`

### Deprecation window minimum

- Warn in the owner doc and any user-visible compatibility note before deletion or narrowing.
- Point the warning to the matching migration guidance.
- Keep the warning active until the replacement path and rollback path are both documented.
- If evidence remains incomplete, keep the surface frozen and documented instead of forcing a removal date.

### Rollback minimum

- State the legacy owner that will resume control.
- State how flag-off, build-missing, or import-failure paths return to the current owner.
- State how operators or reviewers confirm rollback success.
- Do not widen user-data risk or extension API shrinkage as part of rollback.

### Phase 7 consumer split

| Consumer | Required input from Phase 6 |
|---|---|
| Sprint 4: Extensions Host full owner cutover | `JS-Slash-Runner` primary gate status, mount lifecycle notes, alias stability notes, regex/slash export stability, extension-host blocker list |
| Sprint 7: Workspace shell and global compatibility decision | public global evidence, internal-bridge boundary, deprecation-window minimum, rollback template, breaking-change review template |

### Hard gate

If a candidate would break `JS-Slash-Runner` and no replacement path, migration note, and rollback path exist, the candidate must stay preserved, frozen, or delayed. Phase 6 does not authorize a stronger conclusion.
