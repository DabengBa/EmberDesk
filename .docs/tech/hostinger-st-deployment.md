---
description: "The upstream SillyTavern staging container behind Hostinger st, its persistent mounts, and read-only verification."
kind: technical
topic: hostinger-st-deployment
---

# Hostinger `st`: upstream SillyTavern

`st` runs upstream SillyTavern, not an EmberDesk build. Use the separate
[Hostinger `sttest` runbook](hostinger-sttest-deployment.md) for EmberDesk.
Do not use the EmberDesk checkout, build, or deployment revision marker
for `st`.

| Item | Confirmed configuration |
| --- | --- |
| SSH | `vps-kl` |
| Public URL | `https://st.tanyaleoallen.cloud/` |
| GoDoxy upstream | `http://127.0.0.1:8000` |
| Host-local Compose | `/opt/sillytavern-staging/docker-compose.yml` |
| Compose project / service / container | `sillytavern-st` / `sillytavern` / `sillytavern` |
| Image | `ghcr.io/sillytavern/sillytavern:staging` |
| Port mapping | `127.0.0.1:8000:8000` |

The host-local Compose file is not tracked in this repository. The image
runs `node server.js --listen` via its own entrypoint. Retiring the EmberDesk
`sillytavern` CLI does not affect the upstream package or container.

## Persistent mounts

Keep these mounts intact. The image and container are replaceable; their
mounted config, data, plugins, and extensions are not.

- `/www/server/panel/data/compose/sillytavern/config:/home/node/app/config`
- `/www/server/panel/data/compose/sillytavern/data:/home/node/app/data`
- `/www/server/panel/data/compose/sillytavern/plugins:/home/node/app/plugins`
- `/www/server/panel/data/compose/sillytavern/extensions:/home/node/app/public/scripts/extensions/third-party`

## Read-only verification

```bash
ssh vps-kl 'docker ps --filter name=^sillytavern$ --format "{{.Names}} {{.Image}} {{.Status}} {{.Ports}}"'
ssh vps-kl 'docker inspect --format "{{.State.Health.Status}} {{.Image}}" sillytavern'
ssh vps-kl bash -s <<'REMOTE'
image_id=$(docker inspect --format '{{.Image}}' sillytavern)
docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_id"
REMOTE
ssh vps-kl 'curl -sS -D - -o /dev/null --max-time 15 http://127.0.0.1:8000/'
ssh vps-kl 'curl -sS -D - -o /dev/null --max-time 15 http://127.0.0.1:8000/login'
curl -sS -D - -o /dev/null --max-time 15 https://st.tanyaleoallen.cloud/login
```

On 2026-11-23, the container was healthy at upstream image revision
`82b64a45c34facbc98ff4b9f33c067d3ccab6a17` (SillyTavern `1.19.1`).
Loopback `/` returned `302` to `/login`, and `/login` returned `200`.
`/index.html` and `/login.html` returned `200`; `/setup.html` returned `403`.
Public HTTPS failed during the TLS handshake, before an HTTP status could
be observed. Loopback confirms the container, not the public TLS path.
