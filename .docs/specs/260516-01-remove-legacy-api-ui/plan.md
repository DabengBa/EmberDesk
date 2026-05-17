# Remove Legacy API UI Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end.

**Goal:** Remove all orphaned Kobold/Novel/Horde UI and JS code, leaving only OpenAI/Claude/Google chat completion paths.

**Source of Truth:** `design.md`

**Doc ID Scope:** none

---

## Phase 1: Extract NovelAI subscription functions
> nai-settings.js cannot be deleted outright because stable-diffusion extension imports subscription functions for NovelAI image generation. Extract them first.

### Task 1.1: Create novelai-subscription.js
- [x] **Done**
- **Goal:** Extract self-contained NovelAI subscription functions into `public/scripts/novelai-subscription.js`
- **Use:** File write + import update
- **Proof:** `grep -r "from.*nai-settings" public/scripts/extensions/` returns zero results after update
- **Doc IDs:** none
- **Not in Scope:** Modifying stable-diffusion extension behavior
- **References:** design.md Phase 1, `nai-settings.js:64-175` (novel_data, nai_tiers, setNovelData, getNovelAnlas, getNovelUnlimitedImageGeneration, loadNovelSubscriptionData)
- **PM Check:**
  - [x] Action: `grep -rn "novelai-subscription" public/scripts/extensions/stable-diffusion/index.js`
  - [x] Expected: Import line references `novelai-subscription.js` instead of `nai-settings.js`

## Phase 2: Delete standalone orphaned files
> Remove the 3 files that are entirely dedicated to defunct APIs.

### Task 2.1: Delete kai-settings.js, nai-settings.js, horde.js
- [x] **Done**
- **Goal:** Remove `public/scripts/kai-settings.js`, `public/scripts/nai-settings.js`, `public/scripts/horde.js`
- **Use:** `git rm`
- **Proof:** `ls public/scripts/kai-settings.js public/scripts/nai-settings.js public/scripts/horde.js` returns "No such file" for all 3
- **Doc IDs:** none
- **Not in Scope:** Cleaning references in other files (Phase 3-5)
- **References:** design.md Phase 1
- **PM Check:**
  - [x] Action: `ls public/scripts/kai-settings.js public/scripts/nai-settings.js public/scripts/horde.js 2>&1`
  - [x] Expected: All 3 files report "No such file or directory"

## Phase 3: Remove orphaned HTML blocks from index.html
> ~800 lines of dead UI for Kobold/Novel presets, sampling parameters, and streaming toggles.

### Task 3.1: Remove Kobold and Novel preset blocks
- [x] **Done**
- **Goal:** Remove `#kobold_api-presets` (lines 88-126) and `#novel_api-presets` (lines 127-168)
- **Use:** Edit tool on `public/index.html`
- **Proof:** `grep -n "kobold_api-presets\|novel_api-presets" public/index.html` returns zero results
- **Doc IDs:** none
- **Not in Scope:** Removing OpenAI preset block
- **References:** design.md Phase 2
- **PM Check:**
  - [x] Action: `grep -n "kobold_api-presets\|novel_api-presets" public/index.html`
  - [x] Expected: No matches

### Task 3.2: Remove common-gen-settings-block
- [x] **Done**
- **Goal:** Remove `#common-gen-settings-block` (lines 214-273) containing Response Length slider, Context Size slider, streaming toggles, and AI Module selector
- **Use:** Edit tool on `public/index.html`
- **Proof:** `grep -n "common-gen-settings-block\|streaming_kobold_block\|streaming_novel_block\|ai_module_block_novel" public/index.html` returns zero results
- **Doc IDs:** none
- **Not in Scope:** Removing Chat Completion context/response controls
- **References:** design.md Phase 2
- **PM Check:**
  - [x] Action: `grep -n "common-gen-settings-block\|streaming_kobold\|streaming_novel\|ai_module_block_novel" public/index.html`
  - [x] Expected: No matches

### Task 3.3: Remove Novel sampling parameters block
- [x] **Done**
- **Goal:** Remove `#range_block_novel` (lines 279-567) and the dead HTML comment (lines 275-278)
- **Use:** Edit tool on `public/index.html`
- **Proof:** `grep -n "range_block_novel" public/index.html` returns zero results
- **Doc IDs:** none
- **Not in Scope:** Removing OpenAI sampling parameters
- **References:** design.md Phase 2
- **PM Check:**
  - [x] Action: `grep -n "range_block_novel" public/index.html`
  - [x] Expected: No matches

