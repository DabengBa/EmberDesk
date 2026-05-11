# Startup Character Summary Loading Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

**Goal:** Make workspace startup load the character library from a richer summary payload instead of the full-library payload, while preserving current search behavior and loading full character data only on demand.

**Source of Truth:** `design.md`

**Doc ID Scope:** `feature.startup_bootstrap`, `feature.character_library_panel`, `page.chat_workspace`, `term.character_card`

---

## Phase 1: Summary Contract
> Replace the startup character-list contract without changing canonical file-backed data or removing the existing full payload route.

### Task 1.1: Add startup summary route and richer shallow payload
- [ ] **Done**
- **Goal:** Add `POST /api/characters/list`, expand `toShallow()` with the current character-search text fields, and keep SQLite / filesystem paths able to build the same summary contract.
- **Use:** `src/endpoints/characters.js`, `src/endpoints/character-index.js`, existing shallow/full row builders, existing SQLite schema version handling
- **Proof:** targeted server tests covering summary route contract, upgraded `toShallow()` content, and SQLite rebuild compatibility
- **Doc IDs:** `feature.character_library_panel`, `term.character_card`
- **Not in Scope:** removing `/api/characters/all`, adding `search_json`, adding server-side search
- **References:** `design.md` sections `Architecture / Constraints`, `Data / Integrations`
- **PM Check:**
  - [ ] Action: hit the character list API in a test harness after seeding characters
  - [ ] Expected: the route returns summary rows containing search-needed text fields but excluding `json_data`, `data.character_book`, and large extension payloads

### Task 1.2: Preserve full-payload and rebuild behavior
- [ ] **Done**
- **Goal:** Keep `/api/characters/get` file-authoritative and ensure schema-version rebuild plus SQLite fallback still work when the richer `shallow_json` shape lands.
- **Use:** `src/endpoints/characters.js`, `src/endpoints/character-index.js`, existing rebuild/reset logic, existing world/chat freshness checks
- **Proof:** regression tests for schema bump rebuild and `/api/characters/get` correctness remain green after the summary contract change
- **Doc IDs:** `feature.startup_bootstrap`, `page.chat_workspace`
- **Not in Scope:** optimizing first-rebuild cost beyond correctness, changing `full_json` semantics
- **References:** `design.md` sections `Edge Rules / Acceptance`, `Upgrade / migration`
- **PM Check:**
  - [ ] Action: simulate an existing cache file from the previous schema and request the list/get routes
  - [ ] Expected: the first request rebuilds derived rows successfully and later requests serve the new summary contract without data loss

## Phase 2: Startup Switch And Deep-Reader Guardrails
> Move startup off `/api/characters/all` and make every full-only consumer explicit.

### Task 2.1: Switch startup and list refreshes to the summary route
- [ ] **Done**
- **Goal:** Update `getCharacters()` and the startup chain to use `/api/characters/list`, keep current list/group rendering behavior, and ensure startup only fetches one full character when the active card needs it.
- **Use:** `public/script.js`, `public/scripts/group-chats.js`, startup stage measurements, existing `unshallowCharacter()` / `getOneCharacter()` flow
- **Proof:** startup/browser-facing tests showing `getCharacters()` no longer depends on `/api/characters/all` and active-character reload still works
- **Doc IDs:** `feature.startup_bootstrap`, `feature.character_library_panel`, `page.chat_workspace`
- **Not in Scope:** virtualized rendering, search warmup, unrelated startup-stage reordering
- **References:** `design.md` sections `Intent & Core Flow`, `User-visible flow ordering`, `Verification`
- **PM Check:**
  - [ ] Action: reload the workspace once with no active character and once with an active character
  - [ ] Expected: startup reaches the usable shell from the summary route, and the active-character case performs at most one full character fetch

