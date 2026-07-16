# Task 02 Evidence — provider / connection / secret workflows

## Summary
Completed provider secret coverage for Vertex service-account full mode on `/settings`, bound connection-manager selected profile, and kept secrets out of the settings JSON document.

## Changes
- `public/scripts/provider-secret-field-state.js`: `full` Vertex auth resolves `vertexai_service_account_json`; unified field state exposes `isServiceAccount`
- `app/routes/settings.tsx`: service-account textarea + save/clear labels; removed “remains in API Configuration” deferral; connection profile id field
- `app/lib/settings-helpers.js`: `providers.connectionProfileId` ↔ `extension_settings.connectionManager.selectedProfile` with skip-when-absent `toSettings`

## Proof
```
timeout 60 node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json \
  provider-secret-field-state.test.js settings-react-route.test.js secrets-input-map.test.js canonical-settings-store.test.js \
  --runInBand --forceExit --testTimeout=15000
# PASS 32 tests
```

## PM
Vertex full mode uses secrets write/delete for service account JSON; save payload never includes secret material; switching connection profile id only rewrites `selectedProfile` and preserves profile list.
