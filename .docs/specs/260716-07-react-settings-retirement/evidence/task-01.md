# Task 01 Evidence — settings owner inventory + lossless bindings

## Summary
Expanded `app/lib/settings-helpers.js` field bindings from ~108 to 201 paths covering general oai_settings controls, user-settings UI/behavior fields, theme colors, and advanced formatting-adjacent power_user values that previously sat only in `legacyOwned`. Specialized surfaces (World Info, Extensions, Personas, tags) remain intentionally non-React-owned.

## Changes
- `settingsOwnerInventory` ledger: drawer selectors + specialized/complex/text-gen roots
- New bindings for drawer-owned paths (tool reasoning, prompts formats, colors, send-on-enter, pin styles, collapse newlines, token padding, etc.)
- `buildSettingsSavePayload` skips `undefined` form paths so partial forms cannot wipe document fields
- Zod schema + SettingField UI entries for new form paths in `app/routes/settings.tsx`
- Focused unit test: inventory membership + single-field save round-trip + unknown-field preservation

## Proof (red → green via new test)
```
bun run --cwd tests test:unit -- settings-react-route.test.js --runInBand
# PASS 6 tests including owner inventory covers drawer fields with lossless single-field save round-trip

bun run --cwd tests test:unit -- settings-get-route.test.js --runInBand
# PASS

timeout 90 node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json canonical-settings-store.test.js --runInBand --forceExit --testTimeout=15000
# PASS 15 tests
```

## PM
Fixture with old enums (`reasoning_effort: xhigh`, `tool_reasoning_mode: active_chain`), unknown root fields, specialized surfaces, and nested stscript flags. Single-field edit of `power_user.main_text_color` only rewrites that path; remaining document round-trips intact.

## Notes
- `bias_presets` object manager stays complex/non-form-owned (selection string is bound).
- World Info panel controls inside Advanced Formatting remain specialized (World Info workbench), not Settings page fields.
