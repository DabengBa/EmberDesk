# Canonical Chat Stats Authority Processing Flow

## Metadata

- Owner: canonical chat-stats authority documentation
- Current code binding:
  - `src/endpoints/chats.js`
  - `src/endpoints/character-file-snapshot.js`
  - `src/endpoints/character-read-service.js`
  - `src/canonical-sqlite-operator.js`
  - `src/canonical-sqlite-shadow-import.js`
  - `tests/interaction-performance-index.test.js`
- Related tech docs:
  - [.docs/tech/canonical-sqlite-storage-roadmap.md](../tech/canonical-sqlite-storage-roadmap.md)
  - [.docs/adr/0011-canonical-per-user-sqlite-storage.md](../adr/0011-canonical-per-user-sqlite-storage.md)
- Related semantic docs:
  - [.docs/db/pages/chat-workspace.md](../db/pages/chat-workspace.md)
  - [.docs/db/features/character-library-panel.md](../db/features/character-library-panel.md)

## Goals And Non-Goals

Goals:

- Document the current mixed-mode rules for character chat-stat updates after chat save, rename, delete, and import.
- Make the rollout boundary reproducible where canonical chat-stats writes and file-backed fallback reads can both be active in the same runtime.
- Record when canonical audit state is invalidated, when file-backed fallback reads recompute chat summaries from JSONL files, and when repair tooling must rebuild stats from JSONL files.

Non-goals:

- Describe chat message rendering, search, recent-chat query semantics, or group-chat storage.
- Replace the canonical SQLite roadmap or operator tech docs.
- Define a public operator API beyond the current documented repair path.

## Input Discovery And Parsing Rules

Inputs:

- `avatar`: the character avatar filename supplied by a character-chat save, rename, delete, or import route.
- `operation`: one of the character-chat mutation labels such as `chat save`, `chat rename`, `chat delete`, or `chat import`.
- `featureFlags`: the current canonical SQLite flag snapshot, especially `enabled`, `reads`, `chatStats`, and `strict`.
- `storageStatus`: canonical SQLite runtime status, including unsupported and `migration_blocked` cases.
- `directories`: user directories used to find character chat JSONL files.
- `characterChatDirectory`: the chat directory derived from the avatar filename.
- `chatFiles`: the JSONL files currently present for that character.
- `persistedAuditStatus`: the stored canonical audit summary used by DB-first reads.
- `rebuildRequestedAvatars`: optional explicit avatar filter passed to the repair path.

Valid character-chat mutations require a non-empty avatar filename. Missing avatar means the chat-stat maintenance path does nothing.

## Outputs

The processing outputs are:

- `fileBackedChatStatsFallback`: whether visible fallback reads still derive chat summaries from current JSONL files instead of canonical `character_chat_stats`.
- `canonicalChatStatsUpsert`: whether the canonical `character_chat_stats` row was recalculated and written from JSONL files.
- `canonicalChatStatsSyncError`: the named failure reason surfaced when canonical chat-stats authority is enabled but the canonical sync cannot complete.
- `canonicalAuditInvalidation`: whether the persisted canonical audit summary was invalidated and which reason code was used.
- `canonicalReadChatStatsAuthority`: whether DB-first reads are currently allowed to inject canonical `chat_size` / `date_last_chat`.
- `chatStatsRebuildResult`: the per-avatar stats produced by the operator `rebuild-chat-stats` path.

## Staged Processing Flow

### Handle missing avatar

1. `syncCanonicalChatStatsAfterCharacterChatMutation()` returns immediately when the route does not provide an avatar filename.
2. No canonical write, audit invalidation, or fallback-read maintenance is attempted in this case.

### Keep file-backed fallback independent

1. Character chat mutations do not refresh or dirty-mark `_cache/character-index.sqlite`.
2. File-backed `/api/characters/*` fallback reads derive `chat_size` and `date_last_chat` from current JSONL files through the character file snapshot path.
3. If canonical reads are blocked, disabled, or audit-stale, visible chat summaries remain recoverable from compatibility files without requiring a derived sidecar maintenance step.

### Canonical authority disabled for chat stats

1. If `featureFlags.enabled` is false, stop after the chat file mutation; file-backed reads remain the visible summary owner.
2. If canonical storage is enabled but `featureFlags.chatStats` is false, do not write `character_chat_stats`.
3. In that non-authority mode, try to invalidate the persisted canonical audit summary with reason `audit_stale_after_chat_stats_change`.
4. Skip the invalidation quietly when canonical storage is unsupported, migration-blocked, or the canonical DB cannot be opened.

This preserves a fail-closed read boundary: if file-backed chat files changed while canonical chat-stats authority is still off, later canonical reads must re-audit before they can claim clean authority again.

### Canonical authority enabled for chat stats

