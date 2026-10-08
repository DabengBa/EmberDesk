# Third-Party Extension Compatibility (Retired)

> **Status: RETIRED (2026-09-28).** Third-party extension compatibility is no longer a supported boundary. This document is now (1) a retirement record describing what was removed, and (2) the surviving **internal** contract reference for regex, slash commands, message-row DOM, character-list DOM, events, and module surfaces that first-party EmberDesk code still depends on.

## What Was Retired

The third-party extension system was removed in three batches (see `.docs/tech/extension-system-retirement-plan.md` and `.docs/tech/legacy-cutover-ledger.md`):

| Batch | Commit | Removed |
|---|---|---|
| E-cut-1 (2026-09-24) | — | `public/scripts/extensions/third-party/` vendored JS-Slash-Runner, static serving, manifest loading, token-counter/quick-reply/wand menu stubs |
| E-cut-3 (2026-09-28) | `5a3c46484` | `/api/extensions/*` (now a JSON `410` tombstone), extension-host service/domain/compat-slot modules, `ExtensionsHostWorkspacePanel`, `extensionsHost` workspace state/bridge/commands, Extensions drawer DOM (`#rm_extensions_block`, `#extensions_settings`, `#extensions_settings2`, wand menu buttons), `directories.extensions` creation/migration, `extensions.*`/`git.backend` config keys, deferred extension bootstrap, `src/git/client.js` |
| E-cut-2 (2026-09-28) | `772c1a8d3` | `extension_settings` renamed to `feature_settings` (lazy migration), `extensions.js` renamed to `feature-settings.js`, manifest pipeline, `disabledExtensions`, `runGenerationInterceptors`, generation-interceptor hook in generation-service, Extras/scrapers/st-context third-party exports |
| E-cut-4 (2026-09-28) | — | `st-context` third-party-only exports, `extension-mutated` message-row contract, compat suite reclassified as internal-contract tests, documentation |

Concretely, the following are **gone** and must not be reintroduced:

- Loading, discovering, installing, updating, or serving third-party extension code. `/api/extensions/*` answers `410` with `{ error: "extensions_retired" }`.
- `public/scripts/extensions/third-party/` and the fixture fetch script.
- Extension manifests (`manifest.json`) as an initialization mechanism — built-in features initialize directly via `initCoreFeatures()`.
- `@sillytavern/*` browser import aliases as a supported contract.
- `window.TavernHelper` / JS-Slash-Runner / Tavern Helper as supported integrations.
- Extension mount points (`#extensions_settings`, `#extensions_settings2`, `#regex_container`, `#extensionsMenuButton`, `#extensionsMenu`) — deleted from `index.html` and templates.
- `extension_settings` as the active settings key — replaced by `feature_settings` (lazy migration: `/api/settings/get` normalizes the old key on the wire; `data-maid` dual-reads unmigrated files; on-disk `extension_settings` keys in existing `settings.json` are never purged).
- `runGenerationInterceptors` and the extension generation-interceptor contract.
- The `extension-mutated` message-row contract (`.TH-streaming` / `.TH-render` markers, `hasExtensionMutatedRows`) — no producer remains.

## What Replaced It

- **Built-in features promoted to first-party**: Regex remains as a fixed product feature under `public/scripts/extensions/regex/` (the directory name is retained; it is a directly imported module, not a plugin system). It initializes via `initCoreFeatures()` in `public/scripts/feature-settings.js`. **Connection Manager is retired**: the single-provider contract (one URL, one key, one model, one fallback model) makes multi-connection profiles unnecessary — its module directory, `/profile*` slash commands, `ConnectionManagerRequestService`, and the `rm_api_block` drawer it lived in are all removed; stored `feature_settings.connectionManager` data remains inert historical data.
- **`feature_settings` data bag**: owns `regex`/`regex_presets`, `note`, `variables.global`, `character_allowed_regex`, `preset_allowed_regex`. New writes use `feature_settings`; legacy `extension_settings` data is preserved through lazy migration.
- **Message cards**: first-party frontend frames (`frontend-frame.js` / `frontend-frame-controller.js` / `EmberDeskFrame`) render fenced complete HTML documents as same-origin iframes — **shape-compatible** with the fenced-document card format, **API-incompatible** with Tavern Helper (no TH variables, no `{{get_*_variable}}` macros, no arbitrary extension APIs). See `.docs/specs/260924-01-message-frontend-rendering/spec.md`.
- **Character-card metadata**: `data.extensions.*` fields (`regex_scripts`, `world`, etc.) are feature data, unrelated to the retired extension system — they remain valid and must not be deleted.

## Surviving Internal Contracts

The following remain as **internal** contracts consumed by EmberDesk's own modules. They are no longer third-party extension commitments — breaking them is an internal refactor concern, not an external compatibility violation.

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

Generation-recovery status (`.generation_auto_recovery_status`) stays outside `.mes_text`. Frontend-frame iframe hosts (`data-frontend-frame`, `.ed-frontend-stream`) are owned by the frame controller.

### Character list DOM contract

Preserve these selectors and identity attributes (also mandated by `AGENTS.md`):

- `#rm_characters_block`, `#rm_print_characters_block`, `.character_select`, `.bogus_folder_select`
- `.character_select[data-chid]`, `.character_select[chid]`, `id="CharID${chid}"`
- `.character_selected`, `.bulk_select_checkbox`, `.tags_inline`, `.ch_fav`

`data-chid` is the standard row identity; the legacy `chid` attribute remains for existing selectors. `.group_select` is retired with group chat removal.

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
pnpm run test:compat          # internal-contract gate (was: third-party extension gate)
pnpm --dir tests run test:unit -- extension-retirement.test.js --runInBand
pnpm --dir tests run test:unit -- chat-workspace-structure.test.js --runInBand
pnpm --dir tests run test:e2e -- chat-message-frontend-frames.e2e.js --workers=1
```

`tests/helpers/frontend-compatibility-contract.js` is the internal contract manifest; `tests/extension-retirement.test.js` is the retirement-absence gate.
