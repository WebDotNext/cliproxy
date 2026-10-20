# cliproxy

A local proxy that pools Claude subscriptions behind one OpenAI, Anthropic and Gemini compatible API, plus its management panel.

| Folder | What | Stack |
| --- | --- | --- |
| `proxy/` | The proxy server and v8 management API | Go |
| `panel/` | The management panel, built to a single `management.html` | React, Vite, Bun |

## Commands

```bash
make build    # build the proxy binary and the panel
make test     # go test, then bun run verify
make install  # install the binary and panel locally, then restart the launchd service
```

`make install` puts the binary in `~/.local/bin` and the panel in `~/.config/cli-proxy-api/static/management.html`. Config and auth files live outside the repo, in `~/.config/cli-proxy-api` and `~/.cli-proxy-api`.

## Credits and license

This project is a fork built on [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) by [router-for-me](https://github.com/router-for-me). Credit goes to its authors and contributors for the original proxy server.

The management panel started from [Cli-Proxy-API-Management-Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center), also by router-for-me.

Both original projects are MIT licensed. Their license and copyright notices are preserved in [`proxy/LICENSE`](proxy/LICENSE) and [`panel/LICENSE`](panel/LICENSE). This repository is maintained independently and does not track an upstream remote.
