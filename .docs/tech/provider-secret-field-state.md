# Provider Secret Field State

## Module Responsibility

This document records the frontend state boundary for provider-owned secret fields in the API configuration drawer.

The delivered slice covers:

- unified key placeholder/value state for the OpenAI-compatible provider drawer
- fallback provider readiness status
- fallback provider API-key save and clear decisions
- fallback key input masking
- shared fallback readiness with main-chat automatic recovery

It does not migrate backend `SecretManager`, all provider key inputs, connection profile storage, or the API drawer layout.

## Architecture And Constraints

`public/scripts/provider-secret-field-state.js` is a focused frontend state module. `public/scripts/openai.js` owns jQuery event binding and DOM writes, while the state module returns explicit decisions that are easy to test without the full page.

Important constraints:

- fallback readiness uses `hasFallbackProviderSettings()` from `public/scripts/chat-generation-auto-recovery.js`
- the dedicated fallback secret maps to `SECRET_KEYS.OPENAI_FALLBACK` and `#fallback_provider_api_key`
- a failed save preserves the raw input so the user can retry or copy it before changing the field
- a successful save clears only the fallback input
- clear deletes only the fallback secret and clears only the fallback input
- selector drift should fail focused tests instead of silently skipping key clearing or status updates

## Core Implementation

`provider-secret-field-state.js` exports:

- `getFallbackProviderStatus()`
- `getUnifiedKeyFieldState()`
- `saveProviderSecretField()`
- `clearProviderSecretField()`
- `toggleSecretInputMask()`

`public/scripts/secrets.js` maps `SECRET_KEYS.OPENAI_FALLBACK` to `#fallback_provider_api_key`. `public/scripts/openai.js` delegates fallback status, save, clear, and mask behavior to the state module while keeping current event binding and visible drawer structure.

## Validation

Focused proof:

```bash
bun run --cwd tests test:unit -- provider-secret-field-state.test.js chat-generation-auto-recovery.test.js secrets-input-map.test.js --runInBand
bun run --cwd tests test:unit -- chat-workspace-structure.test.js openai-provider-capabilities.test.js --runInBand
```

The tests cover disabled, needs-setup, ready, reverse-proxy, server-side secret, failed-save, successful-save, clear, selector mapping, and shared readiness cases.

## Related Semantic IDs And Binding Points

Semantic IDs:

- `page.api_configuration`
- `feature.fallback_provider`
- `feature.custom_base_url`
- `feature.connection_profile`

Stable binding points:

- `public/scripts/provider-secret-field-state.js`
- `public/scripts/openai.js`
- `public/scripts/secrets.js`
- `SECRET_KEYS.OPENAI_FALLBACK`
- `#fallback_provider_api_key`
- `#fallback_provider_status`

Related docs:

- [API Configuration](../db/pages/api-configuration.md)
- [Fallback Provider](../db/features/fallback-provider.md)
- [Main Chat Generation Lifecycle](main-chat-generation-lifecycle.md)
