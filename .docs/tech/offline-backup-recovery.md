---
description: Operational boundary for complete offline data-root backups, isolated restores, and the separate user ZIP export.
kind: technical
topic: backup-recovery
code:
  paths:
    - scripts/offline-backup.mjs
    - src/user-backup.ts
---

# Offline backup and recovery

`scripts/offline-backup.mjs` copies the entire `DATA_ROOT`, including account and session data, each user's canonical SQLite database and any WAL/SHM files, managed media, and other files in the tree. Configuration outside that tree must be saved separately. The copy contains secrets; SQLite does not encrypt them at rest. See the [operator instructions](../../docs/offline-backup-recovery.md) for commands and the data mapping.

Stop EmberDesk and all other writers before backup or restore; `--confirm-stopped` is an operator assertion, not a process check. Backup additionally requires `--include-keys`. Both operations require an existing destination parent, a new destination directory, and non-overlapping source and destination paths. Internal symbolic links are redirected into the copy; unresolved or external links cause an error. On copy failure the newly created destination is removed. Restore copies into a separate directory without replacing the source or an existing destination; an isolated instance can then use it as `--dataRoot`.

The user ZIP produced by `createBackupArchive` in `src/user-backup.ts` is a different export, not a complete site recovery copy. It omits the user's `storage` directory, `secrets.json`, and secret-migration backups; when a canonical database exists, it materializes non-secret character, world, settings, chat, managed-media and preset slices into the staged export. Settings and preset JSON copies are scrubbed of known credential fields; unparseable settings or preset JSON is omitted. Other staged user files and non-colliding symlinks are archived without following links. ZIP export does not change the existing `allowKeysExposure` behavior of other secret APIs.

Evidence: `tests/offline-backup-cli.test.js` exercises copying, WAL and path/link guards; `tests/offline-backup-restored-http.test.js` exercises the restored application; `tests/offline-backup-export.test.js` exercises canonical ZIP content, credential scrubbing and source preservation.
