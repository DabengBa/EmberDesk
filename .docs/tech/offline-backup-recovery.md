---
description: "Operator assertions, writer-stop requirements, configuration scope, and export limits for offline full data-root backups and isolated restores."
kind: technical
topic: backup-recovery
id: QUIRK-OFFLINE-BACKUP-CONFIRM-STOPPED
external_service: filesystem-sqlite-backup
verified_date: 2026-11-26
---

# Offline Backup Confirm-Stopped Quirk

## Symptom

`--confirm-stopped` is an operator assertion, not a process check. A complete `DATA_ROOT` backup includes SQLite databases with their WAL/SHM files and keys, but configuration stored outside the data root is not copied automatically. A user ZIP export is not a complete site recovery copy.

## Invariant Action

Stop EmberDesk and every writer before backup or restore; save configuration that lives outside the data root separately, and explicitly include keys with `--include-keys` when the backup must be complete. Restore into an isolated directory and verify there before using the copy; treat user ZIP files as exports only. Commands and procedure are in [the offline backup skill](../../.agents/skills/emberdesk-offline-backup/SKILL.md).
