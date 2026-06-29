# Hostinger Sttest Deployment

## Module Responsibility

This runbook documents the Hostinger-hosted sttest deployment for EmberDesk. It covers the local commit and push sequence, the remote Git update, Docker Compose rebuild, revision tracking, verification, rollback, and operational cautions for the shared test server.

Related docs:

- [bun-workflow.md](bun-workflow.md) - local package manager, runtime, and Docker install contract
- [server-startup-orchestration.md](server-startup-orchestration.md) - server boot phases after the container starts
- [config-resolution.md](config-resolution.md) - config and data-root resolution consumed by the deployed server

## Architecture And Constraints

The sttest environment is a shared remote test target, not a source of canonical project data.

- Public URL: `https://sttest.tanyaleoallen.cloud/`
- Expected route behavior: `/` redirects to `/login`; `/login` returns `HTTP/2 200`.
- Remote app path: `/opt/emberdesk-test`
- Remote revision marker: `/opt/emberdesk-test/.deploy-revision`
- Docker Compose file: `/opt/emberdesk-test/deploy/docker-compose.yml`
- Compose project: `emberdesk-test`
- Compose service and container: `emberdesk-test`
- Image tag: `emberdesk-test:local`
- Port mapping: `8001:8000`
- Container healthcheck: `node src/healthcheck.js`

Use the non-root SSH user for Git work and root only for Docker operations:

- `hostinger` - `hostops@31.97.210.149`
- `hostinger-root` - `root@31.97.210.149`

Do not document or commit private key material, credentials, cookies, session tokens, exported browser storage, or remote config secrets.

Persistent state is mounted outside the application checkout:

- `/www/server/panel/data/compose/emberdesk-test/config:/home/node/app/config`
- `/www/server/panel/data/compose/emberdesk-test/data:/home/node/app/data`
- `/www/server/panel/data/compose/emberdesk-test/plugins:/home/node/app/plugins`
- `/www/server/panel/data/compose/emberdesk-test/extensions:/home/node/app/public/scripts/extensions/third-party`

Keep these mounts intact. The Git checkout and rebuilt image are replaceable; config, user data, plugins, and third-party extensions are not.

## Core Implementation

### Process Summary

The most recent documented deploy removed the welcome-panel `Recent Chats` area, committed it as:

```text
3647298e5 fix(welcome): remove recent chats panel
```

The change was pushed to `origin/csp-dev-techupgrade`, fast-forwarded to `origin/sttest`, pulled on Hostinger, rebuilt with Docker Compose, recorded in `.deploy-revision`, and verified through container health plus HTTPS checks.

### Local Commit And Push

Start by inspecting the working tree. There may be unrelated local changes; stage only the files that belong to the deployment.

```bash
git status --short
git add <task-file-1> <task-file-2>
git commit -m "<scope>: <summary>"
git push origin csp-dev-techupgrade
```

Before updating the `sttest` branch, confirm it can fast-forward from the branch being deployed:

```bash
git fetch origin sttest csp-dev-techupgrade
git merge-base --is-ancestor origin/sttest HEAD
git push origin HEAD:sttest
```

Task-owned new files may be staged by explicit path when they are intended to enter the repository. Never stage unrelated untracked files, and never use `git add .` or `git add -A` for deployment commits in this repo.

### Remote Deploy

Run Git updates as `hostinger` so the working tree stays owned by `hostops:hostops`.

```bash
ssh hostinger "cd /opt/emberdesk-test && git fetch origin csp-dev-techupgrade && git pull --ff-only origin csp-dev-techupgrade && git rev-parse HEAD"
```

Rebuild and restart the container as root:

```bash
ssh hostinger-root "cd /opt/emberdesk-test/deploy && docker compose up -d --build"
```

Record the deployed revision:

```bash
ssh hostinger "cd /opt/emberdesk-test && git rev-parse HEAD > .deploy-revision && cat .deploy-revision"
```

### Verification

Check the container status:

```bash
ssh hostinger-root 'docker ps --filter name=emberdesk-test --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"'
ssh hostinger-root 'docker inspect --format "{{.State.Health.Status}} {{.Image}}" emberdesk-test'
```

Check the public HTTP surface:

```bash
ssh hostinger-root 'curl -sSI --max-time 15 https://sttest.tanyaleoallen.cloud/ | sed -n "1,12p"'
ssh hostinger-root 'curl -sSI --max-time 15 https://sttest.tanyaleoallen.cloud/login | sed -n "1,12p"'
```

For feature-specific verification, inspect the container filesystem or run a focused browser check. Example grep used for the welcome-panel deployment:

```bash
ssh hostinger-root 'docker exec emberdesk-test sh -lc "grep -n \"Recent Chats\\|recentChat\\|welcomeRecent\\|Temporary Chat\" /home/node/app/public/scripts/templates/welcomePanel.html || true"'
```

The expected result for that check is no match for the removed `Recent Chats` surface.

### Rollback

Prefer rolling back to a known-good commit and rebuilding rather than using destructive resets.

```bash
ssh hostinger "cd /opt/emberdesk-test && git fetch origin csp-dev-techupgrade && git checkout <known-good-sha>"
ssh hostinger-root "cd /opt/emberdesk-test/deploy && docker compose up -d --build"
ssh hostinger "cd /opt/emberdesk-test && git rev-parse HEAD > .deploy-revision && cat .deploy-revision"
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

- `Dockerfile` - production image build and Bun install behavior
- `docker/build-lib.js` - browser library precompile during image build
- `src/healthcheck.js` - container healthcheck entry point
- `server.js` - deployed process entry point
- `src/server-main.js` - server boot orchestration inside the container
