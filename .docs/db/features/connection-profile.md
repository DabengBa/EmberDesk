---
id: feature.connection_profile
type: feature
name: Connection Profile
related: [page.api_configuration, feature.custom_base_url]
---

# Feature: Connection Profile

## ID 解释

`feature.connection_profile` represents the connection profile system at the top of the API configuration drawer. It covers creating, naming, applying, editing, and deleting named snapshots of API configuration (provider, model, base URL, API key, preset, and other settings). It does not cover the underlying API connection logic or generation parameter tuning.

## Feature Purpose

This feature lets a user save and quickly switch between complete API configurations — for example, one profile for DeepSeek roleplay and another for Claude writing — without re-entering credentials and settings each time.

## Trigger Entry

- **Primary entry**: use the connection profile dropdown at the top of the API configuration drawer.
- **Secondary entry**: use the `/connection-manager` slash command.

## Interaction IDs

- `feature.connection_profile.create`: saving the current configuration as a new named profile.
- `feature.connection_profile.apply`: selecting a profile from the dropdown to restore its settings.
- `feature.connection_profile.edit`: modifying which fields are included or excluded in a profile.
- `feature.connection_profile.delete`: removing a saved profile.
- `feature.connection_profile.rename`: changing the display name of a profile.

## User Flow

1. User configures the API (provider, model, base URL, API key, preset).
2. User clicks "Create" on the connection profile bar and enters a name.
3. The current configuration is captured via slash commands (`/api`, `/model`, `/proxy-url`, `/api-key`, `/preset`, etc.) and stored as a profile.
4. Later, user selects a different profile from the dropdown.
5. The system applies each field by invoking the corresponding slash command, updating the UI and settings.
6. The base URL, API key, provider, model, and preset all update together.

## Business Rules And Boundaries

- **CC mode profiles** capture: `api`, `preset`, `api-url`, `model`, `proxy-url`, `api-key`, `stop-strings`, `start-reply-with`, `reasoning-template`, `prompt-post-processing`, `regex-preset`.
- **TC mode profiles** capture a different set of fields specific to text completion.
- `proxy-url` and `api-key` support `ALLOW_EMPTY`: an empty value is recorded and applied (clearing the base URL or key).
- Old profiles with a `proxy` field (preset name from before proxy unification) are silently ignored on apply.
- Old profiles with a `proxy-password` field are treated as `api-key` for backward compatibility.
- Old profiles with a `secret-id` field are silently ignored.
- The profile dropdown is the quick-switch mechanism within the API panel; no global top-bar switcher exists.

## ID Boundary Notes

This feature is scoped to the profile CRUD and apply lifecycle. The underlying slash commands that read/write individual settings are part of their respective features (e.g., `/api-key` belongs to `feature.custom_base_url`).

## Outcomes

- **Profile created**: a named snapshot appears in the dropdown with all captured fields.
- **Profile applied**: the API panel updates to reflect the saved configuration; connection can be established immediately.
- **Profile deleted**: the snapshot is removed from the dropdown and settings file.
