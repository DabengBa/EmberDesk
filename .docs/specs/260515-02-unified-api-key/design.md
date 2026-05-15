# Design: Unified API Key — Merge Proxy Password and Provider Keys

## Intent & Core Flow

**Intent**: Collapse 25+ provider-specific API key input fields and the proxy password field into a single "API Key" field in the Custom Base URL section. The field adapts its behavior based on whether a custom base URL is configured.

**Primary actor**: Self-hosting power user managing API connections, typically through a reverse proxy / API gateway (one-api, New API, etc.) or directly to a single provider.

**Happy path**:
1. User opens API panel → Custom Base URL section shows Base URL + a single "API Key" input.
2. User enters a base URL → the "API Key" field is the gateway password, shared across all providers.
3. User leaves proxy URL empty → the "API Key" field is the current provider's direct API key.
4. User switches provider (e.g., OpenAI → Claude) with no proxy → the field auto-loads Claude's saved key.
5. User creates a connection profile → the profile captures the API key value directly, regardless of proxy state.

---

## Scope / Out of Scope

**In scope**:
- Remove all 25+ `#api_key_*` input fields from `public/index.html` (OpenAI, Claude, OpenRouter, Gemini, Mistral, DeepSeek, xAI, etc.).
- Rename `#openai_proxy_password` to `#api_key_unified`; relabel from "Proxy Password" to "API Key".
- Remove `#openai_proxy_password_show` toggle; use standard password input with show/hide.
- Add provider-switch handler: when `main_api` or `chat_completion_source` changes and no proxy is set, load the new provider's saved secret into the unified field.
- Add proxy-URL-change handler: when proxy URL is cleared, load current provider's secret; when proxy URL is set, clear the field to accept proxy password.
- Rename `/proxy-password` slash command to `/api-key` in `openai.js`.
- Update `CC_COMMANDS`: replace `'proxy-password'` with `'api-key'`; remove `'secret-id'`.
- Update `FANCY_NAMES`: replace entries accordingly.
- Update `ALLOW_EMPTY`: replace `'proxy-password'` with `'api-key'`.
- Remove `secret-id` from `CC_COMMANDS` and `FANCY_NAMES` (unified field replaces its profile role).

**Out of scope**:
- Backend changes (`src/endpoints/backends/chat-completions.js`) — already uses `reverse_proxy ? proxy_password : readSecret()`.
- Secret store infrastructure (`secrets.js` read/write/rotation) — unchanged.
- `TC_COMMANDS` — Text Completion API secret-id handling unchanged.
- Special credential fields that are not simple API keys (Vertex AI service account JSON, MiniMax Group ID, Azure OpenAI deployment fields).
- Keyboard shortcuts or global UI changes outside the API panel.

---

## Edge Rules / Acceptance

- **Proxy URL set + API Key entered**: value stored in `oai_settings.proxy_password`; sent to backend as `proxy_password`. Works for all providers.
- **Proxy URL empty + API Key entered**: value saved to secret store under current provider's `SECRET_KEYS.*` (resolved via `resolveSecretKey()`). Sent to backend as the provider's API key.
- **Provider switch with no proxy**: unified field loads the new provider's saved secret (if any). Field value updates automatically.
- **Provider switch with proxy**: unified field retains the proxy password (unchanged).
- **Proxy URL cleared after entry**: unified field reloads current provider's saved secret. Proxy password is discarded.
- **Proxy URL entered after direct key**: unified field clears to accept proxy password. Provider's direct key remains in secret store.
- **`/api-key` with no argument**: returns `oai_settings.proxy_password` if proxy URL is set; otherwise returns current provider's secret (masked or empty).
- **`/api-key <value>`**: sets `oai_settings.proxy_password` if proxy URL is set; otherwise saves to current provider's secret store.
- **Old profile with `proxy-password` field**: treated as `api-key` via backward-compat alias. Applied correctly.
- **Old profile with `secret-id` field**: silently ignored (no longer in `CC_COMMANDS`). No error.
- **Special provider fields** (Vertex AI service account, MiniMax Group ID): remain visible when that provider is selected. These are NOT the unified API key.

---

## Architecture / Constraints

### Data flow change

Before:
```
User enters proxy password → oai_settings.proxy_password
User enters OpenAI key    → secret store (SECRET_KEYS.OPENAI)
User enters Claude key    → secret store (SECRET_KEYS.CLAUDE)
... × 25 providers

Backend: reverse_proxy ? proxy_password : readSecret(provider_key, secret_id)
```

After:
```
User enters API key (proxy set)   → oai_settings.proxy_password
User enters API key (no proxy)    → secret store (resolveSecretKey())
                                    ↑ auto-detects current provider

Backend: unchanged
```

### Unified field resolution logic

