# Changelog

All notable changes to this project are documented in this file.

## [1.3.2] - 2026-07-03

### Security

- Pinned `form-data` to 4.0.6 through dependency overrides to clear the transitive axios audit advisory.

## [1.3.1] - 2026-07-03

### Maintenance

- Added pnpm workspace and lockfile metadata for package-manager compatibility.
- Updated dependency overrides for `brace-expansion`, `fast-uri`, `hono`, and `qs`.
- Updated runtime and development dependencies including `axios`, `@biomejs/biome`, `@types/node`, and `esbuild`.
- Updated GitHub Actions dependencies for `actions/checkout` and `actions/cache`.

## [1.3.0] - 2026-06-10

### Added

- Node.js runtime compatibility: added `node` shebang to the compiled entry point and switched subprocess spawning from `Bun.spawn` to `node:child_process`. The package now runs with plain Node.js 20+ via `npx -y @hexsleeves/tailscale-mcp-server`.
- `engines` field in `package.json` declares `node >=20`.
- 81 unit tests covering all 15 MCP tools, risk-level gating, and resource handlers.
- `CONTRIBUTING.md`, GitHub issue templates, and an MCP registry `server.json` manifest.

### Changed

- README consolidated: quick-start configs for Claude Desktop, Claude Code, and Cursor; full tool reference table; environment variable table.
- Removed dead logger module that was no longer reachable after the 1.0.0 server rebuild.
- Tailnet summary errors now log a structured message instead of swallowing the failure silently.

### Security

- Tailscale CLI stderr output is now redacted before being forwarded to logs, preventing accidental exposure of auth keys in diagnostic output.
- Input validation tightened across tool handlers to reject empty strings and out-of-range values earlier.
- Bumped `hono` override to 4.12.21, clearing four moderate audit advisories in the transitive dependency chain.

---

## [1.2.0] - 2026-05-10

### Fixed

- Fixed MCP tool errors being masked by non-conforming `structuredContent` shapes; errors now surface correctly to the client.
- Fixed IPv6 loopback check for HTTP base URL validation so `[::1]` is accepted as a safe local address.
- Fixed API path parameters being passed unencoded; all device IDs and tailnet names are now percent-encoded.
- Fixed `MCP_HTTP_BEARER_TOKEN` validation to require 32+ character minimum, enforced at startup.
- Fixed npm publish step in CI (`npm publish` replacing broken `bun publish` invocation).

### Changed

- Removed unused legacy server stack that remained from the pre-1.0.0 codebase.
- Removed unused `@modelcontextprotocol/sdk/zod` dependency.
- OAuth token cache is now evicted on API 401 responses to force re-authentication.
- Consolidated release workflow: single job publishes to npm and Docker in sequence with injection-safe secret handling.

### Maintenance

- Configured Renovate for automated dependency updates.
- Bumped all GitHub Actions to latest major versions (checkout v6, setup-node v6, upload-artifact v7, docker/* v4-v7, codeql v4).

---

## [1.1.0] - 2026-04-30

### Added

- Enhanced route handling: `manage_routes` tool now validates CIDR notation and returns structured route state after mutations.
- Added `AGENTS.md` with contributor guidance for AI-assisted development workflows.
- Added Glama MCP registry build configuration.

### Changed

- Updated CI cache action to v5.
- Cleaned up project documentation and resolved audit warnings from transitive dependencies.

### Fixed

- Fixed Docker build failures related to the security audit step in CI.

---

## [1.0.0] - 2026-04-25

### Added

- Rebuilt the server as a Bun-first TypeScript MCP server using the high-level MCP SDK server API.
- Added a single MCP server factory with modular capability registration for tools, resources, prompts, and transports.
- Added stdio-first startup for local MCP clients, with logs kept off stdout.
- Added optional Streamable HTTP transport with localhost binding by default.
- Added HTTP bearer token enforcement, Host header validation, request size limits, and in-memory rate limiting.
- Added centralized Zod environment validation for transport, HTTP auth, Tailscale credentials, tailnet selection, logging, and allowed tool risk.
- Added OAuth client credentials support with token caching and API key compatibility fallback.
- Added a Tailscale service layer over API and CLI clients.
- Added structured MCP tool responses and output schemas for device, network, ACL, and admin tools.
- Added read-only resources:
  - `tailscale://tailnet/summary`
  - `tailscale://devices`
  - `tailscale://devices/{deviceId}`
  - `tailscale://acl/current`
- Added prompts:
  - `diagnose_tailnet_connectivity`
  - `review_acl_change`
- Added risk-gated tool execution with `read`, `write`, and `admin` levels.
- Added tests for config validation, redaction, HTTP auth helpers, risk gates, and logger behavior.
- Added TypeScript declaration build support through `tsconfig.build.json`.

### Changed

- Updated the runtime and deployment posture around Bun for development, builds, and production containers.
- Updated Docker production image to use the Bun runtime.
- Reworked README guidance around local stdio usage, private HTTP deployment, OAuth credentials, risk levels, and Tailscale Serve.
- Updated `.env.example` to document the new transport, auth, logging, and risk configuration.
- Updated CI to include audit and build checks alongside typecheck, lint, and tests.
- Updated the build pipeline to emit executable Bun-compatible output plus declarations.
- Upgraded TypeScript to `6.0.3`.

### Security

- Added structured secret redaction for Tailscale auth keys, bearer tokens, API keys, OAuth secrets, and auth-related command arguments.
- Changed stdio logging behavior so operational logs go to stderr or file destinations, preserving stdout for JSON-RPC messages.
- Defaulted HTTP mode to `127.0.0.1` and required explicit bearer authentication.
- Added private-host validation for HTTP requests to reduce DNS rebinding exposure.
- Added fail-closed risk checks so write and admin operations require explicit `TAILSCALE_ALLOWED_TOOL_RISK` elevation.
- Reduced brittle external API parsing by accepting unknown Tailscale API response fields.

### Fixed

- Fixed the previous Docker mismatch where the production image used Node while the command expected Bun.
- Fixed Tailscale CLI command logging so sensitive command arguments are redacted.
- Fixed `ipaddr.js` ESM interop for IP and CIDR validation.
- Fixed Tailscale ping argument ordering for current CLI syntax.
- Added a ping timeout in CLI paths to avoid slow or hanging validation scenarios.

### Compatibility Notes

- The package name remains `@hexsleeves/tailscale-mcp-server`.
- Existing stable tool names are preserved where practical.
- HTTP mode is now private and authenticated by default. Set `MCP_HTTP_BEARER_TOKEN` when enabling HTTP transport.
- Mutating and destructive tools now require explicit `TAILSCALE_ALLOWED_TOOL_RISK` configuration.

[1.0.0]: https://github.com/HexSleeves/tailscale-mcp/compare/v0.3.2...v1.0.0
