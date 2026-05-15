# Design: Connection Profile Unified — Proxy Merge

## Intent & Core Flow

**Intent**: Eliminate the proxy preset layer by inlining proxy URL and password directly into connection profiles, so the Connection Profile section at the top of the API panel is the single place to manage and switch complete API configurations.

**Primary actor**: Power user managing multiple API configurations (e.g., DeepSeek for roleplay, Claude for writing).

**Happy path**:
1. User opens API panel → Reverse Proxy section shows URL + password inputs only (no preset dropdown, no save/delete buttons).
2. User fills in proxy URL and password.
3. User clicks "Create" or "Update" on a connection profile → URL and password are captured as `proxy-url` and `proxy-password` fields on the profile.
4. User selects a different profile from the Connection Profile dropdown → proxy URL and password update automatically along with API, model, and preset.

---

## Scope / Out of Scope

**In scope**:
- Remove `#openai_proxy_preset`, `#save_proxy`, `#delete_proxy`, `#openai_reverse_proxy_name` from the API panel HTML.
- Add `proxy-url` and `proxy-password` to `CC_COMMANDS` in connection-manager; remove `proxy`.
- Add `'proxy-url'` and `'proxy-password'` entries to `FANCY_NAMES`.
- Register `/proxy-url` and `/proxy-password` slash commands in `openai.js`.
- Remove `proxies[]` and `selected_proxy` from the settings save payload and load path.
- Remove `loadProxyPresets()` call from `loadSettings`.

**Out of scope**:
- Migration of existing saved proxy presets (silently dropped; users recreate via connection profiles).
- TC_COMMANDS proxy handling (Text Completion API does not use reverse proxy).
- Any UI changes outside the API configuration panel.
- Keyboard shortcut for profile switching.

---

## Edge Rules / Acceptance

- **Profile with no proxy fields**: applying the profile clears `oai_settings.reverse_proxy` and `oai_settings.proxy_password` to empty string.
- **Old profile with `proxy` field (preset name)**: `proxy` is no longer in `CC_COMMANDS`; the field is silently ignored on apply. No error.
- **Proxy URL empty**: `oai_settings.reverse_proxy` is set to `''`; API calls use the default endpoint.
- **`/proxy-url` with no argument**: returns current `oai_settings.reverse_proxy`.
- **`/proxy-password` with no argument**: returns current `oai_settings.proxy_password`.
- **Settings load with legacy `proxies`**: if `settings.proxies` exists, it is ignored; `loadProxyPresets()` is not called. No error.
- **Reverse Proxy inline-drawer**: the drawer itself and the URL + password inputs remain. Only the preset management row (dropdown + save + delete + name input) is removed.

---

## Architecture / Constraints

### Data flow change

Before:
```
proxies[] (settings) → selected_proxy → oai_settings.reverse_proxy / proxy_password
```

After:
```
connection profile { proxy-url, proxy-password }
  → /proxy-url <url>   → oai_settings.reverse_proxy
  → /proxy-password <pw> → oai_settings.proxy_password
```

`#openai_reverse_proxy` and `#openai_proxy_password` inputs remain in the API panel as the runtime editing surface. Only the preset management layer is removed.

### CC_COMMANDS change (`connection-manager/index.js`)

```js
// Before
const CC_COMMANDS = ['api', 'preset', 'api', 'api-url', 'model', 'proxy', ...]
// After
const CC_COMMANDS = ['api', 'preset', 'api', 'api-url', 'model', 'proxy-url', 'proxy-password', ...]
```

### FANCY_NAMES additions

```js
'proxy-url':      'Proxy URL',
'proxy-password': 'Proxy Password',
```

### New slash commands (`openai.js`)

- `/proxy-url [url]` — getter/setter for `oai_settings.reverse_proxy`; calls `reconnectOpenAi()` on set; updates `#openai_reverse_proxy` input.
- `/proxy-password [password]` — getter/setter for `oai_settings.proxy_password`; updates `#openai_proxy_password` input.

`readProfileFromCommands` works generically via `SlashCommandParser.commands[command].callback(args, '')` — no change needed once the slash commands are registered.

### Constraint

`ALLOW_EMPTY` must include `'proxy-url'` and `'proxy-password'` so that an empty proxy URL is captured and applied (clearing the proxy when a profile has no proxy configured).

---

## Data / Integrations

### Settings payload changes

Remove from `saveSettings` payload:
```js
proxies: proxies,
selected_proxy: selected_proxy,
```

Remove from `loadSettings`:
```js
loadProxyPresets(settings);
```

`oai_settings` retains `reverse_proxy` and `proxy_password` (runtime fields, still persisted as part of `oai_settings`).

### Connection profile schema

`ConnectionProfile` typedef gains two optional fields:
```js
* @property {string} [proxy-url]      Proxy Server URL
* @property {string} [proxy-password] Proxy Password
```

The old `proxy` field (preset name) is no longer written by `readProfileFromCommands`. Existing profiles that carry it are unaffected at read time.

### Backward compatibility

- `settings.proxies` / `settings.selected_proxy`: present in existing settings files, ignored on load, dropped from file on next save.
- Existing profiles with `proxy` field: silently ignored on apply. Users recreate proxy URL via the updated create/edit flow.

---

## Verification

1. **Proxy preset UI removed**: Open API panel → Chat Completion → Reverse Proxy section. Confirm no preset dropdown, no save/delete buttons, no proxy name input. URL and password inputs remain.
2. **Proxy inlined in profile**: Set a proxy URL → create a connection profile → inspect `extension_settings.connectionManager.profiles[n]` in console → confirm `proxy-url` field present, `proxy` field absent.
3. **Profile apply sets proxy**: Apply a profile with `proxy-url` → confirm `oai_settings.reverse_proxy` equals the stored URL and `#openai_reverse_proxy` input reflects it.
4. **Profile apply clears proxy**: Apply a profile with no `proxy-url` → confirm `oai_settings.reverse_proxy` is `''`.
5. **Old profile compatibility**: Manually add `proxy: 'SomeName'` to a profile in settings → apply it → confirm no JS error, proxy inputs unchanged.
6. **No console errors on page load** with legacy `proxies` array in settings file.

---

## References

- `public/scripts/openai.js` — `proxies[]`, `selected_proxy`, `loadProxyPresets`, `setProxyPreset`, `runProxyCallback`, `reconnectOpenAi`
- `public/scripts/extensions/connection-manager/index.js` — `CC_COMMANDS`, `FANCY_NAMES`, `ALLOW_EMPTY`, `applyConnectionProfile`, `readProfileFromCommands`
- `public/script.js:8247` — `loadSettings` proxy load path; settings save payload
- `public/index.html:2306–2368` — Reverse Proxy inline-drawer (inputs to retain / elements to remove)
- Postman Environment model — inline variable storage per environment, no cross-environment reference layer (Inference)
