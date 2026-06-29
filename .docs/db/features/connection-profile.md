---
id: feature.connection_profile
type: feature
name: Connection Profile
related: [page.api_configuration, feature.custom_base_url]
---

# Feature: Connection Profile

## ID 解释

`feature.connection_profile` represents the connection profile system at the top of the API configuration drawer. It covers creating, naming, applying, editing, and deleting named snapshots of API configuration (provider, model, base URL, API key, preset, and other settings). It does not cover the underlying API connection logic or generation parameter tuning.

## Purpose

Let users save named API configuration snapshots and switch between them from the API configuration drawer without re-entering provider, model, endpoint, key, preset, and related settings.

## User-Visible Contract

- The connection profile controls live at the top of [API Configuration](page.api_configuration) and act as the quick-switch surface for named API snapshots.
- Creating a profile captures the current visible connection setup into a named dropdown option.
- Applying a profile updates the visible API drawer fields together so the selected provider, model, endpoint, key state, preset, and included options match the chosen snapshot.
- Users can rename, edit included fields, and delete profiles; those changes must persist across drawer reopen and page refresh.
- Empty proxy URL or API key values can be intentionally captured and applied as clearing actions.
- Older profile fields are tolerated for compatibility without exposing them as a new user-facing profile model.

## Semantic Interaction IDs

- `feature.connection_profile.create`: saving the current configuration as a named profile.
- `feature.connection_profile.apply`: selecting a profile from the dropdown to restore its settings.
- `feature.connection_profile.edit`: modifying which fields are included or excluded in a profile.
- `feature.connection_profile.delete`: removing a saved profile.
- `feature.connection_profile.rename`: changing the display name of a profile.

## Acceptance Workflows

- As a user who wants to preserve an API setup, from [API Configuration](page.api_configuration) configure provider, model, endpoint, key state, and preset, then create a named profile; EmberDesk must add the name to the profile dropdown with the visible setup captured, refresh or reopen must keep the profile available, and failure is a missing profile, unnamed snapshot, or fields not restored later.
- As a user switching between providers, from the profile dropdown apply a saved profile; EmberDesk must update the visible drawer fields as one coherent configuration, including intentionally empty base URL or key states, reconnect/retry must use the applied visible values, and failure is a partially applied profile or stale provider/model controls.
- As a user maintaining saved profiles, from the profile controls rename, edit included fields, or delete a profile; EmberDesk must update the dropdown and preserve that change after refresh, and failure is a deleted profile returning, a renamed profile losing its settings, or edit choices ignored on apply.

## Feature-Specific Evidence

- Dropdown options, visible field updates, profile names, and refresh persistence are primary evidence.
- Slash-command application and serialized profile fields are supporting evidence for why settings change together.
- Legacy field handling is evidence only when applying older profiles does not break the visible profile workflow.

## Failure Signals

- Applying a profile leaves the drawer showing a mix of old and new provider settings.
- Empty values cannot be intentionally saved or applied as clearing actions.
- Deleted or renamed profiles revert after page refresh.
- Fallback-provider settings are captured or overwritten as though they were normal profile fields.

## Boundaries

- Main base URL and unified key entry belongs to [Custom Base URL](feature.custom_base_url).
- Provider/model selection belongs to [Chat Completion Provider and Model Select](feature.chat_completion_select).
- Fallback-provider configuration is intentionally separate under [Fallback Provider](feature.fallback_provider).
- The API drawer page structure belongs to [API Configuration](page.api_configuration).
