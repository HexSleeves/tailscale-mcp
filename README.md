# Tailscale MCP Server

A modern [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that provides seamless integration with Tailscale's CLI commands and REST API, enabling automated network management and monitoring through a standardized interface.

## 📦 Available Packages

- **NPM**: [`@hexsleeves/tailscale-mcp-server`](https://www.npmjs.com/package/@hexsleeves/tailscale-mcp-server)
- **Docker Hub**: [`hexsleeves/tailscale-mcp-server`](https://hub.docker.com/r/hexsleeves/tailscale-mcp-server)
- **GitHub Container Registry**: [`ghcr.io/hexsleeves/tailscale-mcp-server`](https://github.com/users/HexSleeves/packages/container/package/tailscale-mcp-server)

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
- **[🧪 Testing Strategy](src/__test__/README.md)** - Unit tests, integration tests, and testing best practices
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
        "run", "--rm", "-i",
        "-e", "TAILSCALE_API_KEY=your-api-key",
        "-e", "TAILSCALE_TAILNET=your-tailnet",
        "ghcr.io/hexsleeves/tailscale-mcp-server:latest"
      ]
    }
  }
}
```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `TAILSCALE_API_KEY` | Tailscale API key | Yes* | - |
| `TAILSCALE_TAILNET` | Tailscale tailnet name | Yes* | - |
| `TAILSCALE_API_BASE_URL` | API base URL | No | `https://api.tailscale.com` |
| `LOG_LEVEL` | Logging level (0-3) | No | `1` (INFO) |
| `MCP_SERVER_LOG_FILE` | Server log file path | No | - |

*Required for API-based operations. CLI operations work without API credentials.

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
npm install

# Setup environment
cp .env.example .env
# Edit .env with your Tailscale credentials

# Build and run
npm run build
npm start
```

### Development Commands

```bash
# Development workflow
npm run dev:direct        # Fast development with tsx
npm run dev:watch         # Auto-rebuild on changes
npm run build:watch       # Build with file watching

# Testing
npm test                  # All tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests (requires Tailscale CLI)
npm run test:watch        # Watch mode

# Quality assurance
npm run qa                # Quick QA (typecheck + unit tests + lint)
npm run qa:full           # Full QA (all tests + checks)
npm run typecheck         # TypeScript validation

# Tools
npm run inspector         # Test with MCP Inspector
```

### Local Claude Desktop Configuration

```json
{
  "mcpServers": {
    "tailscale-dev": {
      "command": "node",
      "args": ["/path/to/your/tailscale-mcp-server/dist/index.js"],
      "env": {
        "TAILSCALE_API_KEY": "your-api-key-here",
        "TAILSCALE_TAILNET": "your-tailnet-name",
        "LOG_LEVEL": "0"
      }
    }
  }
}
```

> **📖 For comprehensive development guides, testing strategies, and CI/CD information:**
> - **[Testing Documentation](src/__test__/README.md)** - Unit tests, integration tests, coverage
> - **[Docker Development](docs/docker.md)** - Container-based development workflows
> - **[CI/CD Workflows](docs/workflows.md)** - GitHub Actions, automation, releases





### Project Structure

```bash
src/
├── server.ts              # Main server implementation
├── tools/                 # Modular tool definitions
├── tailscale/             # Tailscale integrations
├── types.ts               # Type definitions
├── logger.ts              # Logging utilities
└── index.ts               # Entry point
```

### Adding New Tools

Create a tool module in `src/tools/` and register it in `src/server.ts`. See existing tools for examples of the modular architecture using Zod schemas and TypeScript.

### Debugging

```bash
# Enable debug logging
export LOG_LEVEL=0
export MCP_SERVER_LOG_FILE=debug-{timestamp}.log

# View logs
tail -f logs/debug-*.log
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
4. Run quality checks: `npm run qa:full`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Guidelines

- Use TypeScript for all new code
- Add Zod schemas for input validation
- Include tests for new tools (see [Testing Guide](src/__test__/README.md))
- Follow the existing modular architecture
- Update documentation for new features

### Resources for Contributors

- **[Testing Strategy](src/__test__/README.md)** - How to write and run tests
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
