# Character List Compact Toolbar Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

**Goal:** Make the character list toolbar read as a compact default two-row control surface while keeping character-row DOM compatibility and making ordinary character badges visually quiet.

**Source of Truth:** `design.md`

**Doc ID Scope:** `feature.character_library_panel`

---

## Phase 1: Guard The Existing Contracts
> This phase locks the expected toolbar layout and badge visibility before changing CSS so the slice stays narrow and compatibility-sensitive.

### Task 1.1: Add compact-toolbar and badge structure proofs
- [x] **Done**
- **Goal:** Extend `tests/character-list-structure.test.js` so it proves the toolbar has an explicit two-row layout contract, the four existing groups remain wired, ordinary character badges stay in the DOM but are visually quiet, and group badges remain visible.
- **Use:** Jest structure tests over `public/style.css`, `public/index.html`, and `public/script.js`.
- **Proof:** `bun run --cwd tests test:unit -- character-list-structure.test.js --runInBand` failed before the CSS change on the missing grid two-row contract, then passed after the implementation with 9 tests.
- **Doc IDs:** `feature.character_library_panel`
- **Not in Scope:** Browser screenshot validation or changing toolbar behavior.
- **References:** `design.md` sections "边界规则 / 验收", "推荐布局机制", and `tests/character-list-structure.test.js`.
- **PM Check:**
  - [x] Action: Read the updated test names and assertions.
  - [x] Expected: Tests explicitly name two-row toolbar placement, preserved character badge DOM, hidden/quiet character badge styling, and visible group badge styling.

## Phase 2: Implement The Visual Slice
> This phase changes only the existing CSS layout and badge treatment; DOM order, IDs, classes, and event wiring stay intact.

### Task 2.1: Convert the character toolbar to a compact two-row layout
- [x] **Done**
- **Goal:** Update `public/style.css` so `#rm_button_bar` lays out the create/sort row and view/bulk row predictably, keeps DOM order aligned with visual order, and preserves narrow-screen wrapping without hiding accessible names.
- **Use:** Existing `#rm_button_bar` groups in `public/index.html`; CSS grid/flex rules in `public/style.css`.
- **Proof:** `bun run --cwd tests test:unit -- character-list-structure.test.js --runInBand` passed with 9 tests; browser probe at `http://127.0.0.1:8010/` reported `gridTemplateAreas` as `"create sort" "view bulk"` at desktop width and `"create" "sort" "view" "bulk"` under the narrow breakpoint.
- **Doc IDs:** `feature.character_library_panel`
- **Not in Scope:** Moving toolbar DOM, changing search/filter behavior, or adding preferences.
- **References:** `design.md` sections "两行布局验收" and "架构 / 约束".
- **PM Check:**
  - [x] Action: Open the character list toolbar at a normal drawer width.
  - [x] Expected: Row 1 contains Create/Import/Import URL/Group plus Sort; row 2 contains Search/Grid/Bulk Edit plus visible bulk status actions when bulk mode is active.

### Task 2.2: Quiet ordinary character badges while keeping group badges visible
- [x] **Done**
- **Goal:** Update `public/style.css` so `.character_type_badge` is visually hidden or extremely de-emphasized while the DOM node remains, and `.group_type_badge` remains visible for mixed character/group lists.
- **Use:** Existing `.entity_type_badge`, `.character_type_badge`, and `.group_type_badge` selectors.
- **Proof:** `bun run --cwd tests test:unit -- character-list-structure.test.js --runInBand` passed with explicit badge CSS assertions; browser probe reported character badge `display: none` and group badge `display: flex`.
- **Doc IDs:** `feature.character_library_panel`
- **Not in Scope:** Removing badge markup, changing `data-i18n`, or changing tag rendering.
- **References:** `design.md` sections "类型标识验收" and "推荐类型 badge 机制".
- **PM Check:**
  - [x] Action: Inspect generated character and group rows.
  - [x] Expected: Character rows still contain the Character badge node but it is not prominent; group rows still show the Group badge.

## Phase 3: Compatibility, Documentation, And Validation
> This phase updates the owning semantic doc and runs the compatibility gates named in the design.

### Task 3.1: Update the character library semantic doc
- [x] **Done**
- **Goal:** Update `.docs/db/features/character-library-panel.md` with the user-visible toolbar grouping and badge hierarchy rules.
- **Use:** Existing semantic ID `feature.character_library_panel`.
- **Proof:** `bun run docs:build` built 22 semantic docs; `bun run docs:check` validated 22 semantic docs.
- **Doc IDs:** `feature.character_library_panel`
- **Not in Scope:** Adding a new semantic ID or duplicating implementation internals in semantic docs.
- **References:** `design.md` section "Doc ID 契约" and `.docs/db/features/character-library-panel.md`.
- **PM Check:**
  - [x] Action: Read the updated `feature.character_library_panel` business rules.
  - [x] Expected: It describes the compact two-row toolbar and quiet character badge rule without documenting CSS internals.

### Task 3.2: Run focused compatibility and delivery validation
- [x] **Done**
- **Goal:** Prove the slice preserves character-list structure, third-party extension selectors, docs validity, and the repo compatibility gate.
- **Use:** Existing Bun scripts and Jest tests.
- **Proof:** `bun run --cwd tests test:unit -- character-list-structure.test.js --runInBand` passed; `bun run --cwd tests test:unit -- third-party-extension-compatibility.test.js --runInBand` passed; `bun run test:compat` passed; `bun run docs:check` passed.
- **Doc IDs:** `feature.character_library_panel`
- **Not in Scope:** Full E2E suite unless focused validation or review exposes a runtime-only risk.
- **References:** `design.md` section "验证".
- **PM Check:**
  - [x] Action: Review command output and the final diff.
  - [x] Expected: All focused tests and docs check pass; no character-list DOM identity selectors are removed or renamed.