1. If both `featureFlags.enabled` and `featureFlags.chatStats` are true, attempt the canonical chat-stats update after the route's file-backed mutation succeeds.
2. Resolve canonical storage status and fail with a named sync error when canonical SQLite is unsupported or migration-blocked.
3. Open the canonical DB and run migrations; failure to open or migrate also becomes a named sync error.
4. Recompute `chatCount`, `chatSize`, and `dateLastChat` from the current character chat directory on disk.
5. Run a canonical transaction that upserts `character_chat_stats` by joining the avatar filename to the live `characters` row.
6. If no live character row matches the avatar filename, fail with `canonical_character_missing`.
7. On success, return without invalidating the canonical audit summary.

The current authority write is derived from JSONL file state after the route side effect has already succeeded. Chat message bodies remain JSONL files even in this mode.

### Canonical authority enabled but sync fails

1. If the canonical chat-stats upsert path throws any named sync error, invalidate the persisted canonical audit summary with reason `audit_stale_after_chat_stats_sync_failure`.
2. Log the sync failure and keep the already-completed file-backed chat mutation result as the route outcome instead of turning the save, rename, delete, or import into a user-visible error.
3. Do not report that path as a clean canonical success; the persisted audit summary remains blocking until a later audit or repair re-establishes trust.

This prevents later DB-first reads from continuing to treat stale canonical chat stats as proven-clean authority after a failed post-mutation sync, while preserving EmberDesk's file-backed chat truth when the shadow sync cannot attach to a live canonical row.

### Decide whether reads may use canonical chat stats

1. DB-first reads begin only when canonical storage is enabled and `features.storage.canonicalSqlite.reads` is true.
2. Unsupported runtime, migration-blocked DB, missing DB, and blocking audit summary each force the read path back to file-backed behavior.
3. Even with DB-first reads enabled, canonical `chat_size` and `date_last_chat` are injected only when `features.storage.canonicalSqlite.chatStats` is also true.
4. When any of those conditions fail, file-backed reads continue to own the visible chat summary fields and recompute them from compatibility JSONL files.

### Rebuild canonical chat stats from JSONL files

1. The operator `rebuild-chat-stats` path lists live canonical characters from the DB.
2. It optionally filters to explicit avatar filenames when the operator requested a subset.
3. For each selected character, it rescans the current JSONL chat directory and upserts `character_chat_stats` inside one canonical transaction.
4. After the rebuild completes, it invalidates the persisted canonical audit summary with reason `audit_stale_after_chat_stats_rebuild`.
5. The rebuild result reports the recalculated per-avatar totals and timestamps.

## Key Rules

- The retired derived character index is not part of the correctness path for visible fallback reads.
- Canonical chat-stats writes and canonical chat-stats reads are separate rollout boundaries.
- Canonical chat-stats authority does not move chat message bodies into SQLite.
- Group chats stay outside character chat-stats authority.
- Canonical sync failure after a chat mutation must stale the persisted audit summary before the error returns.
- Repair rebuild is explicit operator work; out-of-band JSONL edits do not silently re-authorize canonical rows.

## Output Schema

```json
{
  "fileBackedChatStatsFallback": {
    "available": true,
    "source": "jsonl"
  },
  "canonicalChatStatsUpsert": {
    "attempted": true,
    "ok": true,
    "chatCount": 1,
    "chatSizeBytes": 123,
    "dateLastChatMs": 1700000000000
  },
  "canonicalChatStatsSyncError": null,
  "canonicalAuditInvalidation": {
    "performed": false,
    "reason": null
  },
  "canonicalReadChatStatsAuthority": {
    "readsEnabled": true,
    "chatStatsEnabled": true,
    "auditBlocking": false,
    "includeChatStats": true
  },
  "chatStatsRebuildResult": {
    "ok": true,
    "rebuilt": [
      {
        "avatarFilename": "alpha.png",
        "chatCount": 1,
        "chatSizeBytes": 123,
        "dateLastChatMs": 1700000000000
      }
    ]
  }
}
```

## Sandbox Verification

Run:

```bash
uv run python .docs/logic-description/canonical_chat_stats_authority_sandbox_proof.py
```

The proof script embeds fake file-backed stats, canonical flag states, and audit-invalidating side effects. It covers the no-avatar fast path, file-backed fallback freshness without sidecar dirty-marking, canonical disabled-but-storage-enabled audit invalidation, canonical authority success, canonical authority failure with stale-audit invalidation, read-authority gating, and rebuild-triggered audit invalidation.

## Boundaries And Failure Modes

- If file-backed fallback reads stop deriving chat summaries from current JSONL files before canonical reads are audit-clean, users can see stale last-chat summary metadata even though the chat mutation already succeeded.
- If canonical chat-stats sync fails without invalidating the persisted audit summary, later DB-first reads can keep exposing stale canonical rows as if they were clean.
- If the canonical `characters` row is missing for an avatar, chat-stat authority must fail rather than silently inventing a detached stats row.
- If rebuild runs after out-of-band file edits, the audit summary becomes stale again until the next explicit audit confirms parity.
