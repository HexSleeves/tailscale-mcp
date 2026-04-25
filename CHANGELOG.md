# Changelog

All notable changes to this project are documented in this file.

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
