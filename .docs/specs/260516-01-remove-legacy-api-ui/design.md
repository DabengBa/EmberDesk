# Remove Legacy Kobold / Novel / Horde API UI and Code

## Goal

Remove all UI elements and JavaScript code specific to the defunct KoboldAI, NovelAI, and Kobold Horde APIs. These APIs are no longer selectable: `script.js:8138-8139` forces `main_api = 'openai'` for any saved `main_api` value of `'kobold'`, `'koboldhorde'`, `'novel'`, `'poe'`, or `'textgenerationwebui'`. The orphaned code adds ~800 lines of dead HTML, ~1900 lines across 3 standalone JS files, and scattered references in 5+ shared files.

## Scope

### In scope
- HTML: remove all Kobold/Novel preset blocks, sampling parameter blocks, streaming toggles, and AI Module selector
- JS: delete 3 standalone files, clean imports/exports/references in shared files
- CSS: remove any styles scoped exclusively to removed element IDs (if any)

### Out of scope
- Refactoring `amount_gen` / `max_context` variables (shared infrastructure, still used)
- Refactoring `main_api` variable declaration (still used, value always `'openai'`)
- Backend endpoint cleanup (`/api/presets/` still serves OpenAI presets)
- Extension UI cleanup (extensions may still reference Novel/Kobold model lists independently)

## Evidence

| Fact | Source |
|---|---|
| `chat_completion_sources` has only OPENAI, CLAUDE, MAKERSUITE, VERTEXAI | `openai.js:172-177` |
| `main_api` forced to `'openai'` for legacy values | `script.js:8138-8143` |
| `#chat_completion_source` select has only OpenAI/Claude/Google options | `index.html:1539-1543` |
| Kobold/Novel preset blocks have no activation path | `index.html:88-168` |
| `#common-gen-settings-block` controls are Kobold/Novel-only | `index.html:214-273` |
| `#range_block_novel` has no `data-source` attribute, never toggled visible | `index.html:279-567` |
| `#kobold_api-settings` has no `data-source` attribute, never toggled visible | `index.html:916-1095` |
| `#novel_api-settings` has no `data-source` attribute, never toggled visible | `index.html:1096-1153` |

## Changes

### Phase 1: Delete standalone files (2 files) + extract 1 file (~1900 lines)

| File | Lines | Action | Reason |
|---|---|---|---|
| `public/scripts/kai-settings.js` | ~530 | Delete | Entire file is KoboldAI settings management; no external dependents |
| `public/scripts/horde.js` | ~400 | Delete | Entire file is Kobold Horde integration; no external dependents |
| `public/scripts/nai-settings.js` | ~950 | Extract then delete | NovelAI subscription functions are imported by `extensions/stable-diffusion/index.js` |

**nai-settings.js extraction plan:**

The stable-diffusion extension imports 3 functions for NovelAI image generation (not text generation):
- `getNovelAnlas()` — returns anlas balance
- `getNovelUnlimitedImageGeneration()` — returns unlimited image gen flag
- `loadNovelSubscriptionData()` — fetches `/api/novelai/status`

These depend only on `novel_data` (private var), `nai_tiers` (private const), and `setNovelData()` (internal). They are self-contained with no dependency on NovelAI text generation settings.

Action: Extract these 6 items (`novel_data`, `nai_tiers`, `setNovelData`, `getNovelAnlas`, `getNovelUnlimitedImageGeneration`, `loadNovelSubscriptionData`) into `public/scripts/novelai-subscription.js`. Update the import in `extensions/stable-diffusion/index.js:46`. Then delete `nai-settings.js`.

### Phase 2: Remove HTML blocks from `index.html` (~800 lines)

| Block | Lines | Content |
|---|---|---|
| `#kobold_api-presets` | 88-126 | Kobold preset toolbar + select |
| `#novel_api-presets` | 127-168 | NovelAI preset toolbar + select |
| `#common-gen-settings-block` | 214-273 | Response Length slider, Context Size slider, streaming toggles, AI Module |
| `#range_block_novel` | 279-567 | All Novel sampling parameters, preamble, banned tokens, logit bias |
| `#kobold_api-settings` | 916-1095 | All Kobold sampling parameters, mirostat, grammar, samplers order |
| `#novel_api-settings` | 1096-1153 | Novel samplers order |
| HTML comment (OldKobold block) | 275-278 | Dead comment block |

### Phase 3: Clean `public/script.js` (~40 lines)

Remove imports:
- `kai_settings`, `loadKoboldSettings`, `koboldai_settings`, `koboldai_setting_names`
- `loadNovelSettings`, `nai_settings`, `novelai_settings`, `novelai_setting_names`
- `horde_settings`

Remove re-exports of orphaned settings objects.

Remove inline references:
- Streaming checks for `main_api == 'kobold'` / `'novel'` in `isStreamingEnabled()`
- `adjustNovelInstructionPrompt()` calls
- Kobold/Novel preset lookups in generation data assembly
- Horde response length / context adjustments
- Novel preamble substitution
- `loadKoboldSettings()` / `loadNovelSettings()` calls in settings init
- `#streaming_kobold_block` / `#streaming_novel_block` UI references

### Phase 4: Clean `public/scripts/preset-manager.js` (~20 lines)

- Remove imports: `koboldai_setting_names`, `koboldai_settings`, `novelai_settings`, `novelai_setting_names`, `nai_settings`
- Remove `'koboldhorde'` → `'kobold'` normalization in `getPresetManager()`
- Remove `case 'koboldhorde'` / `case 'kobold'` / `case 'novel'` in `getPresetList()`
- Remove `'streaming_novel'` and `'streaming_kobold'` from `filteredKeys` array

### Phase 5: Clean other shared files

| File | What to remove |
|---|---|
| `public/scripts/RossAscends-mods.js` | `kai_settings` import, Kobold API server checks, `case 'kobold'` / `case 'novel'` blocks |
| `public/scripts/tokenizers.js` | `kai_flags`, `kai_settings` imports, Kobold API server URL references, `case 'kobold'` block |
| `public/scripts/slash-commands.js` | `kai_settings` import, Kobold API server references |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Extensions import from deleted files | **Known**: stable-diffusion extension imports from `nai-settings.js` — handled by extracting subscription functions to `novelai-subscription.js` before deletion |
| Shared variables still referenced | `amount_gen`, `max_context`, `main_api` are shared infrastructure, not removed |
| Preset files on disk for Kobold/Novel | Backend `/api/presets/` is generic; orphaned preset files on disk are harmless and out of scope |
| CSS rules targeting removed IDs | Low impact (unused selectors are inert); optional cleanup |

## Verification

1. `bun run build` or equivalent passes without import errors
2. All 3 chat completion sources (OpenAI, Claude, Google) load and display settings correctly
3. Preset save/load/update/delete works for OpenAI presets
4. No console errors referencing `kai_settings`, `nai_settings`, `horde_settings`, or removed DOM IDs
