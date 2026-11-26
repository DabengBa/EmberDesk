---
description: "Remote SSH client timeout behavior during cold Docker builds on the Hostinger sttest deployment target."
kind: technical
topic: hostinger-sttest-deployment
id: QUIRK-SSH-COLD-BUILD-TIMEOUT
external_service: hostinger-ssh-docker-compose
verified_date: 2026-11-23
---

# SSH Cold-Build Timeout Quirk

## Symptom

An SSH client timeout during a cold Docker build does not prove that the remote build failed. The remote Compose operation may still be running; retrying the build blindly starts duplicate builds. Environment details, mounts, and deploy steps belong to the `emberdesk-sttest-deploy` skill's `references/environment.md`.

## Invariant Action

Allow local SSH commands at least five minutes for a cold build, or poll the remote container health and deployed revision instead. MUST NOT treat a client-side SSH timeout as a remote build failure; determine the remote state before deciding whether to retry.
