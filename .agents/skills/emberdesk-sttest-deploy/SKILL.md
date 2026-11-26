---
name: emberdesk-sttest-deploy
description: "Deploy or roll back the EmberDesk sttest environment from origin/dev on the Hostinger host, including cold Docker builds, health and revision checks, and boundary rules for credentials and persistent state."
---

# EmberDesk sttest deploy

## Trigger

Use this skill when deploying or rolling back the EmberDesk sttest environment.

## Steps

1. Confirm the `origin/dev` revision to deploy and record the currently deployed revision as the rollback target.
2. Over SSH to `vps-kl`, fast-forward the checkout to that revision and run `docker compose up -d --build`. A cold build takes at least five minutes; read the SSH timeout quirk in [the hostinger sttest quirk](../../../.docs/tech/hostinger-sttest-deployment.md) before treating a client timeout as failure.
3. Poll container health and the deployed revision, then verify the public HTTPS endpoint.
4. To roll back, return to the recorded previous revision and rebuild; repeat step 3.

## Boundaries

- Do not commit or transmit private keys, credentials, cookies, session tokens, exported browser storage, or remote configuration secrets.
- Persistent mounts are state, not replaceable resources; never delete or repoint them as part of a deploy or rollback.
- Read host aliases, paths, Compose identifiers, mounts, and public URLs from [environment.md](references/environment.md).
- Read the SSH cold-build timeout quirk from [hostinger-sttest-deployment.md](../../../.docs/tech/hostinger-sttest-deployment.md).
