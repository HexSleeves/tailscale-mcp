# Consolidated Dependabot Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use senior-staff-engineer:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Dependabot PRs #139, #141, and #142 with one verified dependency-update PR.

**Architecture:** Apply the exact requested versions to the manifest and workflows, regenerate both authoritative lockfiles, and validate the combined dependency graph through every release gate. Keep the update in one signed implementation commit after the committed design.

**Tech Stack:** Bun 1.3.x, pnpm lockfile v9, TypeScript 7, Biome 2.5, GitHub Actions, Docker

---

### Task 1: Review upstream changes

**Files:**
- Read: `package.json:71`
- Read: `.github/workflows/ci.yml:35`
- Read: `.github/workflows/release.yml:49`

- [ ] **Step 1: Review the exact Dependabot diffs**

Run:

```bash
gh pr diff 139 --repo HexSleeves/tailscale-mcp
gh pr diff 141 --repo HexSleeves/tailscale-mcp
gh pr diff 142 --repo HexSleeves/tailscale-mcp
```

Expected: versions are Biome 2.5.3, Node types 26.1.1, TypeScript 7.0.2, tsx 4.23.1, and setup-node v7.

- [ ] **Step 2: Review primary release notes**

Review:

```text
https://github.com/biomejs/biome/releases/tag/%40biomejs%2Fbiome%402.5.3
https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
https://github.com/microsoft/typescript-go/releases/tag/typescript/v7.0.2
https://github.com/privatenumber/tsx/releases/tag/v4.23.1
https://github.com/actions/setup-node/releases/tag/v7.0.0
```

Run `npm diff --diff=@types/node@26.1.0 --diff=@types/node@26.1.1` for the published Node type-definition patch.

Expected: no migration beyond the version and lockfile updates is required; TypeScript 7 compatibility remains subject to the repository typecheck and declaration build.

### Task 2: Apply package and workflow versions

**Files:**
- Modify: `package.json:71`
- Modify: `.github/workflows/ci.yml:35`
- Modify: `.github/workflows/release.yml:49`
- Modify: `.github/workflows/release.yml:159`

- [ ] **Step 1: Update development dependencies**

Set:

```json
"@biomejs/biome": "2.5.3",
"@types/node": "26.1.1",
"tsx": "4.23.1",
"typescript": "7.0.2"
```

- [ ] **Step 2: Update setup-node**

Replace all three occurrences with:

```yaml
uses: actions/setup-node@v7
```

- [ ] **Step 3: Verify exact manifest and workflow versions**

Run:

```bash
rg -n '"(@biomejs/biome|@types/node|tsx|typescript)"|actions/setup-node@' package.json .github/workflows
```

Expected: only the approved versions appear.

### Task 3: Regenerate both lockfiles

**Files:**
- Modify: `bun.lock`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Regenerate the Bun lockfile**

Run:

```bash
bun install
```

Expected: `bun.lock` records all four updated development dependencies.

- [ ] **Step 2: Regenerate the pnpm lockfile**

Run:

```bash
pnpm install --lockfile-only
```

Expected: `pnpm-lock.yaml` records the same four direct versions without unrelated manifest changes.

- [ ] **Step 3: Verify immutable installs**

Run:

```bash
bun install --frozen-lockfile
pnpm install --lockfile-only --frozen-lockfile
```

Expected: both commands exit 0 without lockfile changes.

### Task 4: Validate the combined update

**Files:**
- Verify: `package.json`
- Verify: `bun.lock`
- Verify: `pnpm-lock.yaml`
- Verify: `.github/workflows/ci.yml`
- Verify: `.github/workflows/release.yml`

- [ ] **Step 1: Run code-quality gates**

Run:

```bash
bun run lint
bun run typecheck
bun run test
```

Expected: 0 lint errors, 0 type errors, and all tests pass.

- [ ] **Step 2: Run build gates**

Run:

```bash
bun run build
test -f dist/index.js
bun run build:binary
```

Expected: JavaScript, declarations, and compiled binary build successfully.

- [ ] **Step 3: Run security and runtime smokes**

Run:

```bash
bun audit --audit-level=moderate
out=$(printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"dependency-update","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  | TAILSCALE_API_KEY=tskey-api-FAKE TAILSCALE_TAILNET=- LOG_LEVEL=error ./dist/server)
printf '%s\n' "$out" | grep -q '"protocolVersion":"2025-06-18"'
docker build .
```

Expected: audit reports no moderate-or-higher vulnerabilities, protocol initialization succeeds, and the Docker image builds.

- [ ] **Step 4: Run HTTP health smoke**

Run:

```bash
MCP_TRANSPORT=http \
MCP_HTTP_BEARER_TOKEN=dependency-health-smoke-0123456789abcdef \
TAILSCALE_API_KEY=tskey-api-FAKE \
TAILSCALE_TAILNET=- \
MCP_HTTP_BIND_HOST=127.0.0.1 \
MCP_HTTP_PORT=31949 \
LOG_LEVEL=error \
bun run dist/index.js >/tmp/tailscale-mcp-dependency-health.log 2>&1 &
mcp_pid=$!
trap 'kill "$mcp_pid" 2>/dev/null || true; wait "$mcp_pid" 2>/dev/null || true' EXIT
attempt=0
until response=$(curl --fail --silent http://127.0.0.1:31949/health 2>/dev/null); do
  attempt=$((attempt + 1))
  test "$attempt" -lt 30
  sleep 0.1
done
printf '%s\n' "$response" | grep -q '"status":"ok"'
```

Expected: HTTP 200 with `{"status":"ok"}` and the server process is stopped by the exit trap.

### Task 5: Review and publish

**Files:**
- Review: complete branch diff against `origin/main`

- [ ] **Step 1: Review the complete diff**

Run:

```bash
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
```

Expected: only the design, plan, dependency manifests, lockfiles, and setup-node workflow references changed.

- [ ] **Step 2: Commit the implementation**

Run:

```bash
git add package.json bun.lock pnpm-lock.yaml .github/workflows/ci.yml .github/workflows/release.yml
git commit -S -m "chore(deps): consolidate Dependabot updates"
```

Expected: one validly signed implementation commit.

- [ ] **Step 3: Push and create the PR**

Run:

```bash
git push -u origin chore/consolidate-dependabot-updates
gh pr create --repo HexSleeves/tailscale-mcp --base main --head chore/consolidate-dependabot-updates
```

Expected: one PR referencing Dependabot PRs #139, #141, and #142, with validation evidence in its body.
