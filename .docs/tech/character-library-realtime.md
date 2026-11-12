---
description: "Character library commit hints, refresh ordering, availability and stream lifecycle."
kind: technical
topic: character-library-realtime
code:
  paths:
    - src/character-library-change-observer.js
    - src/endpoints/character-library-events.js
    - src/endpoints/character-read-service.js
    - public/script.js
    - public/scripts/BulkEditOverlay.js
---

# Character Library Realtime

The [Character Library Panel](../db/features/character-library-panel.md) owns the user-visible contract. This document owns its refresh and observation boundary; canonical chat-stat transaction rules live in the [storage roadmap](canonical-sqlite-storage-roadmap.md#phase-4-chat-stats-authority).

## Observation and transport

Authenticated `GET /api/characters/events` subscribes using the current user's database path, not a client-provided identity. A shared read-only connection per database polls SQLite `PRAGMA data_version` every second. It performs no migration, audit, initialization, or business write. The baseline and subscription are established before `ready`; changed versions produce `invalidate`. Both carry empty objects: they are coarse hints, not a change log, revision, event ID, replay, or a guarantee of one event per transaction. Unrelated writes can notify, commits can coalesce, and separate transactions can expose intermediate states.

Streams have 15-second heartbeats and limits of eight per database and 256 per process. The whole observer group expires after 60 seconds, even if tabs join later, so reconnection reopens the current file and repeats authentication. Logout or disablement does not immediately revoke an existing stream; it can receive only data-free hints until the group expires. Slow consumers and observer errors close streams. A limit returns 429 and an unavailable database returns 503 before SSE headers. Shutdown disposes the observers.

## Refresh and availability

On `ready` (including reconnect) and `invalidate`, the client reads the full list, reapplies the current filtering and sorting, and serializes refreshes. A change during a read schedules a trailing read. Failed background reads retain the list and retry; terminal streams are reopened after a delay. Automatic refresh defers while bulk selection or its tag operations are active, including a selection transition or a read already in flight, and catches up when idle. Publishing resolves the active character by avatar at the commit boundary; if it disappeared the user is prompted before reload.

`POST /api/characters/all`, `/list`, and `/get` return 503 with a safe `canonical_storage_unavailable` classification when the canonical backend is known to be unavailable, including when canonical storage is disabled. A readable empty library returns an empty list and a missing character returns 404. Other unexpected failures need not be classified as 503. Ordinary list reads still perform their existing initialization and audit, unlike the observer.

## Evidence

Implementation: `src/character-library-change-observer.js`, `src/endpoints/character-library-events.js`, `src/endpoints/characters.js`, `src/endpoints/character-read-service.js`, `public/script.js`, and `public/scripts/BulkEditOverlay.js`. Focused regression coverage is in `tests/character-library-change-observer.test.js`, `tests/character-library-events.test.js`, `tests/character-library-read-availability.test.js`, and `tests/character-library-realtime.e2e.js`.
