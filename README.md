# Tailscale MCP Server

<p align="center">
  <a href="https://www.npmjs.com/package/@hexsleeves/tailscale-mcp-server">
    <img src="https://img.shields.io/npm/v/@hexsleeves/tailscale-mcp-server?label=npm" alt="npm version" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/HexSleeves/tailscale-mcp" alt="MIT License" />
  </a>
  <a href="https://github.com/HexSleeves/tailscale-mcp/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/HexSleeves/tailscale-mcp/ci.yml?branch=main&label=CI" alt="CI status" />
  </a>
  <a href="https://hub.docker.com/r/hexsleeves/tailscale-mcp-server">
    <img src="https://img.shields.io/docker/v/hexsleeves/tailscale-mcp-server?label=Docker" alt="Docker image" />
  </a>
</p>

<p align="center">
  <a href="https://glama.ai/mcp/servers/@HexSleeves/tailscale-mcp">
    <img width="380" height="200" src="https://glama.ai/mcp/servers/@HexSleeves/tailscale-mcp/badge" alt="Tailscale MCP server on Glama" />
  </a>
</p>

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for operating Tailscale from any MCP client. Supports local `stdio` for desktop clients and an authenticated HTTP transport for private tailnet deployments. Defaults to read-only access, localhost binding, and short-lived OAuth credentials where available.

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
  - [Claude Desktop](#claude-desktop)
  - [Claude Code (CLI)](#claude-code-cli)
  - [Cursor](#cursor)
- [Tool Reference](#tool-reference)
- [Resources and Prompts](#resources-and-prompts)
- [Configuration](#configuration)
- [HTTP Transport](#http-transport)
- [Docker](#docker)
- [Example Prompts](#example-prompts)
- [Development](#development)
- [Contributing](#contributing)

---

## Features

- **Device management** — list, authorize, deauthorize, delete, expire keys, manage routes.
- **Network operations** — connect/disconnect host, ping peers, get CLI status and version.
- **Administration** — tailnet info, file sharing, exit nodes, webhooks, device tags, server version.
- **ACL and policy** — read/validate/update ACL, DNS settings, auth keys, policy file, network lock.
- **Read-only resources** — tailnet summary, device list, per-device detail, current ACL.
- **Prompts** — guided connectivity diagnosis and ACL change review.
- **Risk-gated tools** — `read`, `write`, and `admin` levels via `TAILSCALE_ALLOWED_TOOL_RISK`.
- **OAuth + API key** — OAuth client credentials (preferred) or legacy API key.
- **Private HTTP mode** — bearer auth, Host validation, request size limits, health check endpoint.
- **Docker support** — pre-built images on Docker Hub and GHCR; sidecar deployment with Tailscale Serve.

---

## Requirements

One of:

- **Node.js 20+** — run via `npx` or install globally (no extra runtime needed).
- **Bun 1.3+** — used for development; also works as a production runtime.
- **Docker** — use the pre-built image (no local runtime required).

Plus one auth method:

- OAuth client credentials: `TAILSCALE_OAUTH_CLIENT_ID` + `TAILSCALE_OAUTH_CLIENT_SECRET` (preferred).
- Legacy API key: `TAILSCALE_API_KEY`.

The local **Tailscale CLI** is optional. It is only required for CLI-backed tools: `get_network_status`, `connect_network`, `disconnect_network`, `ping_peer`, `get_version`, and `manage_exit_nodes` (set/clear operations).

---

## Quick Start

### Claude Desktop

Edit `~/.claude/claude_desktop_config.json` (create if absent).

#### OAuth credentials (recommended)

```json
{
  "mcpServers": {
    "tailscale": {
      "command": "npx",
      "args": ["-y", "@hexsleeves/tailscale-mcp-server"],
      "env": {
        "TAILSCALE_OAUTH_CLIENT_ID": "your-client-id",
        "TAILSCALE_OAUTH_CLIENT_SECRET": "your-client-secret",
        "TAILSCALE_TAILNET": "-"
      }
    }
  }
}
```

#### API key

```json
{
  "mcpServers": {
    "tailscale": {
      "command": "npx",
      "args": ["-y", "@hexsleeves/tailscale-mcp-server"],
      "env": {
        "TAILSCALE_API_KEY": "tskey-api-...",
        "TAILSCALE_TAILNET": "-"
      }
    }
  }
}
```

#### Enable write/admin tools

Add `TAILSCALE_ALLOWED_TOOL_RISK` to the `env` block:

```json
"TAILSCALE_ALLOWED_TOOL_RISK": "write"
```

Set to `"admin"` to unlock destructive operations (delete, deauthorize, connect/disconnect, key mutation).

#### Docker Hub

```json
{
  "mcpServers": {
    "tailscale": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "TAILSCALE_API_KEY=tskey-api-...",
        "-e", "TAILSCALE_TAILNET=your-tailnet",
        "hexsleeves/tailscale-mcp-server:latest"
      ]
    }
  }
}
```

---

### Claude Code (CLI)

```bash
claude mcp add tailscale \
  -e TAILSCALE_API_KEY=tskey-api-... \
  -e TAILSCALE_TAILNET=- \
  -- npx -y @hexsleeves/tailscale-mcp-server
```

With write access:

```bash
claude mcp add tailscale \
  -e TAILSCALE_API_KEY=tskey-api-... \
  -e TAILSCALE_TAILNET=- \
  -e TAILSCALE_ALLOWED_TOOL_RISK=write \
  -- npx -y @hexsleeves/tailscale-mcp-server
```

---

### Cursor

Add to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "tailscale": {
      "command": "npx",
      "args": ["-y", "@hexsleeves/tailscale-mcp-server"],
      "env": {
        "TAILSCALE_API_KEY": "tskey-api-...",
        "TAILSCALE_TAILNET": "-"
      }
    }
  }
}
```

---

## Tool Reference

### Devices

| Tool | Description | Min risk |
|------|-------------|----------|
| `list_devices` | List all devices in the configured tailnet | `read` |
| `device_action` | Authorize or expire a device key (`write`); deauthorize or delete (`admin`) | `write` / `admin` |
| `manage_routes` | Enable or disable advertised routes for a device | `write` |

### Network

| Tool | Description | Min risk |
|------|-------------|----------|
| `get_network_status` | Get current Tailscale network status via local CLI | `read` |
| `connect_network` | Connect this host to Tailscale with optional CLI flags | `admin` |
| `disconnect_network` | Disconnect this host from Tailscale | `admin` |
| `ping_peer` | Ping a Tailscale peer through the local CLI | `read` |
| `get_version` | Get local Tailscale CLI version information | `read` |

### Administration

| Tool | Description | Min risk |
|------|-------------|----------|
| `get_tailnet_info` | Get detailed information about the configured tailnet | `read` |
| `manage_file_sharing` | Read (`read`) or update (`write`) tailnet file sharing settings | `read` / `write` |
| `manage_exit_nodes` | List exit nodes (`read`); set, clear, advertise, or stop advertising (`admin`) | `read` / `admin` |
| `manage_webhooks` | List webhooks (`read`); create, delete, or test webhooks (`write`) | `read` / `write` |
| `manage_device_tags` | Read (`read`) or update (`write`) tags for a device | `read` / `write` |
| `get_version_info` | Return server version identifier | `read` |

### ACL and Policy

| Tool | Description | Min risk |
|------|-------------|----------|
| `manage_acl` | Read (`read`), validate, or update (`write`) the tailnet ACL policy | `read` / `write` |
| `manage_dns` | Read (`read`) or update (`write`) Tailscale DNS settings | `read` / `write` |
| `manage_keys` | List auth keys (`read`); create or delete (`admin`) | `read` / `admin` |
| `manage_policy_file` | Read (`read`) or update (`write`) the tailnet policy file | `read` / `write` |
| `manage_network_lock` | Network lock status (`read`) and mutation operations (`admin`) | `read` / `admin` |

---

## Resources and Prompts

### Resources (read-only)

| URI | Description |
|-----|-------------|
| `tailscale://tailnet/summary` | High-level tailnet summary |
| `tailscale://devices` | All devices in the tailnet |
| `tailscale://devices/{deviceId}` | Detail for a single device |
| `tailscale://acl/current` | Current ACL policy |

### Prompts

| Name | Description |
|------|-------------|
| `diagnose_tailnet_connectivity` | Guided diagnostic for connectivity issues |
| `review_acl_change` | Structured review workflow for ACL policy changes |

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TAILSCALE_OAUTH_CLIENT_ID` | — | OAuth client ID (preferred auth method) |
| `TAILSCALE_OAUTH_CLIENT_SECRET` | — | OAuth client secret (required with `CLIENT_ID`) |
| `TAILSCALE_API_KEY` | — | Legacy API key fallback |
| `TAILSCALE_TAILNET` | `-` | Tailnet name or `-` shorthand for the default tailnet |
| `TAILSCALE_API_BASE_URL` | `https://api.tailscale.com` | Tailscale API base URL (https required except for localhost) |
| `TAILSCALE_ALLOWED_TOOL_RISK` | `read` | Maximum allowed tool risk: `read`, `write`, or `admin` |
| `TAILSCALE_CLI_PATH` | `tailscale` | Path to the local Tailscale CLI binary |
| `MCP_TRANSPORT` | `stdio` | Transport mode: `stdio` or `http` |
| `MCP_HTTP_BIND_HOST` | `127.0.0.1` | Host to bind in HTTP mode |
| `MCP_HTTP_PORT` | `3000` | Port to bind in HTTP mode |
| `MCP_HTTP_BEARER_TOKEN` | — | Required for HTTP mode (minimum 32 characters) |
| `MCP_ALLOWED_HOSTS` | — | Comma-separated additional allowed HTTP Host header values |
| `LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, or `error` |
| `MCP_SERVER_LOG_FILE` | — | Optional file path for log output |

### Risk levels

- `read` — list devices, inspect status, read resources, run diagnostics.
- `write` — update ACLs, DNS, routes, policy files, webhooks, tags, and other mutating settings.
- `admin` — destructive or host-affecting operations: delete, deauthorize, connect, disconnect, auth key mutation, file sharing changes, exit node control.

---

## HTTP Transport

HTTP mode is intended for private tailnet access. It requires `MCP_HTTP_BEARER_TOKEN` and binds to `127.0.0.1` by default.

```bash
export MCP_TRANSPORT=http
export MCP_HTTP_BEARER_TOKEN="$(openssl rand -base64 32)"
export TAILSCALE_OAUTH_CLIENT_ID="your-client-id"
export TAILSCALE_OAUTH_CLIENT_SECRET="your-client-secret"
export TAILSCALE_TAILNET="-"

npx -y @hexsleeves/tailscale-mcp-server --http --host 127.0.0.1 --port 3000
```

Expose privately with Tailscale Serve (recommended for tailnet deployments):

```bash
tailscale serve --bg 443 localhost:3000
```

Do not use Tailscale Funnel for normal MCP operation. Funnel makes the endpoint publicly reachable on the internet.

A `GET /health` endpoint returns `200 OK` when the server is running.

For full Docker sidecar deployment instructions, see [docs/docker.md](docs/docker.md).

---

## Docker

### Run with Docker Hub image

```bash
docker run --rm \
  -e TAILSCALE_API_KEY="tskey-api-..." \
  -e TAILSCALE_TAILNET="-" \
  -p 127.0.0.1:3000:3000 \
  hexsleeves/tailscale-mcp-server:latest
```

### Run with GHCR image

```bash
docker run --rm \
  -e TAILSCALE_API_KEY="tskey-api-..." \
  -e TAILSCALE_TAILNET="-" \
  -p 127.0.0.1:3000:3000 \
  ghcr.io/hexsleeves/tailscale-mcp-server:latest
```

### Build locally

```bash
docker build -t tailscale-mcp-server .
```

For sidecar deployment with Tailscale Serve, see [docs/docker.md](docs/docker.md).

---

## Example Prompts

Once the server is connected to your MCP client, try these:

- "List my Tailscale devices and show which ones are offline."
- "What is the current Tailscale network status on this machine?"
- "Diagnose connectivity to my NAS at 100.64.0.5."
- "Show me the current ACL policy for my tailnet."
- "Review this ACL change before I apply it." *(attach the new policy)*
- "What DNS nameservers is my tailnet using?"
- "List all active webhooks in my tailnet."

---

## Development

```bash
# Install dependencies (Bun required for development)
bun install

# Type check
bun run typecheck

# Run tests
bun test

# Lint and format
bun run check

# Build
bun run build

# Full verification (typecheck + lint + test + build)
bun run qa:full

# Security audit
bun audit
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development workflow, commit conventions, and release process.

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

- [CONTRIBUTING.md](CONTRIBUTING.md) — development setup, commit conventions, PR process.
- [SECURITY.md](SECURITY.md) — responsible disclosure policy.
- [LICENSE](LICENSE) — MIT.
