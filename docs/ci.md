# CI Overview

This repository uses GitHub Actions to run a full CI pipeline on pull requests and on pushes to `master`.

## Workflows

- `ci` (`.github/workflows/ci.yml`)
  - Format check (Prettier)
  - Lint (ESLint)
  - Unit tests (Node test runner)
  - Validation (shellcheck/shfmt, JSON/YAML validation, Docker build + compose validation)
- `dependency-review` (`.github/workflows/dependency-review.yml`)
  - Blocks risky dependency changes on PRs
- `secret-scan` (`.github/workflows/secret-scan.yml`)
  - Gitleaks scan with SARIF upload to code scanning
- `codeql` (`.github/workflows/codeql.yml`)
  - CodeQL analysis for JavaScript

## Triggers

- `pull_request`: all workflows
- `push` to `master`: `ci`, `secret-scan`, `codeql`

## Local Reproduction

Prereqs: Node.js 20.x - 22.x, Docker, `jq`, `shellcheck`, `shfmt`, and Ruby (for YAML validation).

Run the same checks as CI:

```bash
./scripts/ci-local.sh --require-docker
```

If Docker is not available:

```bash
./scripts/ci-local.sh --skip-docker
```

The CI entrypoint is `npm run ci` (defined in `package.json`). It enforces Docker validation by default, so it will fail locally if Docker is unavailable.

## Optional: act

If you use `act` locally, keep it simple and avoid hacks. Example:

```bash
act -W .github/workflows/ci.yml
```

## Secrets And Repo Settings

- No secrets are required for current CI.
- If you add secrets later, ensure they are only used on trusted events (`push` to `master` or `workflow_dispatch`) and never on fork PRs.
- Gitleaks uses `.gitleaks.toml` to allowlist the sample default password used for local dev/test.

## Adding Or Extending Jobs

When adding new workflows or jobs:

- Pin Actions to a stable major version (commit SHA).
- Set minimal `permissions`.
- Set `timeout-minutes`.
- Add `concurrency` to avoid duplicate runs on the same ref.
- Prefer deterministic installs (`npm ci`, frozen lockfiles).
- Add caching appropriate to the toolchain.
