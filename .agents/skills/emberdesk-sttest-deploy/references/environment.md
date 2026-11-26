# sttest environment

The sttest target is a shared remote EmberDesk test deployment on Hostinger, not a source of canonical project data.

## Remote configuration

- SSH alias: `vps-kl` (root access).
- Remote application path: `/opt/emberdesk-test`.
- Checkout branch: `dev`, tracking `origin/dev`.
- Deployed revision marker: `/opt/emberdesk-test/.deploy-revision` (remote-local marker; ignored by Git).
- Host-local Compose file: `/opt/emberdesk-test/deploy/docker-compose.yml` (not tracked in this repository).
- Compose project, service, and container: `emberdesk-test`.
- Image tag: `emberdesk-test:local`.
- Port mapping: `127.0.0.1:8001:8000`.
- GoDoxy upstream: `http://127.0.0.1:8001`.
- Public URL: `https://sttest.tanyaleoallen.online/`; `/` should redirect to `/login`, and `/login` should return `200`.
- Git metadata access as root requires `-c safe.directory=/opt/emberdesk-test` because the checkout is owned by uid 1002.

## Persistent mounts

Keep these mounts intact; the Git checkout and rebuilt image are replaceable, but config, user data, plugins, and extension content are not:

- `/www/server/panel/data/compose/emberdesk-test/config:/home/node/app/config`
- `/www/server/panel/data/compose/emberdesk-test/data:/home/node/app/data`
- `/www/server/panel/data/compose/emberdesk-test/plugins:/home/node/app/plugins`
- `/www/server/panel/data/compose/emberdesk-test/extensions:/home/node/app/public/scripts/extensions/third-party`

Never document or commit secret values or credentials for this environment.
