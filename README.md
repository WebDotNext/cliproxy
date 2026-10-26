# cliproxy

Pool AI accounts behind one local API and manage them from a browser. cliproxy combines a Go proxy server with a React management panel, so coding tools and API clients can share provider connections, account routing, and configuration.

Built on [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) and [Cli-Proxy-API-Management-Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center), with local changes for Claude account routing, quota visibility, and a request playground.

[Quick start](#quick-start) · [API usage](#use-the-api) · [Routing](#account-routing) · [Development](#development) · [Troubleshooting](#troubleshooting)

## What you get

- **Compatible APIs:** OpenAI chat completions and Responses, Anthropic messages, and Gemini endpoints, with streaming and tool support where the provider supports them.
- **Multiple provider connections:** Claude and Codex OAuth accounts, plus other supported OAuth providers and API-key upstreams.
- **Account pooling:** round-robin, weighted, fill-first, and Claude quota-aware routing, with optional session affinity.
- **Browser management:** provider setup, OAuth and auth files, quota inspection, configuration editing, logs, and a playground for trying requests.
- **One panel artifact:** the production UI builds to a single HTML file served by the proxy.
- **A repository-owned model catalog:** run with `--local-model` to use the catalogs embedded in the binary.

## Quick start

### 1. Build from source

Install **Go 1.26+**, **Bun 1.3.14**, Git, and Make, then run:

```bash
git clone https://github.com/WebDotNext/cliproxy.git
cd cliproxy
make build
```

This creates `proxy/cli-proxy-api` and `panel/dist/index.html`. The proxy can run directly on your machine; the install and service-restart shortcuts below target an existing macOS launchd setup.

### 2. Create your configuration

Keep runtime configuration and credentials outside the checkout:

```bash
mkdir -p "$HOME/.config/cli-proxy-api/static" "$HOME/.cli-proxy-api"
cp proxy/config.example.yaml "$HOME/.config/cli-proxy-api/config.yaml"
cp panel/dist/index.html "$HOME/.config/cli-proxy-api/static/management.html"
```

Edit `~/.config/cli-proxy-api/config.yaml`. The following is a minimal local configuration; you can use it instead of the full example. **Replace both placeholder keys with different, randomly generated secrets before starting.** `openssl rand -hex 32` can generate each key.

```yaml
config-version: 8

server:
  host: "127.0.0.1"
  port: 8317

management:
  allow-remote: false
  secret-key: "REPLACE_WITH_YOUR_MANAGEMENT_KEY"
  disable-control-panel: false
  disable-auto-update-panel: true

access:
  api-keys:
    - "REPLACE_WITH_YOUR_CLIENT_API_KEY"

oauth:
  auth-dir: "~/.cli-proxy-api"

routing:
  strategy: "round-robin"
```

`disable-auto-update-panel: true` keeps periodic upstream panel downloads from replacing your locally built UI. Keep the copied `management.html` in place: a missing panel can still trigger a download on first access.

The full [configuration example](proxy/config.example.yaml) covers provider API keys, proxies, model aliases, payload rules, TLS, and additional routing settings.

For Docker on the home server with private Tailscale HTTPS access, follow the
[home-server deployment guide](deploy/README.md). It builds this fork's proxy and
panel together and preserves provider logins outside the checkout.

### 3. Connect a provider

For Claude OAuth, run:

```bash
./proxy/cli-proxy-api \
  --config "$HOME/.config/cli-proxy-api/config.yaml" \
  --claude-login
```

For Codex OAuth, use `--codex-login` instead. Repeat the login flow to add more accounts. Use `--no-browser` when you need to open the authorization URL yourself.

You can also connect supported providers through the panel after starting the server, or configure upstream API keys using the full configuration example.

### 4. Start the proxy and open the panel

From the repository root:

```bash
./proxy/cli-proxy-api \
  --config "$HOME/.config/cli-proxy-api/config.yaml" \
  --local-model
```

Open **http://127.0.0.1:8317/management.html** and sign in with your **management key**. The panel uses `/v8/management` on the same server.

The server hashes the management key in the configuration on startup. Continue signing in with the original plaintext key, rather than the stored hash.

## Use the API

Client applications use the **client API key** from `access.api-keys`. The management key is only for administration; provider credentials authorize the proxy to call upstream services.

| Purpose | Address | Credential |
| --- | --- | --- |
| OpenAI-compatible client base URL | `http://127.0.0.1:8317/v1` | Client API key |
| Anthropic-compatible client base URL | `http://127.0.0.1:8317` | Client API key |
| Management panel | `http://127.0.0.1:8317/management.html` | Management key |
| Management API | `http://127.0.0.1:8317/v8/management` | Management key |

List the models available to your connected accounts:

```bash
export CLIPROXY_API_KEY='YOUR_CLIENT_API_KEY'

curl --fail-with-body http://127.0.0.1:8317/v1/models \
  -H "Authorization: Bearer $CLIPROXY_API_KEY"
```

Choose an available model ID from that response, then send a chat completion:

```bash
export CLIPROXY_MODEL='MODEL_ID_FROM_THE_LIST'

curl --fail-with-body http://127.0.0.1:8317/v1/chat/completions \
  -H "Authorization: Bearer $CLIPROXY_API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$CLIPROXY_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello!\"}]}"
```

Other supported routes include `POST /v1/responses` and `POST /v1/messages`. Model availability and capabilities depend on the provider, account permissions, and configuration.

## Account routing

Set `routing.strategy` in your configuration or through the panel:

| Strategy | Behavior |
| --- | --- |
| `round-robin` | Rotate among matching credentials; the default. |
| `weighted-round-robin` | Distribute requests according to credential weights. |
| `fill-first` | Prefer the first available matching credential. |
| `soonest-reset` | Prefer Claude OAuth accounts whose weekly allowance resets soonest. |
| `burn-rate` | Prefer Claude OAuth accounts with more remaining weekly allowance relative to the time left before reset. |

The Claude quota-aware strategies use rate-limit headers collected from upstream responses. They skip accounts at 95% of either the five-hour or weekly limit and try unmeasured accounts first to collect quota data. See the [configuration comments](proxy/config.example.yaml) for fallback behavior and session-affinity options.

## Model catalog

The general model catalog lives in [`proxy/internal/registry/models/models.json`](proxy/internal/registry/models/models.json) and is embedded when the proxy is built.

1. Add or update entries in that file.
2. Rebuild the proxy with `make build-proxy`.
3. Restart it with `--local-model`.

Explicit `models.catalog`, `models.codex-catalog`, or `models.devin-catalog` sources override `--local-model` for their respective catalogs. Leave those sources unset to use embedded data. Catalog entries describe models; they do not grant an account access to them.

## Development

| Path | Responsibility |
| --- | --- |
| [`proxy/`](proxy/) | Go server, API translation, authentication, routing, and management API |
| [`panel/`](panel/) | React 19, TypeScript, Vite, and Bun management panel |
| [`panel/src/services/api/`](panel/src/services/api/) | Panel clients for backend API contracts |
| [`proxy/internal/registry/models/models.json`](proxy/internal/registry/models/models.json) | Embedded general model catalog |
| [`Makefile`](Makefile) | Build, test, local install, and restart shortcuts |

Run these commands from the repository root:

```bash
make build          # build the proxy and install/build panel dependencies
make build-proxy    # build only the Go binary
make build-panel    # install locked dependencies and build the single-file UI
make test           # run Go tests, then panel tests, lint, and build
```

Run `make build-panel` or `cd panel && bun install --frozen-lockfile` before the first `make test`, so the panel dependencies are available.

For live panel development, keep the proxy running and use a second terminal:

```bash
cd panel
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:5173` and connect to `http://127.0.0.1:8317` with your management key. The panel exclusively uses the v8 management API; endpoint changes often need matching changes in `panel/src/services/api/`.

See the [root guidelines](AGENTS.md), [proxy guidelines](proxy/AGENTS.md), and [panel guidelines](panel/AGENTS.md) for folder-specific commands and conventions. The proxy also includes [SDK documentation](proxy/docs/sdk-usage.md) and [examples](proxy/examples/).

### Local installation on macOS

For an **existing** launchd service named `com.cli-proxy-api`:

```bash
mkdir -p "$HOME/.local/bin"
make install
```

This builds and installs the binary to `~/.local/bin/cli-proxy-api`, copies the panel to `~/.config/cli-proxy-api/static/management.html`, and restarts `gui/$(id -u)/com.cli-proxy-api`. It does not create a launchd service or runtime configuration. Configure your existing service to pass `--config` and `--local-model` as shown above.

`BIN_DIR`, `STATIC_DIR`, and `SERVICE` can be overridden as Make variables. For installation without a service restart, use `make install-proxy install-panel`.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Cannot connect | Confirm the process is running and the configured host and port match your client. |
| API requests return 401 | Use a client key from `access.api-keys`, not the management key. |
| Panel login fails | Use the original management key. A hashed value in the YAML is expected after startup. |
| Management API returns 404 | Set a nonempty `management.secret-key` and keep the panel enabled. |
| Panel is missing or looks different | Rebuild and copy `panel/dist/index.html` to the configuration directory's `static/management.html`; disable automatic panel updates. `MANAGEMENT_STATIC_PATH` can override the asset location. |
| A model is unavailable | Check `/v1/models`, connected credentials, model aliases/exclusions, and whether the binary was rebuilt after catalog changes. |
| `make install` fails at restart | The target expects an existing macOS launchd service. Use the direct start command or install targets without restart. |

## Credentials and local data

The quick start binds to loopback and keeps remote management disabled. Keep real keys, OAuth files, and runtime configuration outside Git. The panel's remember-password storage uses reversible obfuscation, so use it only in a trusted browser profile.

| Location | Contents |
| --- | --- |
| `~/.config/cli-proxy-api/config.yaml` | Runtime configuration and client/management key settings |
| `~/.cli-proxy-api/` | OAuth credentials, as configured by `oauth.auth-dir` |
| `~/.config/cli-proxy-api/static/management.html` | Locally built management panel |

## Credits and license

This project is a fork built on [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) by [router-for-me](https://github.com/router-for-me). Credit goes to its authors and contributors for the original proxy server.

The management panel started from [Cli-Proxy-API-Management-Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center), also by router-for-me.

Both original projects are MIT licensed. Their license and copyright notices are preserved in [`proxy/LICENSE`](proxy/LICENSE) and [`panel/LICENSE`](panel/LICENSE). This repository is maintained independently and does not track an upstream remote. See the root [MIT license](LICENSE) for this repository.
