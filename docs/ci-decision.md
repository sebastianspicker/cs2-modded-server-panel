# CI Decision

Decision date: 2026-02-06

## Decision
FULL CI

## Why
- This repo ships executable Node.js code plus a Docker image and Compose config.
- We can run deterministic static checks (format, lint, config validation) and unit tests without secrets or external services.
- Docker build/compose validation is feasible on GitHub-hosted runners and adds real value.

## What Runs Where
- Pull requests (including forks):
  - `ci`: format check, lint, unit tests, config validation, Docker build + compose validation.
  - `dependency-review`: review dependency changes on PRs.
  - `secret-scan`: gitleaks scan with SARIF upload.
  - `codeql`: CodeQL analysis for JavaScript.
- Pushes to `master`:
  - Same as PRs.
- Scheduled/nightly: none (not needed yet).
- Manual: none (not needed yet).

## Threat Model For CI
- Untrusted code on fork PRs: all workflows use `pull_request` (no `pull_request_target`), no secrets are required, and permissions are least-privilege.
- Secrets exposure: no repository secrets are consumed. If secrets are added later, they must be gated to `push` on `master` or `workflow_dispatch` and never on fork PRs.
- Supply chain: all Actions are pinned to stable major versions (commit SHAs). Runner image is pinned to `ubuntu-24.04` for determinism.

## If We Later Want More
- Add integration tests behind a separate workflow that runs on `push` to `master` or `workflow_dispatch` (and optionally on a schedule).
- If tests require external services (databases, Redis, etc.), use service containers or a self-hosted runner and document required secrets in `docs/ci.md`.
- If deployments are added, create a dedicated workflow with strict environment protection rules and separate permissions.
