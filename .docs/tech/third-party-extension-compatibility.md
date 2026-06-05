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

## Protected Mount Points

Keep these DOM surfaces stable unless a migration plan updates both first-party code and third-party compatibility proof:

- `#extensions_settings`
- `#extensions_settings2`
- `#regex_container`
- `#extensionsMenuButton`
- `#extensionsMenu`
- `#chat > .mes`
- `.mes_text`

`#extensionsMenuButton` and `#extensionsMenu` are rendered from `wandButton.html` and `wandMenu.html`, not from static `index.html`.

Tavern Helper currently mounts its Vue panel by appending `#tavern_helper` to `#extensions_settings`.

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

When character read-service or character route work changes `/api/characters/all`, `/api/characters/list`, or `/api/characters/get`, also run:

```powershell
bun run --cwd tests test:unit -- character-read-service.test.js interaction-performance-index.test.js character-list-structure.test.js --runInBand
```

That focused route proof verifies the internal read-service envelope stays internal and the legacy browser-facing payload shape remains stable.
