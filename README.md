# Tailscale MCP Server

A Bun-first Model Context Protocol server for operating Tailscale through a
private, least-privilege interface.

The default transport is `stdio` for local MCP clients. Optional HTTP transport
binds to `127.0.0.1` by default and is designed to be exposed privately with
Tailscale Serve or another tailnet-only proxy.

## Install

```bash
bun install
bun run build
```

## Local MCP Usage

```json
{
  "mcpServers": {
    "tailscale": {
      "command": "bunx",
      "args": ["@hexsleeves/tailscale-mcp-server"],
      "env": {
        "TAILSCALE_OAUTH_CLIENT_ID": "your-client-id",
        "TAILSCALE_OAUTH_CLIENT_SECRET": "your-client-secret",
        "TAILSCALE_TAILNET": "-"
      }
    }
  }
}
```

OAuth clients are preferred for automation because they use scoped access and
short-lived tokens. API keys remain supported for compatibility:

```bash
TAILSCALE_API_KEY=tskey-... bun run src/index.ts
```

## HTTP Mode

HTTP mode requires a bearer token and only accepts localhost or tailnet host
headers by default.

```bash
export MCP_TRANSPORT=http
export MCP_HTTP_BEARER_TOKEN="$(openssl rand -base64 32)"
export TAILSCALE_OAUTH_CLIENT_ID="your-client-id"
export TAILSCALE_OAUTH_CLIENT_SECRET="your-client-secret"

bun run src/index.ts --http --port 3000 --host 127.0.0.1
```

Expose it privately through Tailscale Serve:

```bash
tailscale serve --bg 443 localhost:3000
```

Do not use Funnel for normal MCP operation. Funnel makes the service publicly
reachable and should require a separate threat review.

## Configuration

| Variable | Default | Description |
|---|---:|---|
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `MCP_HTTP_BIND_HOST` | `127.0.0.1` | HTTP bind host |
| `MCP_HTTP_PORT` | `3000` | HTTP bind port |
| `MCP_HTTP_BEARER_TOKEN` | | Required in HTTP mode |
| `MCP_ALLOWED_HOSTS` | | Comma-separated extra allowed HTTP hosts |
| `TAILSCALE_TAILNET` | `-` | Tailnet name or `-` shorthand |
| `TAILSCALE_API_BASE_URL` | `https://api.tailscale.com` | Tailscale API base URL |
| `TAILSCALE_OAUTH_CLIENT_ID` | | Preferred auth method |
| `TAILSCALE_OAUTH_CLIENT_SECRET` | | Preferred auth method |
| `TAILSCALE_API_KEY` | | Compatibility auth method |
| `TAILSCALE_ALLOWED_TOOL_RISK` | `read` | `read`, `write`, or `admin` |
| `TAILSCALE_CLI_PATH` | `tailscale` | Local CLI path |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |
| `MCP_SERVER_LOG_FILE` | | Optional file log path |

Risk levels:

- `read`: read-only tools and resources.
- `write`: write operations such as ACL/DNS/route updates.
- `admin`: destructive or host-affecting actions such as delete,
  deauthorize, connect, disconnect, and auth key mutation.

## Tools

Stable tool names:

- `list_devices`
- `device_action`
- `manage_routes`
- `get_network_status`
- `connect_network`
- `disconnect_network`
- `ping_peer`
- `get_version`
- `get_tailnet_info`
- `manage_acl`
- `manage_dns`
- `manage_keys`
- `manage_policy_file`
- `manage_file_sharing`
- `manage_exit_nodes`
- `manage_webhooks`
- `manage_device_tags`

## Resources

- `tailscale://tailnet/summary`
- `tailscale://devices`
- `tailscale://devices/{deviceId}`
- `tailscale://acl/current`

## Prompts

- `diagnose_tailnet_connectivity`
- `review_acl_change`

## Development

```bash
bun install
bun test
bun run typecheck
bun run lint
bun run build
```

Full local gate:

```bash
bun run qa
```

## Docker

```bash
docker build -t tailscale-mcp-server .
docker run --rm \
  -e MCP_HTTP_BEARER_TOKEN="$MCP_HTTP_BEARER_TOKEN" \
  -e TAILSCALE_OAUTH_CLIENT_ID="$TAILSCALE_OAUTH_CLIENT_ID" \
  -e TAILSCALE_OAUTH_CLIENT_SECRET="$TAILSCALE_OAUTH_CLIENT_SECRET" \
  -p 127.0.0.1:3000:3000 \
  tailscale-mcp-server
```

Keep the published port bound to localhost and expose it to other devices with
Tailscale Serve.

For a sidecar deployment that runs the MCP server behind a private Tailscale
Serve endpoint, see `deploy/README.md`.
