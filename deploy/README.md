# Home server

Build the repository's Go proxy and Bun panel together, with the embedded model
catalog enabled. The container runs as UID 1000 and publishes only to loopback.
No database or shared Docker network is required.

From the repository root:

```bash
bash deploy/init.sh
export CLIPROXY_COMMIT="$(git rev-parse HEAD)"
docker compose -f deploy/compose.yaml build
docker compose -f deploy/compose.yaml up -d --wait
sudo tailscale serve --bg --https=8317 http://127.0.0.1:8317
```

Check `tailscale serve status` first and choose a different HTTPS port if 8317
is already in use. Keep existing mappings. Serve is tailnet-only; do not use
Funnel. Devices also need permission under your tailnet's access rules.

On Wesley's home server:

| Use | URL |
| --- | --- |
| Panel | `https://homeserver.tailcf1de0.ts.net:8317/management.html` |
| OpenAI-compatible API | `https://homeserver.tailcf1de0.ts.net:8317/v1` |
| Anthropic-compatible base URL | `https://homeserver.tailcf1de0.ts.net:8317` |

Credentials live in `/home/wezz/.config/cliproxy/credentials.txt` with owner-only
permissions. Use the management key in the panel and the client key in apps.
Create additional device keys in the panel as needed. `allow-remote: true` lets
the Docker gateway reach the management API; the host port remains loopback-only
and Tailscale provides remote access.

## Clients

Client machine setup (CLIs, desktop apps and services) lives in the Fleet repo:
`scripts/configure-cliproxy.py`, then `scripts/cliproxy-app-env.sh`. See Fleet's
`docs/cliproxy-clients.md`.

## Provider login

Use the panel's OAuth page to connect Claude, Codex (OpenAI), and xAI (Grok).
Open the authorization link on your own device and complete the provider flow.
If a flow redirects to localhost, copy the complete callback URL into the panel's
callback field. A browser error at localhost is expected when logging in remotely.

For terminal login, the same credentials directory is mounted by these commands:

```bash
docker compose -f deploy/compose.yaml run --rm --no-deps cliproxy --config /data/config.yaml --claude-login --no-browser
docker compose -f deploy/compose.yaml run --rm --no-deps cliproxy --config /data/config.yaml --codex-device-login --no-browser
docker compose -f deploy/compose.yaml run --rm --no-deps cliproxy --config /data/config.yaml --xai-login --no-browser
```

Account permissions determine model access. Provider API keys can also be added
through the panel. Check `/v1/models` with a client key after connecting accounts,
then send a real request to verify upstream access.

## Updates and recovery

Before updating, save the running image for rollback:

```bash
docker tag "$(docker inspect --format '{{.Image}}' cliproxy)" cliproxy:rollback
docker compose -f deploy/compose.yaml build
docker compose -f deploy/compose.yaml up -d --wait
```

If the updated container fails, restore it:

```bash
CLIPROXY_IMAGE=cliproxy:rollback docker compose -f deploy/compose.yaml up -d --no-build --wait
```

The Compose default image uses the local registry naming convention. To publish
the built image to the home registry, run `docker compose -f deploy/compose.yaml push`.

## Automatic deployment

The repository lives at `WebDotNext/cliproxy`. Merges and pushes to `main` run
the Go tests and the panel's tests, lint and build on GitHub-hosted runners.
Only after those checks pass does the deployment job build and publish an
immutable image to the home registry, recreate the container, and wait for
its health check. A failed rollout restores the previous running image.
The `latest` image tag is updated only after a healthy rollout.

The dedicated repository runner `homeserver-cliproxy` uses labels
`self-hosted`, `docker`, and `cliproxy-deploy`. Its systemd service runs from
`/home/wezz/actions-runner-cliproxy` as `wezz`. This keeps the organization's
existing runner group policy, which excludes public repositories, unchanged.
PR workflows use GitHub-hosted runners only. Deployments are serialized and
cannot be cancelled by newer pushes. Manual workflow runs also deploy only
the `main` branch.

Provider credentials and Tailscale Serve settings stay on the server between
deployments. No GitHub API-key secrets or port variables are required. Optionally
add the `DISCORD_WEBHOOK_DEPLOY` Actions secret for deployment notifications.
Without it, the notification step is skipped. The runner must retain Docker
access and access to the registry at `192.168.1.239:5000`.

Back up `/home/wezz/.config/cliproxy` securely, including `auths/`. Rebuilding or
recreating the container preserves these files. `CLIPROXY_DATA_DIR` overrides
the host directory; it must be writable by UID 1000. Keep it outside Git.

Inspect with `docker logs --tail 100 cliproxy` and `docker inspect cliproxy`.
To remove only this Tailscale mapping, run
`sudo tailscale serve --https=8317 off`. Stop the container with
`docker compose -f deploy/compose.yaml down`; persistent credentials remain.
