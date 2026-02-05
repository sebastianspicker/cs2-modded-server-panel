# RUNBOOK

## Purpose

Commands and prerequisites for developing, validating, and verifying this repository.

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
- `REDIS_URL` (optional; enables Redis session store)
- `REDIS_HOST` / `REDIS_PORT` (optional alternative to `REDIS_URL`)
- `PORT` (HTTP port)
- `DB_PATH` (SQLite DB file path)
- `RCON_COMMAND_TIMEOUT_MS` (RCON command timeout in milliseconds; default: 2000)

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

## Troubleshooting

- Missing `shellcheck`, `shfmt`, `jq`, or `ruby`:
  - `npm run validate` will fail until these are installed.
- Docker daemon not available:
  - Use `npm run validate` without `--require-docker`.
  - `npm run ci` will fail until Docker is available.
