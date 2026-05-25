# Environments

> Shared runtime environments used while developing and validating EmberDesk.

## Test Server

`https://sttest.tanyaleoallen.cloud/` is the shared remote test server for EmberDesk validation.

Use it for:

- Browser smoke checks when a local server is not enough to reproduce a remote-only issue.
- Login and session-flow verification against the deployed test instance.
- Frontend rendering checks that depend on deployed assets, extension loading, or remote configuration.

Do not use it as:

- A production environment.
- The source of truth for code behavior when local source and tests disagree.
- A place to store secrets, credentials, or long-lived test-only data in project documentation.

## Handling Credentials

Credentials for the test server are intentionally not recorded in this repository. If a task needs access, get the credentials from the requester or an approved secret channel for that session only.

Do not commit passwords, session tokens, cookies, or exported browser storage.

## Validation Notes

- Prefer local automated tests for code-level regressions.
- Use the test server to confirm deployed behavior after local changes or when debugging remote-only rendering and configuration issues.
- Record durable findings in the owning docs under `docs/`; keep transient screenshots, traces, and browser notes out of permanent docs unless they explain a lasting operational constraint.
