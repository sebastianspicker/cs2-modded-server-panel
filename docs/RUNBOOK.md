# RUNBOOK

## Purpose

Commands and prerequisites for developing, validating, and verifying this repository.
For release execution steps, see `docs/RELEASING.md`.

## Prerequisites

- Node.js `>=20 <23`
- npm (bundled with Node.js)
- Optional: Docker (required for `npm run validate -- --require-docker` and `npm run ci`)
- Tooling used by `scripts/validate.sh`:
  - `jq`
  - `ruby` (for YAML validation)
  - `shellcheck`
  - `shfmt`

## Environment Variables

- `DEFAULT_USERNAME` (admin login username)
- `DEFAULT_PASSWORD` (admin login password; set a strong value)
- `ALLOW_DEFAULT_CREDENTIALS` (set to `true` only to permit built-in default credentials)
- `SESSION_SECRET` (session signing secret; required for production deployments)
- `SESSION_COOKIE_SECURE` (set to `true` behind HTTPS to mark cookies secure)
- `SESSION_COOKIE_SAMESITE` (default: `lax`)
- `REDIS_URL` (required in production; enables Redis session store)
- `REDIS_HOST` / `REDIS_PORT` (optional alternative to `REDIS_URL`)
- `RCON_SECRET_KEY` (required in production; encrypts/decrypts stored RCON passwords)
- `PORT` (HTTP port)
- `DB_PATH` (SQLite DB file path)
- `RCON_COMMAND_TIMEOUT_MS` (RCON command timeout in milliseconds; default: 2000)
- `SESSION_MAX_AGE_MS` (session cookie max age in milliseconds; default: 86400000 = 24h)
- `HEALTHCHECK_VERBOSE` (set `true` to include DB/Redis details in `/api/health`)

Production notes:
- If `DB_PATH` is explicitly set and cannot be opened, startup fails (no fallback DB path).
- If `ALLOW_DEFAULT_CREDENTIALS=true`, both `DEFAULT_USERNAME` and `DEFAULT_PASSWORD` must be set.
- Placeholder passwords (for example `change-me`) are rejected in production.

## Setup

```bash
npm ci
cp .env.example .env
```

## Run (local)

```bash
npm run dev
```

## Format

```bash
npm run format
```

## Lint

```bash
npm run lint
```

## Tests

```bash
npm test
```

## Validation

```bash
npm run validate
```

## Full CI Loop (requires Docker)

```bash
npm run ci
```

## Security Checks (baseline)

CI runs the following baselines:

- Secret scanning: `gitleaks` (SARIF upload)
- SCA/Dependency scanning: GitHub Dependency Review
- SAST: GitHub CodeQL

Local equivalents are not wired yet; use CI for authoritative signals.

## CI Overview

GitHub Actions run on pull requests and pushes to `master`.

**Workflows**

- `ci` (`.github/workflows/ci.yml`): format check (Prettier), lint (ESLint), tests, validation (shellcheck/shfmt, JSON/YAML, Docker build + compose).
- `dependency-review`, `secret-scan` (Gitleaks), `codeql` (JavaScript).

**Triggers:** `pull_request` (all); `push` to `master` (`ci`, `secret-scan`, `codeql`).

**Local reproduction:** Prereqs as above plus Docker for full run. Run `./scripts/ci-local.sh --require-docker` (or `--skip-docker`). Entrypoint: `npm run ci`.

**Optional:** `act -W .github/workflows/ci.yml` for local workflow run.

**Secrets:** None required for current CI. Gitleaks uses `.gitleaks.toml` for allowlisting.

**Extending CI:** Pin Actions to SHA; set minimal permissions and timeout-minutes; add concurrency; prefer `npm ci` and frozen lockfiles.

## Troubleshooting

- Missing `shellcheck`, `shfmt`, `jq`, or `ruby`:
  - `npm run validate` will fail until these are installed.
- Docker daemon not available:
  - Use `npm run validate` without `--require-docker`.
  - `npm run ci` will fail until Docker is available.
