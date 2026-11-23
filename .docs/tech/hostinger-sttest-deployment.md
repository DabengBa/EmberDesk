---
description: "Hostinger sttest runbook for deploying EmberDesk from dev, verifying the Compose service, and rolling back."
kind: technical
topic: hostinger-sttest-deployment
---

# Hostinger Sttest Deployment

## Module Responsibility

`sttest` is the shared EmberDesk test deployment. The same Hostinger host
also runs [upstream SillyTavern at `st`](hostinger-st-deployment.md), with
separate Compose configuration and persistent mounts.

Related docs:

- [pnpm-workflow.md](pnpm-workflow.md) - local package manager, runtime, and Docker install contract
- [server-startup-orchestration.md](server-startup-orchestration.md) - server boot phases after the container starts
- [config-resolution.md](config-resolution.md) - config and data-root resolution consumed by the deployed server

## Architecture And Constraints

The sttest environment is a shared remote test target, not a source of canonical project data.

- Public URL: `https://sttest.tanyaleoallen.online/`
- GoDoxy upstream: `http://127.0.0.1:8001`
- Expected route behavior: `/` redirects to `/login`; `/login` returns `200`.
- Remote app path: `/opt/emberdesk-test`
- Checkout branch: `dev`, tracking `origin/dev`
- Remote revision marker: `/opt/emberdesk-test/.deploy-revision`
- Host-local Docker Compose file: `/opt/emberdesk-test/deploy/docker-compose.yml` (not tracked in this repo)
- Compose project: `emberdesk-test`
- Compose service and container: `emberdesk-test`
- Image tag: `emberdesk-test:local`
- Port mapping: `127.0.0.1:8001:8000`
- Container healthcheck: `node src/healthcheck.ts`
- Container startup: `node server.js --listen` via `docker/docker-entrypoint.sh`, not the package CLI bin

Use the SSH alias `vps-kl` for Git and Docker operations. The alias connects
as root; Git commands need `-c safe.directory=/opt/emberdesk-test` because
the checkout is owned by uid 1002.

Do not document or commit private key material, credentials, cookies, session tokens, exported browser storage, or remote config secrets.

Persistent state is mounted outside the application checkout:

- `/www/server/panel/data/compose/emberdesk-test/config:/home/node/app/config`
- `/www/server/panel/data/compose/emberdesk-test/data:/home/node/app/data`
- `/www/server/panel/data/compose/emberdesk-test/plugins:/home/node/app/plugins`
- `/www/server/panel/data/compose/emberdesk-test/extensions:/home/node/app/public/scripts/extensions/third-party`

Keep these mounts intact. The Git checkout and rebuilt image are replaceable; config, user data, plugins, and third-party extensions are not.

## Core Implementation

### Process Summary

Deploy a merged `origin/dev` revision. Fast-forward the host checkout,
rebuild the Compose service, record `.deploy-revision`, and verify container
health and public HTTPS. Deployment does not use a separate `sttest` branch.

### Remote Deploy

Git work runs as root on `vps-kl`; the checkout is owned by uid 1002, so pass `-c safe.directory=/opt/emberdesk-test` (or use `git -C` with the flag) on every Git command.

```bash
ssh vps-kl 'cd /opt/emberdesk-test && git -c safe.directory="$PWD" switch dev && git -c safe.directory="$PWD" pull --ff-only origin dev && git -c safe.directory="$PWD" rev-parse HEAD'
```

Rebuild and restart the container as root. The image build runs dependency
installation and several frontend builds, so the local SSH command must allow
at least five minutes for a cold build:

```bash
timeout 300s ssh vps-kl "cd /opt/emberdesk-test/deploy && docker compose up -d --build"
```

`timeout 300s` applies to the local deployment command, not to Docker's
internal build steps. If it expires, treat the deployment as indeterminate:
check `docker ps`, the container health status, and the build output before
retrying with a longer operator timeout. Do not assume that a client-side SSH
timeout means the Docker build failed.

Record the deployed revision:

```bash
ssh vps-kl "git -c safe.directory=/opt/emberdesk-test -C /opt/emberdesk-test rev-parse HEAD > /opt/emberdesk-test/.deploy-revision && cat /opt/emberdesk-test/.deploy-revision"
```

### Verification

Check the container status:

```bash
ssh vps-kl 'docker ps --filter name=emberdesk-test --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"'
ssh vps-kl 'docker inspect --format "{{.State.Health.Status}} {{.Image}}" emberdesk-test'
ssh vps-kl 'git -c safe.directory=/opt/emberdesk-test -C /opt/emberdesk-test rev-parse HEAD && cat /opt/emberdesk-test/.deploy-revision'
```

Check the public HTTP surface:

```bash
curl -sS -D - -o /dev/null --max-time 15 https://sttest.tanyaleoallen.online/
curl -sS -D - -o /dev/null --max-time 15 https://sttest.tanyaleoallen.online/login
```

On 2026-11-23, the container was healthy and the deployed marker matched
the checkout at `04aaff36fe03d8cb88637bce96b9654877f0c7ed`. Public `/`
returned `302` to `/login`, and `/login` returned `200`. The legacy HTML
paths `/index.html`, `/setup.html`, and `/login.html` returned `302` to
`/`, `/setup`, and `/login`, respectively. An unauthenticated API `403`
does not establish whether the corresponding route is registered.

### Rollback

Prefer rolling back to a known-good commit and rebuilding rather than using destructive resets.

```bash
ssh vps-kl 'cd /opt/emberdesk-test && git -c safe.directory="$PWD" fetch origin dev && git -c safe.directory="$PWD" switch --detach KNOWN_GOOD_SHA'
timeout 300s ssh vps-kl "cd /opt/emberdesk-test/deploy && docker compose up -d --build"
ssh vps-kl "git -c safe.directory=/opt/emberdesk-test -C /opt/emberdesk-test rev-parse HEAD > /opt/emberdesk-test/.deploy-revision && cat /opt/emberdesk-test/.deploy-revision"
```

After rollback, repeat the container health and public HTTP checks. If the rollback commit should become the branch tip, make that branch update explicitly from the local repo and document why.

## Operational Notes

- `listen`/private request filter warnings and untrusted-host log entries have appeared in the sttest logs while the service remained healthy. Treat these as existing runtime configuration warnings; do not disable CSRF, host checks, whitelist behavior, or SSRF protection as a convenience fix.
- If root needs to read Git metadata in `/opt/emberdesk-test`, use `git -c safe.directory=/opt/emberdesk-test -C /opt/emberdesk-test ...` to avoid Git dubious-ownership failures.
- `.deploy-revision` is a remote-local operational marker and is ignored by Git. Do not commit it.
- In PowerShell, wrap remote shell scripts in single quotes when they include `$()`, shell variables, or command substitutions. Double-quoted PowerShell strings can interpolate those characters before SSH receives the command.
- Keep Docker rebuilds rooted at `/opt/emberdesk-test/deploy`; the application checkout itself is one directory above the compose file.

## Related Semantic IDs And Code Binding Points

This deployment runbook has no owning semantic product ID. Related user-facing surfaces are documented separately in `.docs/db` when their behavior changes.

Operational binding points:

- `Dockerfile` - production image build and pnpm install behavior
- `pnpm run build:lib` - Vite browser library precompile during image build
- `src/healthcheck.ts` - container healthcheck entry point
- `server.js` - deployed process entry point
- `src/server-main.ts` - server boot orchestration inside the container
