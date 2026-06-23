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

Phase 4 adds internal React/Zustand observation through `app/stores/*` and `app/compat/global-compatibility-bridge.js`. This bridge is an EmberDesk runtime adapter, not a new third-party extension API. Extension authors should continue to treat the protected legacy surfaces below as the supported public compatibility contract until Phase 7 makes an ADR-gated deletion, freeze, or long-term support decision.

| Surface | Current status | Future access path | Fallback / rollback |
|---|---|---|---|
| `globalThis.SillyTavern` | Stable compatibility surface | Phase 7 Sprint 7 decides whether this remains a long-term facade or is narrowed behind a documented adapter. | Keep the existing object owner; React bridge failure must not replace it with a stub. |
| `eventSource` / `event_types` | Stable compatibility surface | Phase 6 gathers common-extension evidence; Phase 7 Sprint 7 decides deletion, freeze, or long-term support. | Keep event names and emitter methods stable; failed React bridge attach leaves existing exports untouched. |
| `@sillytavern/*` browser aliases | Stable compatibility surface | Phase 6 validates alias consumers such as Tavern Helper; Phase 7 Sprint 7 decides final compatibility policy. | Preserve alias resolution and export shapes; rollback is the existing browser module mapping. |
| Extension mount points (`#extensions_settings`, `#extensions_settings2`, `#regex_container`, wand menu) | Stable compatibility surface | Extensions Host full owner cutover belongs to Phase 7 Sprint 4 after Phase 6 evidence. | React hosts may show readiness/status only; protected legacy nodes remain behavior owners. |
| Regex engine exports and `regex_placement` values | Stable compatibility surface | Phase 6 validates regex extension and Tavern Helper behavior before any Phase 7 decision. | Do not rename exports or change numeric placement values; rollback is the current regex module owner. |
| Slash parser / registry / executor exports | Stable compatibility surface | React slash UI can observe state, but parser/registry/executor migration needs a separate Phase 7 decision if ever attempted. | Keep `public/scripts/slash-commands.js` as owner; React failures fall back to legacy autocomplete and command execution. |
| Phase 4 React/Zustand bridge snapshots | Migration candidate for first-party internals only | First-party React islands may observe sanitized workspace/main-chat state through the bridge while legacy APIs remain public. | Bridge detach removes only `__emberDeskReactCompatibilityBridge`; no third-party extension should depend on it. |
| Full extension API retirement or facade freeze | Phase 7 decision required | Phase 7 Sprint 4 covers Extensions Host owner cutover; Phase 7 Sprint 7 covers workspace shell/global compatibility exports. | If Phase 6 evidence is incomplete, keep the current compatibility surface and document it as a frozen facade with tests. |

Phase 6 evidence collection must cover Tavern Helper / JS-Slash-Runner, Regex Manager behavior, Quick Reply-style event usage, Extensions Manager install/update/delete flows, alias resolution, event contracts, and protected mount-point lifecycle. Any migration candidate needs a rollback story that returns to the current legacy owner without data loss or extension API shrinkage.

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

The shared workspace-panel React scaffold for World Info, Background Library, and Extensions Host is not a compatibility exemption. The current World Info readiness host, Background Library status host, and Extensions Host protected-mount-point status host are additive surfaces beside legacy nodes; they do not own the legacy World Info editor/import DOM, background action controls, extension settings columns, regex container, wand menu, or extension install/update/delete controls. When the matching flag is off, the current wrappers do not insert an empty migration host. If a flagged scaffold bundle fails to import, protected legacy nodes still remain the behavior owner. A future React host must mount beside or around protected legacy nodes rather than clearing them as an incidental render target.

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

```powershell
bun run test:compat
```

The direct tests-package command remains equivalent when debugging from `tests/`:

```powershell
Push-Location tests
bun run test:unit -- third-party-extension-compatibility.test.js --runInBand
Pop-Location
```

This test verifies mount points, Tavern Helper manifest and distributable files, `@sillytavern/*` import resolution, key module exports, slash-command public exports, event values, and regex placement values.
It also verifies the generated character-list row identity contract used by character library slices.

Structure tests may share assertions through `tests/helpers/frontend-structure-contract.js`, but the shared helper is a test-only contract boundary. It must not replace runtime compatibility proof for protected extension surfaces.

When message row rendering, message actions, or main chat workspace structure changes, also run the focused message proof that matches the touched surface:

```powershell
bun run --cwd tests test:unit -- chat-workspace-structure.test.js third-party-extension-compatibility.test.js --runInBand
bun run --cwd tests test:e2e -- chat-message-layout.e2e.js
bun run --cwd tests test:e2e -- chat-message-rendering.e2e.js
```

When character read-service or character route work changes `/api/characters/all`, `/api/characters/list`, or `/api/characters/get`, also run:

```powershell
bun run --cwd tests test:unit -- character-read-service.test.js interaction-performance-index.test.js character-list-structure.test.js --runInBand
```

That focused route proof verifies the internal read-service envelope stays internal and the legacy browser-facing payload shape remains stable.
