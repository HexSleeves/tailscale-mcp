# Contributing to Tailscale MCP Server

Thank you for taking the time to contribute. This document covers how to set up a development environment, run tests, follow commit conventions, and get changes merged.

## Table of Contents

- [Development Setup](#development-setup)
- [Running the Server Locally](#running-the-server-locally)
- [Tests](#tests)
- [Lint and Format](#lint-and-format)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)
- [Security Issues](#security-issues)

---

## Development Setup

Bun is required for development. Node.js 20+ is sufficient for running the published package but not for building it.

```bash
# 1. Fork and clone
git clone https://github.com/HexSleeves/tailscale-mcp.git
cd tailscale-mcp

# 2. Install dependencies
bun install

# 3. Copy the example env file and fill in your credentials
cp .env.example .env
# edit .env — set TAILSCALE_API_KEY or TAILSCALE_OAUTH_CLIENT_ID/SECRET
```

---

## Running the Server Locally

```bash
# Start with stdio transport (default)
bun run dev

# Start with HTTP transport
MCP_TRANSPORT=http \
MCP_HTTP_BEARER_TOKEN="$(openssl rand -base64 32)" \
bun run dev -- --http --port 3000
```

Connect a client with the MCP Inspector:

```bash
bun run inspector
```

---

## Tests

```bash
# Run all tests once
bun test

# Run tests in watch mode
bun test --watch

# Run a single test file
bun test src/__test__/config.test.ts
```

Full verification (typecheck + lint + tests + build):

```bash
bun run qa:full
```

All tests must pass and `bun run typecheck` must succeed before a PR is merged.

---

## Lint and Format

The project uses [Biome](https://biomejs.dev) for both linting and formatting.

```bash
# Check lint and format (no writes)
bun run check

# Apply safe auto-fixes
bun run check:fix

# Format only
bun run format

# Lint only
bun run lint
```

CI enforces `bun run check` with no uncommitted changes allowed after the run.

---

## Commit Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

Common types:

| Type | When to use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `chore` | Build, deps, CI, or config change |
| `docs` | Documentation only |
| `test` | Adding or improving tests |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `security` | Security improvement (use `fix` if it resolves a CVE) |

Scope examples: `mcp`, `security`, `ci`, `tools`, `config`.

Keep the subject line under 72 characters. Use the imperative mood ("add", "fix", "remove", not "added", "fixed", "removed").

---

## Pull Request Process

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/short-description
   ```
2. Make your changes and add tests for new behaviour.
3. Run the full check suite: `bun run qa:full`.
4. Push and open a pull request against `main`.
5. Fill in the PR template (what, why, how to test).
6. At least one approval is required before merging.
7. Squash-merge is preferred for feature branches; merge commits are used for release PRs.

Please keep PRs focused. Unrelated cleanup belongs in a separate PR.

---

## Release Process

Releases are automated via GitHub Actions. No manual npm or Docker publish steps are needed.

1. Ensure `main` is in a releasable state (all CI checks green).
2. Bump the version in `package.json` following semantic versioning.
3. Update `CHANGELOG.md`: move items from `[Unreleased]` to a new dated version section.
4. Commit the version bump:
   ```bash
   git commit -m "chore: bump version to X.Y.Z"
   ```
5. Tag the commit:
   ```bash
   git tag vX.Y.Z
   git push origin main --tags
   ```

Pushing a `v*` tag triggers the release workflow which:

- Publishes the package to npm (`@hexsleeves/tailscale-mcp-server`).
- Builds and pushes Docker images to Docker Hub (`hexsleeves/tailscale-mcp-server`) and GHCR (`ghcr.io/hexsleeves/tailscale-mcp-server`).
- Creates a GitHub Release with the tag.

The workflow is idempotent: it skips the npm publish step if the version already exists on the registry.

---

## Security Issues

Please do not open a public GitHub issue for security vulnerabilities. Follow the disclosure process in [SECURITY.md](SECURITY.md).
