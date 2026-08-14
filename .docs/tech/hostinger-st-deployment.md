# Hostinger St Deployment

## Module Responsibility

This runbook documents the Hostinger-hosted production `st` deployment for EmberDesk. It covers the local commit and push sequence, the remote Git update, Docker Compose rebuild, revision tracking, verification, rollback, and operational cautions for the production server.

Related docs:

- [hostinger-sttest-deployment.md](hostinger-sttest-deployment.md) - shared test server (`sttest`) runbook; do not use those paths for production
- [pnpm-workflow.md](pnpm-workflow.md) - local package manager, runtime, and Docker install contract
- [server-startup-orchestration.md](server-startup-orchestration.md) - server boot phases after the container starts
- [config-resolution.md](config-resolution.md) - config and data-root resolution consumed by the deployed server

## Architecture And Constraints

The `st` environment is the production Hostinger target. It is not a source of canonical project source history, but it does host durable user data mounts.

- Public URL: `https://st.tanyaleoallen.cloud/`
- Expected route behavior: `/` redirects to `/login`; `/login` returns `HTTP/2 200` with the React login shell.
- Remote app path: `/opt/emberdesk`
- Remote revision marker: `/opt/emberdesk/.deploy-revision`
- Docker Compose file: `/opt/emberdesk/deploy/docker-compose.yml`
- Compose project directory: `/opt/emberdesk/deploy`
- Compose service and container: `emberdesk`
- Image name from compose build: `deploy-emberdesk`
- Port mapping: `8000:8000`
- Container healthcheck: `node src/healthcheck.js`

Use the non-root SSH user for Git work and root only for Docker operations:

- `hostinger` - `hostops@31.97.210.149`
- `hostinger-root` - `root@31.97.210.149`

Do not document or commit private key material, credentials, cookies, session tokens, exported browser storage, or remote config secrets.

Persistent state is mounted outside the application checkout:

- `/www/server/panel/data/compose/sillytavern/config:/home/node/app/config`
- `/www/server/panel/data/compose/sillytavern/data:/home/node/app/data`
- `/www/server/panel/data/compose/sillytavern/plugins:/home/node/app/plugins`
- `/www/server/panel/data/compose/sillytavern/extensions:/home/node/app/public/scripts/extensions/third-party`

Keep these mounts intact. The Git checkout and rebuilt image are replaceable; config, user data, plugins, and third-party extensions are not.

The image build must precompile React assets. `app/dist` is gitignored; without `pnpm run build:react` (and the panel builds) inside the Dockerfile, production `/login` returns HTTP 503 with `React login build is missing`.

## Core Implementation

### Process Summary

Deploy from a clean local commit on `csp-dev-techupgrade` that has already been pushed to `origin`. Pull that branch into `/opt/emberdesk`, rebuild the compose service, record `.deploy-revision`, and verify container health plus public HTTPS routes.

### Local Commit And Push

Start by inspecting the working tree. There may be unrelated local changes; stage only the files that belong to the deployment.

```bash
git status --short
git add <task-file-1> <task-file-2>
git commit -m "<scope>: <summary>"
git push origin csp-dev-techupgrade
```

Task-owned new files may be staged by explicit path when they are intended to enter the repository. Never stage unrelated untracked files, and never use `git add .` or `git add -A` for deployment commits in this repo.

### Remote Deploy

Run Git updates as `hostinger` so the working tree stays owned by `hostops:hostops`.

```bash
ssh hostinger "cd /opt/emberdesk && git fetch origin csp-dev-techupgrade && git pull --ff-only origin csp-dev-techupgrade && git rev-parse HEAD"
```

Rebuild and restart the container as root:

```bash
ssh hostinger-root "cd /opt/emberdesk/deploy && docker compose up -d --build"
```

Record the deployed revision:

```bash
ssh hostinger "cd /opt/emberdesk && git rev-parse HEAD > .deploy-revision && cat .deploy-revision"
```

### Verification

Check the container status:

```bash
ssh hostinger-root 'docker ps --filter name=^emberdesk$ --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"'
ssh hostinger-root 'docker inspect --format "{{.State.Health.Status}} {{.Image}}" emberdesk'
ssh hostinger-root 'docker exec emberdesk sh -lc "test -f /home/node/app/app/dist/index.html && ls /home/node/app/app/dist/assets | sed -n \"1,20p\""'
```

Check the public HTTP surface:

```bash
ssh hostinger-root 'curl -sSI --max-time 15 https://st.tanyaleoallen.cloud/ | sed -n "1,12p"'
ssh hostinger-root 'curl -sSI --max-time 15 https://st.tanyaleoallen.cloud/login | sed -n "1,12p"'
```

Expected results:

- `/` returns `302` to `/login`
- `/login` returns `200` (not `503` and not the missing-build plain-text body)

### Rollback

Prefer rolling back to a known-good commit and rebuilding rather than using destructive resets.

```bash
ssh hostinger "cd /opt/emberdesk && git fetch origin csp-dev-techupgrade && git checkout <known-good-sha>"
ssh hostinger-root "cd /opt/emberdesk/deploy && docker compose up -d --build"
ssh hostinger "cd /opt/emberdesk && git rev-parse HEAD > .deploy-revision && cat .deploy-revision"
```

After rollback, repeat the container health, `app/dist` presence, and public HTTP checks. If the rollback commit should become the branch tip, make that branch update explicitly from the local repo and document why.

## Operational Notes

- `listen`/private request filter warnings and untrusted-host log entries may appear while the service remains healthy. Treat these as existing runtime configuration warnings; do not disable CSRF, host checks, whitelist behavior, or SSRF protection as a convenience fix.
- If root needs to read Git metadata in `/opt/emberdesk`, use `git -c safe.directory=/opt/emberdesk -C /opt/emberdesk ...` to avoid Git dubious-ownership failures.
- `.deploy-revision` is a remote-local operational marker and is ignored by Git. Do not commit it.
- Keep Docker rebuilds rooted at `/opt/emberdesk/deploy`; the application checkout itself is one directory above the compose file.
- Do not deploy production by copying sttest paths (`/opt/emberdesk-test`, port `8001`, `sttest.tanyaleoallen.cloud`).

## Related Semantic IDs And Code Binding Points

This deployment runbook has no owning semantic product ID. Related user-facing surfaces are documented separately in `.docs/db` when their behavior changes.

Operational binding points:

- `Dockerfile` - production image build, React prebuild, and pnpm install behavior
- `pnpm run build:lib` - Vite browser library precompile during image build
- `src/healthcheck.js` - container healthcheck entry point
- `src/middleware/react-login-serve.js` - required `app/dist` login shell contract
- `server.js` - deployed process entry point
- `src/server-main.js` - server boot orchestration inside the container
