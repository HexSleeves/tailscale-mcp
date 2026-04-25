# Tailscale MCP Server

A modern [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that provides seamless integration with Tailscale's CLI commands and REST API, enabling automated network management and monitoring through a standardized interface.

<a href="https://glama.ai/mcp/servers/@HexSleeves/tailscale-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@HexSleeves/tailscale-mcp/badge" alt="Tailscale Server MCP server" />
</a>

## 📦 Available Packages

- **NPM**: [`@hexsleeves/tailscale-mcp-server`](https://www.npmjs.com/package/@hexsleeves/tailscale-mcp-server)
- **Docker Hub**: [`hexsleeves/tailscale-mcp-server`](https://hub.docker.com/r/hexsleeves/tailscale-mcp-server)
- **GitHub Container Registry**: [`ghcr.io/hexsleeves/tailscale-mcp-server`](https://github.com/users/HexSleeves/packages/container/package/tailscale-mcp-server)

## 🚀 Runtime

This project requires **[Bun](https://bun.sh) ≥ 1.3** (see `engines.bun` in `package.json`). Bun runs TypeScript natively, ships its own bundler, and replaces the need for `node`, `tsx`, `esbuild`, or `dotenv` here.

### Quick Setup

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Configure
cp deploy/.env.example .env  # fill TAILSCALE_API_KEY (or OAuth) + TAILSCALE_TAILNET
```

### Fallback with NPM

```bash
npm ci
npm run build
npm start
```

## Features

- **Device Management**: List, authorize, deauthorize, and manage Tailscale devices
- **Network Operations**: Connect/disconnect, manage routes, and monitor network status
- **Security Controls**: Manage ACLs, device tags, and network lock settings
- **Modern Architecture**: Modular tool system with TypeScript and Zod validation
- **CLI Integration**: Direct integration with Tailscale CLI commands
- **API Integration**: REST API support for advanced operations

## 📚 Documentation

This project includes comprehensive documentation organized by domain:

- **[🔧 CI/CD Workflows](docs/workflows.md)** - GitHub Actions, testing pipelines, and release automation
- **[🧪 Testing Strategy](tests/)** - Unit tests, integration tests, and testing best practices
- **[🐳 Docker Guide](docs/docker.md)** - Container usage, development workflows, and deployment strategies

## Quick Start

### Option 1: NPX (Recommended)

Run directly without installation:

```bash
# Explicit package syntax (most reliable)
npx --package=@hexsleeves/tailscale-mcp-server tailscale-mcp-server

# Or install globally
npm install -g @hexsleeves/tailscale-mcp-server
tailscale-mcp-server
```

### Option 2: Docker

```bash
# GitHub Container Registry (recommended)
docker run -d \
  --name tailscale-mcp \
  -e TAILSCALE_API_KEY=your_api_key \
  -e TAILSCALE_TAILNET=your_tailnet \
  ghcr.io/hexsleeves/tailscale-mcp-server:latest

# Or use Docker Compose
docker-compose up -d
```

> **📖 For detailed Docker usage, development workflows, and deployment strategies, see the [Docker Guide](docs/docker.md)**

## Configuration

### Claude Desktop

Add to your Claude Desktop configuration (`~/.claude/claude_desktop_config.json`):

#### Using NPX (Recommended)

```json
{
  "mcpServers": {
    "tailscale": {
      "command": "npx",
      "args": [
        "--package=@hexsleeves/tailscale-mcp-server",
        "tailscale-mcp-server"
      ],
      "env": {
        "TAILSCALE_API_KEY": "your-api-key-here",
        "TAILSCALE_TAILNET": "your-tailnet-name"
      }
    }
  }
}
```

#### Using Docker

```json
{
  "mcpServers": {
    "tailscale": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "TAILSCALE_API_KEY=your-api-key",
        "-e",
        "TAILSCALE_TAILNET=your-tailnet",
        "ghcr.io/hexsleeves/tailscale-mcp-server:latest"
      ]
    }
  }
}
```

### Environment Variables

#### Authentication (choose one method)

| Variable                        | Description                   | Required |
| ------------------------------- | ----------------------------- | -------- |
| `TAILSCALE_API_KEY`             | Tailscale API key             | Option 1 |
| `TAILSCALE_OAUTH_CLIENT_ID`     | OAuth client ID               | Option 2 |
| `TAILSCALE_OAUTH_CLIENT_SECRET` | OAuth client secret           | Option 2 |

#### General Configuration

| Variable                  | Description                                      | Required | Default                     |
| ------------------------- | ------------------------------------------------ | -------- | --------------------------- |
| `TAILSCALE_TAILNET`       | Tailscale tailnet name                           | Yes\*    | -                           |
| `TAILSCALE_API_BASE_URL`  | API base URL                                     | No       | `https://api.tailscale.com` |
| `TAILSCALE_CLI_PATH`      | Path to the `tailscale` CLI binary               | No       | `tailscale`                 |
| `TRANSPORT`               | `stdio` or `http`                                | No       | `stdio`                     |
| `HTTP_PORT`               | HTTP transport port                              | No       | `3000`                      |
| `HTTP_HOST`               | HTTP bind address                                | No       | `0.0.0.0`                   |
| `HTTP_ALLOWED_HOSTS`      | CSV of allowed `Host` header values (rebind protection) | No | `localhost,127.0.0.1,::1`   |
| `HTTP_ALLOWED_ORIGINS`    | CSV of allowed `Origin` values (CORS / rebind)   | No       | derived from hosts          |
| `LOG_LEVEL`               | `trace`/`debug`/`info`/`warn`/`error`            | No       | `info`                      |

\*Required for API-based operations. CLI operations work without API credentials.

### OAuth vs API Key Authentication

**API Key** (`TAILSCALE_API_KEY`):

- Full permissions matching the user who created the key
- Expires in 1-90 days
- Tied to a specific user account

**OAuth Client** (`TAILSCALE_OAUTH_CLIENT_ID` + `TAILSCALE_OAUTH_CLIENT_SECRET`):

- Scoped permissions (e.g., read-only device access)
- Does not expire (but can be revoked)
- Not tied to any user account
- Recommended for automation and least-privilege access

#### Creating an OAuth Client

1. Go to [Tailscale OAuth Settings](https://login.tailscale.com/admin/settings/oauth)
2. Click "Generate OAuth client"
3. Select the required scopes (e.g., `devices:read` for read-only device access)
4. Copy the client ID and secret

#### OAuth Configuration Example

```json
{
  "mcpServers": {
    "tailscale": {
      "command": "npx",
      "args": [
        "--package=@hexsleeves/tailscale-mcp-server",
        "tailscale-mcp-server"
      ],
      "env": {
        "TAILSCALE_OAUTH_CLIENT_ID": "your-oauth-client-id",
        "TAILSCALE_OAUTH_CLIENT_SECRET": "your-oauth-client-secret",
        "TAILSCALE_TAILNET": "your-tailnet-name"
      }
    }
  }
}
```

#### Available OAuth Scopes

| Scope              | Description                          |
| ------------------ | ------------------------------------ |
| `all:read`         | Read-only access to all resources    |
| `devices:read`     | Read device information              |
| `devices:core`     | Full device management               |
| `dns:read`         | Read DNS settings                    |
| `dns:write`        | Modify DNS settings                  |
| `acl:read`         | Read ACL configuration               |
| `acl:write`        | Modify ACL configuration             |
| `auth_keys`        | Manage authentication keys           |

See [Tailscale OAuth Scopes](https://tailscale.com/kb/1215/oauth-clients#scopes) for a complete list.

## Available Tools

### Device Management

- `list_devices` - List all devices in the Tailscale network
- `device_action` - Perform actions on specific devices (authorize, deauthorize, delete, expire-key)
- `manage_routes` - Enable or disable routes for devices

### Network Operations

- `get_network_status` - Get current network status from Tailscale CLI
- `connect_network` - Connect to the Tailscale network
- `disconnect_network` - Disconnect from the Tailscale network
- `ping_peer` - Ping a peer device

### System Information

- `get_version` - Get Tailscale version information
- `get_tailnet_info` - Get detailed network information

## Development

### Quick Setup

```bash
# Clone and setup
git clone https://github.com/HexSleeves/tailscale-mcp-server.git
cd tailscale-mcp-server

# Install Bun (recommended) or use npm
curl -fsSL https://bun.sh/install | bash
bun install  # or: npm install

# Setup environment
cp .env.example .env
# Edit .env with your Tailscale credentials

# Develop (Bun runs TypeScript natively)
bun run dev

# Or compile a single-binary executable
bun run build
./dist/server
```

### Development Commands

```bash
bun run dev                # bun --hot src/main.ts
bun run start              # bun src/main.ts
bun run build              # compile to dist/server (Bun-native)
bun run build:node         # ESM bundle for Node deployments

bun test                   # all tests
bun run test:cov           # tests + coverage

bun run typecheck          # tsc --noEmit
bun run lint               # biome check .
bun run lint:fix           # biome check --write .
bun run qa                 # typecheck + lint + tests

bun run inspector          # MCP Inspector against src/main.ts
bun run audit              # bun audit
```

### Local Claude Desktop Configuration

```json
{
  "mcpServers": {
    "tailscale-dev": {
      "command": "bun",
      "args": ["/path/to/tailscale-mcp/src/main.ts"],
      "env": {
        "TAILSCALE_API_KEY": "tskey-api-...",
        "TAILSCALE_TAILNET": "your-tailnet.ts.net",
        "TRANSPORT": "stdio",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

For HTTP transport behind a Tailscale sidecar, see **[deploy/README.md](deploy/README.md)**.

### Project Structure

```text
src/
├── main.ts                # entry: env → logger → server → transport
├── server.ts              # createMcpServer() — registers tools
├── config.ts              # zod-validated env
├── logger.ts              # pino, stderr only
├── errors.ts              # TailscaleError / CLIError / ValidationError
├── lib/
│   ├── tool.ts            # defineTool() helper (registers w/ McpServer)
│   └── validate.ts        # CIDR/host/string input guards
├── tailscale/
│   ├── tailscale-api.ts   # REST client (fetch, OAuth + API key)
│   ├── tailscale-cli.ts   # execFile wrapper, no shell
│   └── oauth.ts           # OAuth 2.0 client-credentials flow
├── tools/
│   ├── index.ts           # registerAllTools()
│   ├── devices.ts         # list_devices, device_action, manage_routes
│   ├── network.ts         # network_status, ping_peer, up/down, get_version
│   ├── acl.ts             # manage_acl
│   └── admin.ts           # manage_dns, manage_keys, tailnet_info
├── transports/
│   ├── stdio.ts           # MCP over stdin/stdout
│   └── http.ts            # Streamable HTTP (DNS-rebind protection on)
└── types.ts               # zod schemas for API/CLI responses

tests/
├── setup.ts               # bun:test preload (pinned env)
└── unit/                  # config / errors / validate

deploy/
├── Dockerfile             # Bun → distroless, single-binary
├── docker-compose.yml     # Tailscale sidecar + app
├── tailscale/serve.json   # tailnet-only HTTPS, Funnel disabled
├── acl/policy.hujson      # tag:mcp-server + grants example
└── README.md              # operator guide
```

### Adding New Tools

Add a registration function in `src/tools/<area>.ts` using `defineTool(server, ctx, { name, title, description, inputSchema, outputSchema?, handler })`. Wire it up in `src/tools/index.ts`. Zod input/output schemas become the JSON Schema the MCP client sees, and `outputSchema` enables `structuredContent` responses.

### Debugging

```bash
# Stderr structured logs (pino JSON)
LOG_LEVEL=debug bun src/main.ts

# Pretty logs in dev (auto-detected when NODE_ENV=development)
NODE_ENV=development bun --hot src/main.ts

# Talk to it interactively
bun run inspector
```

## API Reference

### Tool Categories

#### Device Tools

- Device listing and filtering
- Device authorization management
- Route management per device

#### Network Tools

- Network status monitoring
- Connection management
- Peer connectivity testing

#### Security Tools

- ACL management
- Device tagging
- Network lock operations

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run quality checks: `bun run qa:full` (or `npm run qa:full`)
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Guidelines

- Use TypeScript for all new code
- Add Zod schemas for input validation
- Include tests for new tools (see [Testing Guide](tests/))
- Follow the existing modular architecture
- Update documentation for new features

### Resources for Contributors

- **[Testing Strategy](tests/)** - How to write and run tests
- **[CI/CD Workflows](docs/workflows.md)** - Understanding the automation pipeline
- **[Docker Development](docs/docker.md)** - Container-based development workflows

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- [Issues](https://github.com/your-repo/issues) - Bug reports and feature requests
- [Discussions](https://github.com/your-repo/discussions) - Questions and community support
- [MCP Documentation](https://modelcontextprotocol.io) - Learn more about MCP

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.
