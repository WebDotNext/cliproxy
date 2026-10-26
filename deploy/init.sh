#!/usr/bin/env bash
set -euo pipefail
umask 077

data_dir="${CLIPROXY_DATA_DIR:-/home/wezz/.config/cliproxy}"
if [[ -e "$data_dir/config.yaml" || -e "$data_dir/credentials.txt" ]]; then
  echo "Configuration already exists in $data_dir; leaving credentials unchanged."
  exit 0
fi

mkdir -p "$data_dir/auths"
management_key="$(openssl rand -hex 32)"
client_key="$(openssl rand -hex 32)"

cat > "$data_dir/config.yaml" <<EOF
config-version: 8
server:
  host: "0.0.0.0"
  port: 8317
management:
  allow-remote: true
  secret-key: "$management_key"
  disable-control-panel: false
  disable-auto-update-panel: true
access:
  api-keys:
    - "$client_key"
oauth:
  auth-dir: "/data/auths"
routing:
  strategy: "round-robin"
EOF

cat > "$data_dir/credentials.txt" <<EOF
Management key: $management_key
Client API key: $client_key
EOF
echo "Configuration created. Private credentials: $data_dir/credentials.txt"
