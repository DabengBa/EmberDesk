---
description: "Single-owner mutable state and composition-root wiring constraints for the workspace runtime, browser entry, and first-party modules."
kind: technical
topic: workspace-composition-root
id: INV-WORKSPACE-COMPOSITION-ROOT
paths: [app/client.tsx, public/script.js, public/scripts/**, app/components/workspace/**]
enforcement: fresh-audit
---

# Workspace Composition Root Invariant

## Ownership and wiring

WHEN the workspace runtime handles mutable state, IF any owner other than the state's designated owner writes that state, THEN the implementation MUST be rejected; each mutable state MUST have exactly one owner.

WHEN a composition root (`app/client.tsx` or `public/script.js`) participates in the runtime, IF it does anything other than wiring owners together and preserving approved compatibility exports, THEN it MUST NOT ship; the composition root MUST NOT become a second store, a universal service locator, or a broad shell context.

## First-party module boundary

WHEN a first-party module under `public/scripts/` (excluding vendored third-party extensions) imports `public/script.js`, IF the import is new or widens the imported names of an existing reverse dependency, THEN the change MUST be rejected; the recorded reverse-import snapshot MUST only decrease or narrow over time.

WHEN first-party code needs `eventSource` or `event_types`, IF it imports them from `public/script.js`, THEN the import MUST be rejected; these symbols MUST be imported directly from their owner. WHEN first-party code needs `getRequestHeaders`, IF it imports the helper from `public/script.js`, THEN the import MUST be rejected; it MUST be imported directly from its owner.

## Owner relocation and rollback

WHEN a first-party compatibility surface is changed, IF `.character_select`, `.bogus_folder_select`, `data-chid`, legacy `chid`, `id="CharID${chid}"`, `.character_selected`, `.bulk_select_checkbox`, `.tags_inline`, or `.ch_fav` is removed or renamed, THEN the change MUST be rejected unless the matching compatibility tests prove the new contract; character-list identity selectors MUST remain stable. WHEN a retired API surface such as `/api/groups`, `/api/extensions`, `/api/vector`, `/api/stats`, `/api/moving-ui`, or a non-`openai` `/api/presets` ID is reintroduced, THEN the change MUST be rejected, including compatibility tombstone handlers; retired surfaces MUST remain absent. WHEN settings, presets, or provider identifiers are normalized on read, IF legacy `extension_settings` → `feature_settings`, legacy provider IDs → `openai`, or retired `power_user` key stripping is removed, THEN the change MUST be rejected; old user data MUST continue to load.

WHEN a first-party feature or page is migrated to the React workspace, IF a second runtime owner, group-chat/group-authoring UI, third-party extension API, standalone workspace HTML shell, global workspace context, or parallel legacy controller is introduced, THEN the change MUST be rejected; React MUST remain the sole runtime owner of migrated surfaces and first-party context consumers MUST use `getContext` from `public/scripts/st-context.js`. WHEN a new installation creates a retired user directory (`groups`, `group chats`, `personas`, `movingUI`, `instruct`, `context`, `quickreplies`, `vectors`, `sysprompt`, `reasoning`, `comfyWorkflows`, `themes`, or a retired provider preset directory), THEN the change MUST be rejected; existing files on disk MUST NOT be auto-purged. WHEN regex, slash-command, World Info regex editing, message rendering, or character-list DOM behavior changes, IF `pnpm run test:compat` is omitted, THEN the change MUST be rejected. WHEN a migrated workspace retains DOM hosts for native first-party controllers, IF those hosts are removed, THEN the change MUST be rejected; the React workspace MUST keep those hosts.

WHEN an owner is moved out of `public/script.js`, IF the old implementation remains in the root, THEN the change MUST be rejected; the old implementation MUST be deleted in the same wave. A compatibility re-export or thin adapter MUST NOT be introduced unless the public path remains an approved first-party contract.

WHEN a deployment is rolled back, IF the current application version keeps an in-process second runtime owner as a fallback, THEN the rollback MUST be rejected; rollback MUST use a previous application version or a revert of the change.
