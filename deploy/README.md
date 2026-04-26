# Private Tailscale Deployment

This deployment runs the MCP server on localhost inside a Tailscale sidecar
network namespace, then exposes it privately with Tailscale Serve.

## Files

- `docker-compose.yml`: Tailscale sidecar plus MCP app container.
- `Dockerfile`: optional distroless image that runs a Bun-compiled binary.
- `tailscale/serve.json`: private Serve config for HTTPS on port `443`.
- `acl/policy.hujson`: minimal ACL example for `tag:mcp-server`.
- `.env.example`: required runtime variables.

## Setup

```bash
cp deploy/.env.example deploy/.env
```

Set these values in `deploy/.env`:

- `TS_AUTHKEY`: reusable or ephemeral auth key authorized to advertise
  `tag:mcp-server`.
- `MCP_HTTP_BEARER_TOKEN`: random token of at least 32 characters.
- Tailscale API credentials: either OAuth client credentials or an API key.

The default app posture remains read-only. Raise
`TAILSCALE_ALLOWED_TOOL_RISK=write` or `admin` only for deployments that need
mutating tools.

## Serve Hostname

`tailscale/serve.json` uses `tailscale-mcp:443` by default. If your tailnet
requires the full MagicDNS name or you change `TS_HOSTNAME`, replace both the
`Web` key and the `AllowFunnel` key with the generated hostname, for example:

```json
"tailscale-mcp.example.ts.net:443"
```

You can also generate a known-good config from a running sidecar:

```bash
docker compose -f deploy/docker-compose.yml exec ts-mcp \
  tailscale serve --bg --https=443 http://127.0.0.1:3000
docker compose -f deploy/docker-compose.yml exec ts-mcp \
  tailscale serve status --json
```

Use the exported JSON to replace `deploy/tailscale/serve.json` if needed.

## Run

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

Keep Funnel disabled for normal MCP operation. Serve is tailnet-private; Funnel
would make the endpoint public and needs a separate review.
