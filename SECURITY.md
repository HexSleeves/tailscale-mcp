# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.2.x   | ✅        |
| 1.1.x   | ❌        |
| < 1.1   | ❌        |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/HexSleeves/tailscale-mcp/security/advisories/new).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You can expect an acknowledgement within **48 hours** and a status update within **7 days**. If the vulnerability is accepted, a fix will be released as soon as possible and you will be credited in the release notes (unless you prefer to remain anonymous). If declined, we will explain why.

## Scope

This project is an MCP server that wraps the Tailscale CLI and API. Security issues of particular concern include:

- API key / OAuth token leakage
- Command injection via MCP tool inputs
- Privilege escalation through the risk-level scope system
- SSRF via configurable API base URLs
- Unauthorized access to tailnet data
