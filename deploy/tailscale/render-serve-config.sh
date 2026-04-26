#!/bin/sh
set -eu

serve_config="${TS_SERVE_CONFIG:-/tmp/serve.json}"
hostname="${TS_HOSTNAME:-tailscale-mcp}"
port="${MCP_HTTP_PORT:-3000}"

if [ -n "${TS_SERVE_HOST:-}" ]; then
  serve_host="$TS_SERVE_HOST"
else
  serve_host="${hostname}:443"
fi

case "$port" in
  ""|*[!0-9]*)
    echo "MCP_HTTP_PORT must be numeric" >&2
    exit 1
    ;;
esac

case "$serve_host" in
  ""|*[!A-Za-z0-9._:-]*)
    echo "TS_SERVE_HOST may only contain letters, numbers, dots, underscores, colons, and hyphens" >&2
    exit 1
    ;;
esac

cat > "$serve_config" <<EOF
{
  "TCP": {
    "443": {
      "HTTPS": true
    }
  },
  "Web": {
    "$serve_host": {
      "Handlers": {
        "/": {
          "Proxy": "http://127.0.0.1:$port"
        }
      }
    }
  },
  "AllowFunnel": {
    "$serve_host": false
  }
}
EOF

exec "${CONTAINERBOOT:-/usr/local/bin/containerboot}"
