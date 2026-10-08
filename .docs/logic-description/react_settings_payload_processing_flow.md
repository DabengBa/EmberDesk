# React Settings Payload Processing Flow

## Metadata

- Owner: React settings payload documentation
- Current code binding:
  - `app/lib/settings-helpers.js`
  - `app/routes/settings.tsx`
- Related tech doc: [.docs/tech/react-modernization-roadmap.md](../tech/react-modernization-roadmap.md)
- Related semantic docs:
  - [.docs/db/pages/settings.md](../db/pages/settings.md)
  - [.docs/db/pages/api-configuration.md](../db/pages/api-configuration.md)
  - [.docs/db/features/chat-completion-select.md](../db/features/chat-completion-select.md)

## Goals And Non-Goals

Goals:

- Document the current rules that turn `/api/settings/get` payloads into React Settings form defaults.
- Document the save merge that writes React-owned settings paths while preserving untouched legacy settings.
- Make the single-provider source normalization rule and the unbound generation-defaults preservation reproducible without importing production code.
- Record the boundary between normal settings payload saves and server-side secret saves.

Non-goals:

- Re-document every settings field in the legacy workspace.
- Replace `tests/settings-react-route.test.js`.
- Describe provider request construction after settings have already been saved.

## Input Discovery And Parsing Rules

The React Settings page receives a JSON object from `POST /api/settings/get`.

Inputs:

- `payload.settings`: a JSON string containing the full settings object.
- `baseSettings`: the parsed settings object after `payload.settings` is decoded.
- `formValues`: the TanStack Form value tree for the Providers, User Interface, and Advanced tabs.
- `fieldBindings`: the React-owned mapping from form paths to settings paths.
- `secrets`: the single provider secret state read through `/api/secrets/read`, saved through `/api/secrets/write`, and cleared through `/api/secrets/delete`.

If `payload.settings` is missing or invalid JSON, the parser falls back to `{}` so the form can render default values. Missing settings paths keep their default form values unless a binding explicitly opts into transform-on-missing behavior.

## Outputs

The processing outputs are:

- `rawSettings`: the original settings JSON string, used to decide when to reset the form.
- `parsedSettings`: the parsed full settings object.
- `formDefaults`: form-shaped values for the React Settings tabs.
- `savePayload`: a full settings object with React-owned paths rewritten from the form.
- `providerSecretKey`: the single server-side secret key for the OpenAI-compatible provider.

## Staged Processing Flow

### Parse settings payload

1. Read `payload.settings` when it is a string; otherwise use `"{}"`.
2. Parse the JSON string.
3. If parsing fails, use an empty object.
4. Return the raw string, parsed settings object, and original payload.

### Build React form defaults

1. Start from `defaultSettingsFormValues`.
2. For each React-owned field binding, read the current value from its settings path.
3. If the value is missing and the binding does not opt into transform-on-missing, keep the default form value.
4. Apply any `toForm` transform.
5. Write the result to the form path.

Special rules:

- Generation-default keys under `oai_settings` (sampling, reasoning, continue, prompt formats, names behavior) are unbound: they never appear in form defaults because the AI Response Configuration drawer owns them.
- `power_user.auto_swipe_blacklist` arrays are displayed as comma-separated text.

### Build settings save payload

1. Start from a structured clone of the full parsed settings object.
2. For each React-owned field binding, read the form value.
3. Apply any `toSettings` transform.
4. Write the transformed value to the settings path.
5. Return the full settings object.

Special rules:

- The saved `chat_completion_source` always normalizes to `openai`; a stored legacy `vertexai`/`claude` value saves back as `openai`.
- `advanced.autoSwipeBlacklist` text is split on commas or newlines, trimmed, and saved as an array.
- Legacy-owned settings paths remain in the payload when already present, but the React form does not manufacture or edit them.

### Save provider secrets

1. Resolve the provider secret key (`api_key_openai`).
2. Save the provider key through `/api/secrets/write`.
3. Clear the provider key through `/api/secrets/delete`.
4. Keep secrets out of the normal `/api/settings/save` payload.

## Key Rules

- React Settings submits a full settings object but only rewrites paths listed in the React-owned coverage ledger.
- The field mapping is one-way per binding: unbound legacy fields are preserved by cloning, not by being represented in the form.
- Any stored legacy provider source normalizes to `openai` on save under the single-provider contract.
- The provider secret is a separate side effect, not an ordinary settings field.

## Output Schema

```json
{
  "formDefaults": {
    "providers": {
      "customUrl": "https://custom.example.com/v1"
    }
  },
  "savePayload": {
    "oai_settings": {
      "chat_completion_source": "openai",
      "custom_url": "https://custom.example.com/v1",
      "reasoning_effort": "minimal"
    },
    "untouched": {
      "keep": true
    }
  }
}
```

## Sandbox Verification

Run:

```bash
uv run python .docs/logic-description/react_settings_payload_sandbox_proof.py
```

The proof script embeds fake settings payloads and form values. It verifies invalid JSON fallback, legacy provider-source normalization to `openai` on save, auto-swipe blacklist parsing, untouched legacy field preservation, and the unbound generation-default keys surviving a save.

## Boundaries And Failure Modes

- If `payload.settings` is invalid JSON, defaults render from `{}`; no legacy settings are preserved because the source could not be parsed.
- If a React-owned form value is invalid, Zod validation stops normal save and the user sees an error before the payload is submitted.
- If a legacy-owned field is absent from the parsed base settings, React Settings does not create it unless a React-owned binding writes under the same object.
- If secret save or clear fails, normal settings payload construction is unchanged; the secret action reports its own page error.
