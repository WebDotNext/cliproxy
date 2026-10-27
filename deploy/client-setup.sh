#!/usr/bin/env bash
# Point a macOS client (Codex, Grok, curl) at the home server's cliproxy.
# Usage: bash deploy/client-setup.sh [ssh-host]   (default: homeserver)
set -euo pipefail
umask 077

host="${1:-homeserver}"
base_url="https://homeserver.tailcf1de0.ts.net:8317"
env_file="$HOME/.config/cliproxy/client.env"
agent="$HOME/Library/LaunchAgents/nz.cliproxy.env.plist"

key="$(ssh "$host" 'tr -d "\n" < ~/.config/cliproxy/client-api-key')"
[[ -n "$key" ]] || { echo "No client key found on $host" >&2; exit 1; }

mkdir -p "$(dirname "$env_file")"
cat > "$env_file" <<EOF
export CLIPROXY_API_KEY=$key
export XAI_API_KEY=$key
export GROK_MODELS_BASE_URL=$base_url/v1
EOF

# Shells: zsh is the macOS default.
line="[ -f \"$env_file\" ] && source \"$env_file\""
grep -qsF "$env_file" "$HOME/.zshrc" || echo "$line" >> "$HOME/.zshrc"

# GUI apps launched from the Dock don't read ~/.zshrc; set the vars in launchd
# now and on every login.
set -a; source "$env_file"; set +a
vars=(CLIPROXY_API_KEY XAI_API_KEY GROK_MODELS_BASE_URL)
cmd=""
for v in "${vars[@]}"; do
  launchctl setenv "$v" "${!v}"
  cmd+="launchctl setenv $v \"\$$v\"; "
done
mkdir -p "$(dirname "$agent")"
cat > "$agent" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>nz.cliproxy.env</string>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>-c</string>
    <string>. "$env_file"; $cmd</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict></plist>
EOF
launchctl unload "$agent" 2>/dev/null || true
launchctl load "$agent"

status="$(curl -s -o /dev/null -w '%{http_code}' "$base_url/v1/models" -H "Authorization: Bearer $key")"
echo "cliproxy /v1/models: $status"
[[ "$status" == 200 ]] && echo "Done. Quit and reopen Codex/T3 so they pick up the new environment."
