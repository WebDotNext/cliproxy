# AGENTS.md

Monorepo for the proxy and its management panel. Each folder has its own AGENTS.md with its own commands and conventions; follow the one for the folder you are changing.

- `proxy/`: Go server. See `proxy/AGENTS.md`.
- `panel/`: React panel that talks to the proxy's v8 management API. See `panel/AGENTS.md`.

The panel depends on the proxy's API contracts, so a change to a management endpoint usually needs a matching change in `panel/src/services/api/`.

Root `Makefile` targets: `build`, `test`, `install` (local binary and panel, then restart the launchd service).

There is no upstream remote. Never push to the router-for-me repositories.
