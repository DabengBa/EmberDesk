---
name: emberdesk-offline-backup
description: "Create a complete offline DATA_ROOT backup or restore it into an isolated directory, including writer shutdown, key inclusion, out-of-root configuration, and isolated verification."
---

# EmberDesk offline backup

## Trigger

Use this skill for complete offline `DATA_ROOT` backups and isolated restores. User ZIP exports are a different operation.

## Steps

1. Stop EmberDesk and every process that can write to the data root.
2. Run `node scripts/offline-backup.mjs backup --source ... --destination ... --confirm-stopped --include-keys`. The destination directory must not exist, and its parent directory must already exist.
3. Save any configuration located outside the data root separately; it is not included by the backup.
4. Run a `restore` into a new isolated directory that does not already exist.
5. Start the isolated instance with `--dataRoot` pointing at the restored directory and verify it there.

## Boundaries

- `--confirm-stopped` is an operator assertion, not a process check; writers must actually be stopped.
- A user ZIP is an export, not a complete recovery copy.
- `secrets.json` lives in the base folder, not under `/public/`; when updating, do not copy the entire `/public/` folder.
- A complete backup includes keys; store it securely and do not commit credentials or secret values.
- Read the `--confirm-stopped` and backup-scope quirk from [offline-backup-recovery.md](../../../.docs/tech/offline-backup-recovery.md).
