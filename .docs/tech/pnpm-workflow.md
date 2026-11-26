---
description: "pnpm workspace importer validation and platform-specific native dependency installation quirks that cannot be inferred from lockfiles alone."
kind: technical
topic: pnpm-workflow
id: QUIRK-PNPM-IMPORTER-DRY-RUN
external_service: pnpm-workspace
verified_date: 2026-11-05
---

# pnpm Importer Dry-Run Quirk

## Symptom

When the root workspace lockfile is missing `importers["tests"]`, a real frozen install from the `tests` package fails with `ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER`, because pnpm selects the workspace-root lockfile even though `tests` has its own lockfile. `pnpm install --frozen-lockfile --dry-run` can report success in the same state: the dry run does not exercise the importer validation that blocks the real install. Native dependencies such as `sharp` also install platform-specific artifacts: a dependency tree validated on one OS, CPU architecture, or C library does not prove it loads on the deployment target.

## Invariant Action

Validate the two package boundaries separately with real frozen installs for the root and `tests` packages, and report each result; MUST NOT accept `--dry-run`, an existing `tests/node_modules`, or an isolated-copy install as proof that the documented command works. Inspect the root workspace and lockfile importers when that boundary fails. Install and build native dependencies on the actual deployment target platform rather than reusing a tree produced on a different platform.
