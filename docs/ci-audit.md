# CI Audit

Audit date: 2026-02-06

## Inventory

- Workflows found:
  - `.github/workflows/ci.yml`
  - `.github/workflows/codeql.yml`
  - `.github/workflows/dependency-review.yml`
  - `.github/workflows/secret-scan.yml`

## Notes On Observability

Workflow run metadata was fetched via the public GitHub API. Full job logs require admin rights and were not accessible in this environment, so exact error messages are unavailable. When needed, open the Actions UI and map the last failed runs into the table below.

## Failures And Fix Plan

| Workflow            | Failure(s)                                                                                    | Root Cause                                                                                                                              | Fix Plan                                                                                              | Risk   | How To Verify                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `ci`                | `npm ci` failed in Actions run `21551326995` (2026-01-31) and local run failed with Node 25.x | Actions log download requires admin rights, so exact error was not visible; likely native module build prerequisites or engine mismatch | Install build prerequisites in CI, pin Node 20, and add a Node version guard in `scripts/ci-local.sh` | Medium | Run `./scripts/ci-local.sh --require-docker` with Node 20-22 and confirm GitHub Actions run is green |
| `codeql`            | Not observed                                                                                  | Missing hardening (branch filters, concurrency, timeouts)                                                                               | Implemented branch filters, concurrency, timeouts, pinned runner, clearer step names                  | Low    | Trigger CodeQL via PR/push and ensure SARIF upload succeeds                                          |
| `dependency-review` | Not observed                                                                                  | Missing hardening (concurrency, timeouts)                                                                                               | Implemented concurrency, timeouts, pinned runner, clearer step names                                  | Low    | Open a PR with a dependency change and confirm action runs                                           |
| `secret-scan`       | Failure in Actions run `21712396466` (2026-02-05) at step `Run gitleaks`                      | Gitleaks flagged the sample default password used in `db.js`, `docker-compose.yaml`, and tests                                          | Added `.gitleaks.toml` allowlist for the sample password and passed `--config`                        | Medium | Push a branch with a known test secret and confirm gitleaks fails and uploads SARIF                  |