### Task 2.2: Audit and patch full-only character consumers
- [ ] **Done**
- **Goal:** Systematically patch internal readers of `json_data`, `data.character_book`, and other full-only fields so they unshallow before use or stay summary-safe.
- **Use:** `public/script.js`, `public/scripts/extensions.js`, `public/scripts/world-info.js`, search-based code search over `json_data` / `character_book`, existing `unshallowCharacter()` helper
- **Proof:** focused client tests or targeted regression tests for editor, extension-field write, and world-info consumers that now require full data
- **Doc IDs:** `feature.character_library_panel`, `page.chat_workspace`, `term.character_card`
- **Not in Scope:** broad refactors of extension architecture, rewriting search or world-info systems
- **References:** `design.md` section `Compatibility audit targets`
- **PM Check:**
  - [ ] Action: after a cold startup, open the character editor, use an extension field write path, and open a character-book consumer
  - [ ] Expected: each flow upgrades the row before touching full-only fields and no `undefined` deep-data errors appear

### Task 2.3: Keep client-side search working from summary rows
- [ ] **Done**
- **Goal:** Ensure `fuzzySearchCharacters()` continues to work immediately after startup using the richer summary rows already stored in `characters[]`.
- **Use:** `public/scripts/power-user.js`, `public/scripts/filters.js`, richer `toShallow()` output, existing tag lookup via `getTagsList(character.avatar)`
- **Proof:** tests proving the search path works from summary rows without a second route or warmup state
- **Doc IDs:** `feature.character_library_panel`
- **Not in Scope:** changing Fuse scoring, server-side search, search UX redesign
- **References:** `design.md` sections `Summary payload definition`, `Search-specific note`
- **PM Check:**
  - [ ] Action: search for characters immediately after startup using name and deep-text queries
  - [ ] Expected: results appear without waiting on extra search hydration and remain functionally equivalent to the previous behavior

## Phase 3: Verification And Documentation
> Lock the behavior with tests, update bound docs, and leave a clean feature record.

### Task 3.1: Regressions, performance proof, and stage evidence
- [ ] **Done**
- **Goal:** Add or update automated proof for the new summary route, startup critical path, search behavior, and deep-reader safety; then rerun targeted performance validation.
- **Use:** `tests/interaction-performance-index.test.js`, `tests/startup-critical-path.test.js`, existing startup-performance runner, targeted browser/perf artifacts
- **Proof:** targeted test commands and one startup-performance artifact showing the character stage no longer uses `/api/characters/all`
- **Doc IDs:** `feature.startup_bootstrap`, `feature.character_library_panel`, `page.chat_workspace`
- **Not in Scope:** broad benchmark suite redesign, unrelated interaction-perf scenarios
- **References:** `design.md` section `Verification`
- **PM Check:**
  - [ ] Action: run the startup performance check on the updated build
  - [ ] Expected: the critical path uses `/api/characters/list` and the `getCharacters` stage is materially lower than the previous full-payload baseline

### Task 3.2: Update semantic and technical docs, then wrap the feature
- [ ] **Done**
- **Goal:** Update bound docs and tech docs to reflect summary-first startup, on-demand full loads, and the preserved role of `/api/characters/get`, then prepare the archival feature log for wrap-up.
- **Use:** `.docs/db/features/startup-bootstrap.md`, `.docs/db/features/character-library-panel.md`, `.docs/db/pages/chat-workspace.md`, `.docs/db/terms/character-card.md`, `.docs/tech/interaction-performance-indexing.md`, `DEVLOG.md`
- **Proof:** doc diff plus any required doc validation that keeps Doc ID ownership and binding points coherent
- **Doc IDs:** `feature.startup_bootstrap`, `feature.character_library_panel`, `page.chat_workspace`, `term.character_card`
- **Not in Scope:** unrelated doc cleanup, repo-wide doc rewrites
- **References:** `design.md` section `Doc ID Contract`
- **PM Check:**
  - [ ] Action: read the updated docs for startup and character-library behavior
  - [ ] Expected: docs now describe summary-first startup, immediate search from summary rows, and on-demand full loading without contradicting the shipped behavior
