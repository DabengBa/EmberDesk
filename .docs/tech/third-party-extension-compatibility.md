---
description: "- Regex is a fixed product feature under public/scripts/extensions/regex/ (the directory name is retained; it is a directly imported module, not a plugin system). It initializes via initCoreFeatures() in..."
kind: technical
topic: third-party-extension-compatibility
---

# First-Party Internal Compatibility Contracts

> Internal contract reference for regex, slash commands, message-row DOM, character-list DOM, events, and module surfaces that first-party EmberDesk code still depends on. There is no third-party extension system: no extension loading, discovery, install, update, serving, or `/api/extensions/*` endpoints exist.

## Current Contracts

- **Regex** is a fixed product feature under `public/scripts/extensions/regex/` (the directory name is retained; it is a directly imported module, not a plugin system). It initializes via `initCoreFeatures()` in `public/scripts/feature-settings.js`.
- **`feature_settings` data bag**: owns `regex`/`regex_presets`, `note`, `variables.global`, `character_allowed_regex`, `preset_allowed_regex`. New writes use `feature_settings`; legacy `extension_settings` data is preserved through lazy migration and on-disk keys are never purged.
- **Message cards**: first-party frontend frames (`frontend-frame.js` / `frontend-frame-controller.js` / `EmberDeskFrame`) render fenced complete HTML documents as same-origin iframes.
- **Character-card metadata**: `data.extensions.*` fields (`regex_scripts`, `world`, etc.) are feature data and must not be deleted.

## Internal Contracts

The following are internal contracts consumed by EmberDesk's own modules; breaking them is an internal refactor concern.

### Internal runtime surface

- `globalThis.SillyTavern` (`public/scripts/public-api.js`, installed by `script.js`) — internal API for first-party modules and debugging; `getContext()` exposes feature settings, slash commands, variables, world info, and rendering helpers to first-party code.
- `eventSource` / `event_types` (`public/scripts/events.js`) — internal event emitter/table; also consumed by frontend frames through a whitelisted `EmberDeskFrame.on`/`off` bridge.
- `/lib.js` (`public/lib.js`) — shared browser utility surface for first-party modules.
- `__emberDeskReactCompatibilityBridge` — internal-only React/legacy adapter; never a public API.

### Message row DOM contract

The main chat message list is a shared surface for first-party message actions, rendering tests, and frontend frames. Keep these selectors and identity attributes stable:

- `#chat > .mes`, `.mes_text`, `.mes[mesid]`, `.last_mes`, `is_user`, `is_system`
- `.mes_reasoning_details`, `.mes_reasoning`, `.mes_media_wrapper`, `.mes_file_wrapper`
- `.swipe_left`, `.swipe_right`
- `.extraMesButtonsHint` before `.extraMesButtons`; the hidden `data-main-chat-message-actions-owner="react"` marker stays appended after protected controls.

Generation-recovery status (`.generation_auto_recovery_status`) stays outside `.mes_text`. Frontend-frame iframe hosts (`data-frontend-frame`) are owned by the frame controller.

### Character list DOM contract

Preserve these selectors and identity attributes (also mandated by `AGENTS.md`):

- `#rm_characters_block`, `#rm_print_characters_block`, `.character_select`, `.bogus_folder_select`
- `.character_select[data-chid]`, `.character_select[chid]`, `id="CharID${chid}"`
- `.character_selected`, `.bulk_select_checkbox`, `.tags_inline`, `.ch_fav`

`data-chid` is the standard row identity; the legacy `chid` attribute remains for existing selectors.

### Slash command surface

`public/scripts/slash-commands.js` exports used internally include `executeSlashCommands`, `executeSlashCommandsWithOptions`, `getSlashCommandsHelp`, `registerSlashCommand`, `parser`, `CONNECT_API_MAP`, `UNIQUE_APIS`, `initDefaultSlashCommands`, `processChatSlashCommands`, `generateSystemMessage`, `validateArrayArg*`, `sendMessageAs`, `sendNarratorMessage`, `promptQuietForLoudResponse`, `executeSlashCommandsOnChatInput`, `commandsFromChatInputAbortController`, `pauseScriptExecution`, `stopScriptExecution`, `setSlashCommandAutoComplete`, and autocomplete helpers. Do not remove, rename, or narrow these exports as incidental cleanup.

### Regex data contract

The regex feature is stateful across global settings, character cards, and presets:

- global scripts: `feature_settings.regex`
- character scripts: `character.data.extensions.regex_scripts`
- preset scripts: `oai_settings.extensions.regex_scripts`
- character allow-list: `feature_settings.character_allowed_regex`
- preset allow-list: `feature_settings.preset_allowed_regex`

Engine exports consumed internally: `getRegexedString`, `regex_placement.USER_INPUT` / `AI_OUTPUT` / `SLASH_COMMAND` / `WORLD_INFO` / `REASONING`. Changing `regex_placement` numeric values is a breaking change.

### Event contract

Stable event names consumed by first-party modules and the frontend-frame whitelist include `APP_READY`, `CHAT_CHANGED`, `CHAT_COMPLETION_SETTINGS_READY`, `CHARACTER_DELETED`, `CHARACTER_MESSAGE_RENDERED`, `CHARACTER_RENAMED`, `GENERATE_AFTER_DATA`, `MESSAGE_RECEIVED`, `OAI_PRESET_CHANGED_AFTER`, `PRESET_DELETED`, `PRESET_RENAMED_BEFORE`, `SETTINGS_UPDATED`, `USER_MESSAGE_RENDERED`. `eventSource` must keep `on`, `once`, `emit`, `emitAndWait`, `makeFirst`, `makeLast`, `removeListener`.

### Composition-root ownership

- `public/scripts/events.js` owns `eventSource` and `event_types`.
- `public/scripts/request-context.js` owns CSRF loading, request headers, and the jQuery Ajax prefilter.
- `public/scripts/public-api.js` installs `globalThis.SillyTavern`.
- `public/script.js` assembles these contracts and calls `bootstrapWorkspace()`.

The first-party reverse-import gate in `tests/helpers/script-js-reverse-import-contract.js` records current legacy coupling as an exact snapshot. New first-party reverse imports are blocked; `eventSource`, `event_types`, and `getRequestHeaders` must not be imported from `script.js`.

### Character route compatibility

Internal read-service envelopes (`result.mode`, `latencyHint`, `interactionPath`, filter/pagination context) must not leak to browser callers. `/api/characters/all`, `/api/characters/list`, `/api/characters/get` keep legacy-shaped payloads.

## Validation

```bash
pnpm run test:compat          # internal-contract gate
pnpm --dir tests run test:unit -- chat-workspace-structure.test.js --runInBand
pnpm --dir tests run test:e2e -- chat-message-frontend-frames.e2e.js --workers=1
```

`tests/helpers/frontend-compatibility-contract.js` is the internal contract manifest.
