---
description: "Non-inferable first-party and legacy-data compatibility rules that cannot be recovered by reading the current implementation alone."
kind: technical
topic: third-party-extension-compatibility
id: INV-FIRST-PARTY-COMPATIBILITY
paths: [public/script.js, public/scripts/**, app/**]
enforcement: fresh-audit
---

# First-Party Compatibility Invariant

## Extension boundary

WHEN a change introduces an extension API, extension system, extension discovery, or extension installation surface, IF the capability is not an internal first-party fixed feature, THEN the change MUST be rejected; EmberDesk MUST NOT expose a third-party extension API or system. Built-in Regex functionality MUST remain a fixed first-party feature, not an extension point.

## Composer and retained features

WHEN a composer input begins with `/`, IF the runtime interprets it as a command, THEN the behavior MUST be rejected; slash commands are retired and the leading `/` MUST be treated as ordinary chat text. Macro and variable substitution (`{{...}}`) and native tool calling MUST remain supported; retired slash APIs MUST NOT be restored.

## Legacy data

WHEN legacy user data is loaded, IF the reader rejects it because it predates a rename, migration, or retirement, THEN the change MUST be rejected. Settings and presets MUST be normalized on read; legacy provider IDs MUST be read as `openai`; retired `power_user` keys MUST be stripped on load and save; `extension_settings` data MUST migrate lazily into `feature_settings` on use, and pre-existing on-disk legacy keys MUST NOT be purged.

WHEN a character card is processed, IF `data.extensions.*` is discarded, THEN the change MUST be rejected; character-card `data.extensions.*` is feature data and MUST be preserved.

WHEN a retired API surface is removed, IF a tombstone or `410` response is added in its place, THEN the change MUST be rejected; retired surfaces MUST NOT exist. New installations MUST NOT create directories belonging to retired features, and existing on-disk files from those features MUST NOT be automatically purged.

## Compatibility proof

WHEN compatibility changes affect character-list behavior, DOM contracts, message rendering, Regex, slash handling, or world-info Regex, IF `pnpm run test:compat` has not passed, THEN the change MUST NOT ship; that gate MUST prove these compatibility surfaces.