### Task 3.4: Remove Kobold and Novel settings blocks
- [x] **Done**
- **Goal:** Remove `#kobold_api-settings` (lines 916-1095) and `#novel_api-settings` (lines 1096-1153)
- **Use:** Edit tool on `public/index.html`
- **Proof:** `grep -n "kobold_api-settings\|novel_api-settings" public/index.html` returns zero results
- **Doc IDs:** none
- **Not in Scope:** Removing `#openai_settings` block
- **References:** design.md Phase 2
- **PM Check:**
  - [x] Action: `grep -n "kobold_api-settings\|novel_api-settings" public/index.html`
  - [x] Expected: No matches

## Phase 4: Clean shared JavaScript files
> Remove imports, exports, and inline references to deleted Kobold/Novel/Horde modules.

### Task 4.1: Clean script.js
- [x] **Done**
- **Goal:** Remove all imports of `kai_settings`, `loadKoboldSettings`, `koboldai_settings`, `koboldai_setting_names`, `loadNovelSettings`, `nai_settings`, `novelai_settings`, `novelai_setting_names`, `horde_settings` from `public/script.js`. Remove re-exports. Remove inline references: Kobold/Novel streaming checks in `isStreamingEnabled()`, `adjustNovelInstructionPrompt()` calls, Kobold/Novel preset lookups, Horde adjustments, Novel preamble substitution, `loadKoboldSettings()`/`loadNovelSettings()` calls, `#streaming_kobold_block`/`#streaming_novel_block` UI references.
- **Use:** Edit tool on `public/script.js`
- **Proof:** `grep -n "kai_settings\|koboldai_settings\|nai_settings\|novelai_settings\|horde_settings\|loadKoboldSettings\|loadNovelSettings\|streaming_kobold\|streaming_novel\|adjustNovelInstruction" public/script.js` returns zero results
- **Doc IDs:** none
- **Not in Scope:** Removing `amount_gen`, `max_context`, `main_api` variables
- **References:** design.md Phase 3
- **PM Check:**
  - [x] Action: `grep -c "kai_settings\|koboldai_settings\|nai_settings\|novelai_settings\|horde_settings" public/script.js`
  - [x] Expected: 0 matches

### Task 4.2: Clean preset-manager.js
- [x] **Done**
- **Goal:** Remove Kobold/Novel imports, `'koboldhorde'` normalization, `case 'koboldhorde'`/`case 'kobold'`/`case 'novel'` in `getPresetList()`, `'streaming_novel'`/`'streaming_kobold'` from `filteredKeys`
- **Use:** Edit tool on `public/scripts/preset-manager.js`
- **Proof:** `grep -n "koboldai\|novelai\|nai_settings\|koboldhorde\|streaming_novel\|streaming_kobold" public/scripts/preset-manager.js` returns zero results
- **Doc IDs:** none
- **Not in Scope:** Modifying PresetManager class behavior
- **References:** design.md Phase 4
- **PM Check:**
  - [x] Action: `grep -c "koboldai_settings\|novelai_settings\|nai_settings" public/scripts/preset-manager.js`
  - [x] Expected: 0 matches

### Task 4.3: Clean RossAscends-mods.js, tokenizers.js, slash-commands.js
- [x] **Done**
- **Goal:** Remove `kai_settings`/`kai_flags` imports and Kobold/Novel switch cases from `RossAscends-mods.js`, `tokenizers.js`, `slash-commands.js`
- **Use:** Edit tool on each file
- **Proof:** `grep -rn "kai_settings\|kai_flags" public/scripts/RossAscends-mods.js public/scripts/tokenizers.js public/scripts/slash-commands.js` returns zero results
- **Doc IDs:** none
- **Not in Scope:** Modifying shared utility behavior
- **References:** design.md Phase 5
- **PM Check:**
  - [x] Action: `grep -c "kai_settings\|kai_flags" public/scripts/RossAscends-mods.js public/scripts/tokenizers.js public/scripts/slash-commands.js`
  - [x] Expected: 0 matches in each file

## Phase 5: Verification
> Confirm the build passes and no dangling references remain.

### Task 5.1: Full grep sweep and build check
- [x] **Done**
- **Goal:** Confirm zero remaining references to deleted modules across the entire `public/scripts/` directory, and that the application loads without console errors
- **Use:** Grep + browser console check
- **Proof:** `grep -rn "kai-settings\|nai-settings\|horde\.js\|kai_settings\|koboldai_settings\|novelai_settings\|nai_settings\|horde_settings" public/scripts/ --include="*.js" | grep -v "novelai-subscription"` returns zero results
- **Doc IDs:** none
- **Not in Scope:** Performance testing
- **References:** design.md Verification
- **PM Check:**
  - [x] Action: Run the grep command above
  - [x] Expected: Zero matches (excluding novelai-subscription.js)
  - [ ] Action: Load app in browser, select each API source (OpenAI, Claude, Google), verify settings panel renders correctly
  - [ ] Expected: No console errors referencing deleted modules or DOM IDs
