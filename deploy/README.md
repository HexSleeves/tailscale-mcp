# Deployment Guide

This directory contains all artifacts needed to run tailscale-mcp behind a
Tailscale sidecar using Docker Compose.

## Prerequisites

- Docker 24+ with Compose v2
- A Tailscale account with admin access to your tailnet
- Linux host with `/dev/net/tun` available

---

## 1. Create an OAuth client

1. Open https://login.tailscale.com/admin/settings/oauth
2. Create a new OAuth client with scope `auth_keys` (write).
3. Under "Tags", add `tag:mcp-server`.
4. Save the client ID and secret — you will need both.
5. Generate an ephemeral auth key from the client so the node is
   automatically removed from the tailnet when the container stops.

---

## 2. Apply the ACL policy

1. Open https://login.tailscale.com/admin/acls
2. Merge the contents of `acl/policy.hujson` into your tailnet's ACL.
3. Adjust the `group:devops` and `group:read-only` members to match your
   actual Tailscale groups.

---

## 3. Configure environment variables

```sh
cp deploy/.env.example deploy/.env
# edit deploy/.env with real values
```

Required variables:

| Variable | Description |
|---|---|
| `TS_AUTHKEY` | Ephemeral OAuth auth key (tag:mcp-server) |
| `TAILSCALE_TAILNET` | Your tailnet name, e.g. `example.ts.net` |
| `TAILSCALE_OAUTH_CLIENT_ID` | OAuth client ID for API access |
| `TAILSCALE_OAUTH_CLIENT_SECRET` | OAuth client secret for API access |

---

## 4. Start the stack

From the repository root:

```sh
docker compose up -d --build
```

Or from the `deploy/` directory:

```sh
docker compose -f deploy/docker-compose.yml up -d --build
```

---

## 5. Verify

```sh
# From any device on the tailnet:
tailscale ping tailscale-mcp

# Point your MCP client at:
https://tailscale-mcp.<tailnet>.ts.net/mcp
```

Check container health:

```sh
docker compose ps
docker compose logs ts-mcp
docker compose logs app
```

---

## What is and is not enabled by default

| Feature | Status | Notes |
|---|---|---|
| Tailnet-only access | Enabled | Traffic never leaves your tailnet |
| Tailscale Funnel | Disabled | `AllowFunnel: false` in serve.json |
| DNS rebinding protection | Enabled | `HTTP_ALLOWED_HOSTS` validates Host header |
| Distroless image | Enabled | `gcr.io/distroless/cc-debian12:nonroot` |
| Read-only root filesystem | Enabled | `read_only: true` in compose |
| No new privileges | Enabled | `no-new-privileges:true` security opt |
| HTTPS termination | Enabled | Tailscale serves TLS via Let's Encrypt |
| Ephemeral node | Enabled | Node removed from tailnet on shutdown |

---

## Directory layout

```
deploy/
  Dockerfile              multi-stage Bun build + distroless final
  docker-compose.yml      Tailscale sidecar + app (deploy/ context)
  .env.example            documented environment variable template
  tailscale/
    serve.json            Tailscale serve config (HTTPS proxy to :3000)
  acl/
    policy.hujson         example tailnet ACL with capability grants
  README.md               this file
```

The root `Dockerfile` and `docker-compose.yml` are mirrors of the `deploy/`
versions adjusted for a root build context.
