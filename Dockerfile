FROM oven/bun:1.3.14 AS panel
WORKDIR /build/panel
COPY panel/package.json panel/bun.lock ./
RUN bun install --frozen-lockfile
COPY panel/ ./
RUN bun run build

FROM golang:1.26-bookworm AS proxy
WORKDIR /build/proxy
COPY proxy/go.mod proxy/go.sum ./
RUN go mod download
COPY proxy/ ./
ARG COMMIT=unknown
RUN CGO_ENABLED=1 GOMAXPROCS=2 go build -p 2 -buildvcs=false \
    -ldflags="-s -w -X main.Commit=${COMMIT}" -o /build/cliproxy ./cmd/server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 1000 --create-home cliproxy
WORKDIR /app
COPY --from=proxy /build/cliproxy /app/cliproxy
COPY --from=panel /build/panel/dist/index.html /app/static/management.html
ENV MANAGEMENT_STATIC_PATH=/app/static
USER cliproxy
EXPOSE 8317
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:8317/healthz || exit 1
ENTRYPOINT ["/app/cliproxy"]
CMD ["--config", "/data/config.yaml", "--local-model"]
