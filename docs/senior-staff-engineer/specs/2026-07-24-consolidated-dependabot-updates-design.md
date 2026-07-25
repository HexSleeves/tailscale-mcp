# Consolidated Dependabot Updates Design

## Goal

Consolidate the updates proposed by Dependabot PRs #139, #141, and #142 into one reviewable dependency-update PR based on the latest `main`.

## Scope

- Update `@biomejs/biome` from 2.5.2 to 2.5.3.
- Align the `biome.json` schema URL with Biome 2.5.3.
- Update `@types/node` from 26.1.0 to 26.1.1.
- Update `typescript` from 6.0.3 to 7.0.2.
- Update `tsx` from 4.22.4 to 4.23.1.
- Update `actions/setup-node` from v6 to v7 in CI and release workflows.
- Regenerate `bun.lock`.
- Reference the superseded Dependabot PRs in the consolidated PR.

## Approach

Apply the exact versions proposed by Dependabot directly to a branch from the latest `main`. Regenerate the repository's Bun lockfile instead of cherry-picking Dependabot commits, because PRs #139 and #141 omitted it and failed frozen-lockfile CI and Docker installation. Do not restore `pnpm-lock.yaml`, which `main` removed while adopting Renovate as the single update bot.

## Compatibility Review

Review primary release notes for each update, with extra attention to the TypeScript 7 major upgrade and the setup-node v7 runtime migration. Treat passing typecheck, tests, builds, audit, compiled-binary smoke, HTTP health smoke, and Docker build as required acceptance evidence.

## Validation

- Frozen Bun install
- Lint
- Typecheck
- Full test suite
- JavaScript and type declaration build
- Compiled binary build and protocol smoke
- HTTP health smoke
- Moderate-level dependency audit
- Docker image build

## Delivery

Create one signed dependency-update commit, push the branch, and open a PR against `main`. Reference the closed, superseded Dependabot PRs in the new PR.