```js
// On field blur / Enter:
if (oai_settings.reverse_proxy) {
    oai_settings.proxy_password = fieldValue;
} else {
    const secretKey = resolveSecretKey();
    writeSecret(secretKey, fieldValue);
}

// On provider switch:
$('#main_api, #chat_completion_source').on('change', () => {
    if (!oai_settings.reverse_proxy) {
        const secretKey = resolveSecretKey();
        const savedValue = readSecret(secretKey); // masked
        $('#api_key_unified').val(savedValue);
    }
});

// On proxy URL change:
$('#openai_reverse_proxy').on('input', () => {
    if ($(this).val()) {
        $('#api_key_unified').val(''); // ready for proxy password
    } else {
        // reload provider's direct key
        const secretKey = resolveSecretKey();
        $('#api_key_unified').val(readSecret(secretKey));
    }
});
```

### CC_COMMANDS change (`connection-manager/index.js`)

```js
// Before
const CC_COMMANDS = ['api', 'preset', 'api', 'api-url', 'model', 'proxy-url', 'proxy-password', 'stop-strings', ..., 'secret-id', ...]
// After
const CC_COMMANDS = ['api', 'preset', 'api', 'api-url', 'model', 'proxy-url', 'api-key', 'stop-strings', ..., 'regex-preset']
```

`secret-id` removed from `CC_COMMANDS`. `proxy-password` replaced by `api-key`.

### FANCY_NAMES change

```js
// Remove
'secret-id': 'Secret',
'proxy-password': 'Proxy Password',
// Add
'api-key': 'API Key',
```

### Slash command: `/api-key` (`openai.js`)

```js
// Getter: returns current credential
function apiKeyCallback(_, value) {
    if (!value) {
        if (oai_settings.reverse_proxy) {
            return oai_settings.proxy_password ?? '';
        }
        // Return masked secret for current provider
        return ''; // actual read via secret system
    }
    // Setter
    if (oai_settings.reverse_proxy) {
        oai_settings.proxy_password = value;
        $('#api_key_unified').val(value);
    } else {
        const secretKey = resolveSecretKey();
        writeSecret(secretKey, value);
        $('#api_key_unified').val(value);
    }
    return value;
}
```

### Constraint: `resolveSecretKey()` dependency

`resolveSecretKey()` in `secrets.js` already handles the mapping from current API/source to the correct `SECRET_KEYS.*`. The unified field relies on this existing function — no new mapping logic needed.

### Constraint: special provider fields

Some providers have credential-adjacent fields that are NOT simple API keys:
- Vertex AI: service account JSON file, region
- MiniMax: Group ID
- Azure OpenAI: deployment name, endpoint

These fields remain in their provider-specific sections. The unified "API Key" field only replaces the simple string-key inputs.

---

## Data / Integrations

### Settings payload

`oai_settings.proxy_password` remains as-is (runtime field, persisted with `oai_settings`). No change to settings save/load.

Provider API keys remain in the secret store (server-side). No change to secret infrastructure.

### Connection profile schema

`ConnectionProfile` typedef:
- Remove: `@property {string} [proxy-password]`
- Remove: `@property {string} [secret-id]`
- Add: `@property {string} [api-key]` — the unified credential value

### Backward compatibility

- Old profiles with `proxy-password`: alias to `api-key` on apply (value is the proxy password; still valid).
- Old profiles with `secret-id`: silently ignored (field removed from `CC_COMMANDS`). The provider's key is loaded from secret store when the profile sets the API type.
- Old profiles with `proxy` (preset name, from pre-unification): already ignored.

---

## Verification

1. **Proxy mode**: Set proxy URL → enter API key → switch between OpenAI/Claude/Gemini → confirm the same key is used for all (proxy password).
2. **Direct mode (no proxy)**: Clear proxy URL → enter OpenAI key → switch to Claude → confirm field loads Claude's saved key (or empty if none).
3. **Mode switch**: Enter proxy URL with password → clear proxy URL → confirm field reloads provider's direct key. Enter proxy URL again → confirm field clears for new proxy password.
4. **Connection profile round-trip**: Create profile with proxy → apply profile → confirm proxy URL and API key restored. Create profile without proxy → apply → confirm provider key restored.
5. **Old profile compat**: Apply a profile with `proxy-password` field → confirm it works as `api-key`. Apply a profile with `secret-id` field → confirm no error.
6. **Special provider fields**: Select Vertex AI → confirm service account JSON field still appears. Select MiniMax → confirm Group ID field still appears.
7. **No console errors on page load** with any provider selected.

---

## References

- `public/scripts/openai.js` — `oai_settings.proxy_password`, `createGenerationParameters`, `sendOpenAIRequest`, `/proxy-password` command
- `public/scripts/secrets.js` — `resolveSecretKey()`, `SECRET_KEYS`, `secret_state`, secret write/read functions
- `public/scripts/extensions/connection-manager/index.js` — `CC_COMMANDS`, `FANCY_NAMES`, `ALLOW_EMPTY`
- `public/scripts/extensions/shared.js` — `ChatCompletionService.processRequest` proxy usage
- `public/index.html` — all `#api_key_*` inputs, `#openai_proxy_password`
- `src/endpoints/backends/chat-completions.js` — per-provider `reverse_proxy ? proxy_password : readSecret()` pattern (unchanged)
- `.docs/specs/260515-01-connection-profile-unified/design.md` — prior proxy preset unification
