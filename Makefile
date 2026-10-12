BIN_DIR    ?= $(HOME)/.local/bin
STATIC_DIR ?= $(HOME)/.config/cli-proxy-api/static
SERVICE    ?= gui/$(shell id -u)/com.cli-proxy-api

.PHONY: build build-proxy build-panel test install install-proxy install-panel restart

build: build-proxy build-panel

build-proxy:
	cd proxy && go build -o cli-proxy-api ./cmd/server

build-panel:
	cd panel && bun install --frozen-lockfile && bun run build

test:
	cd proxy && go test ./...
	cd panel && bun run verify

install: install-proxy install-panel restart

install-proxy: build-proxy
	install -m 0755 proxy/cli-proxy-api $(BIN_DIR)/cli-proxy-api

install-panel: build-panel
	mkdir -p $(STATIC_DIR)
	cp panel/dist/index.html $(STATIC_DIR)/management.html

restart:
	launchctl kickstart -k $(SERVICE)
