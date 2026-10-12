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

## Origin

Both folders started from the open-source projects [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) and [Cli-Proxy-API-Management-Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center). Each is MIT licensed, and its LICENSE file stays in its folder. This repo does not track them upstream.
