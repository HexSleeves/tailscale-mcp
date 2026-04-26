# CI/CD Workflows Documentation

This project uses GitHub Actions to validate the Bun workspace, publish npm releases, and build Docker images for the Tailscale MCP Server.

## Overview

- **CI** (`.github/workflows/ci.yml`) runs tests and quality checks for pushes and pull requests targeting `main`.
- **Release** (`.github/workflows/release.yml`) publishes npm releases from `v*` version tags or a manual dispatch with `release_tag`.
- **Docker** (`.github/workflows/docker.yml`) builds images for pull requests and publishes images from `main`, `v*` tags, and supported manual dispatches.

## CI Workflow

**Workflow name**: `CI`
**Job id**: `ci`
**Job name**: `Test, Build, Typecheck, Lint, Audit`
**Runner**: `ubuntu-latest`
**Triggers**: push to `main`, pull request to `main`, manual dispatch

The CI workflow is a single sequential Bun job. It no longer runs a Node.js version matrix and does not upload coverage to Codecov.

### Steps

1. Checkout the repository.
2. Set up Bun `1.3.13`.
3. Set up Node.js `20`.
4. Restore Bun dependency cache.
5. Install dependencies with `bun install --frozen-lockfile`.
6. Run `bun run lint`.
7. Run `bun run typecheck`.
8. Install the pinned Tailscale CLI package from the signed Tailscale apt repository and verify it with `tailscale version`.
9. Run `bun run test`.
10. Run `bun run build` and verify `dist/index.js`.
11. Build the compiled binary and smoke check it.
12. Run `bun audit --audit-level=moderate`.

## Release Workflow

**Workflow name**: `Release`
**Runner**: `ubuntu-latest`
**Triggers**: push of `v*` tags, manual dispatch with a `release_tag` input

The release workflow is tag-driven. It does not bump `package.json`, generate commits, or create tags. The pushed or manually supplied tag must match the package version, for example tag `v1.2.3` requires `"version": "1.2.3"` in `package.json`.

### Steps

1. Checkout the version tag.
2. Set up Bun `1.3.13` and Node.js `20` with npm registry auth configuration.
3. Install dependencies with `bun install --frozen-lockfile`.
4. Validate that the release tag matches `package.json`.
5. Run lint, typecheck, tests, build, binary smoke check, and `bun audit --audit-level=moderate`.
6. Publish to npm with `bun publish --access public` using `NODE_AUTH_TOKEN`.
7. Create a GitHub Release for the tag with generated release notes.

### Required Secret

| Secret      | Purpose                  |
| ----------- | ------------------------ |
| `NPM_TOKEN` | Publish the package to npm |

## Docker Workflow

**Workflow name**: `Docker`
**Runner**: `ubuntu-latest`
**Triggers**: push to `main`, push of `v*` tags, pull request to `main`, manual dispatch

Pull requests build images without pushing them. Pushes to `main` and `v*` tags build and publish images. Publish runs are not cancelled in progress so multi-platform pushes are not interrupted mid-release.

### Registry Targets

- GitHub Container Registry: `ghcr.io/${{ github.repository }}`
- Docker Hub: `${DOCKER_HUB_USERNAME}/tailscale-mcp-server`, only when both Docker Hub secrets are configured

### Tagging

- Pull requests: PR metadata tags, build only
- `main`: branch and SHA tags
- `v1.2.3`: `1.2.3`, `1.2`, `1`, SHA tag, and `latest`

### Security Scanning

After a pushed image is available, the workflow scans the GHCR image with Trivy and uploads SARIF results to GitHub Security. PR builds do not run the registry scan because no image is pushed.

### Optional Docker Hub Secrets

| Secret                | Purpose                    |
| --------------------- | -------------------------- |
| `DOCKER_HUB_USERNAME` | Docker Hub repository owner |
| `DOCKER_HUB_TOKEN`    | Docker Hub publish token    |

## Local Verification

Use these commands before changing workflows:

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build
bun audit --audit-level=moderate
docker build .
```
