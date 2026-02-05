# Security Policy

## Reporting a Vulnerability

Please do not open public issues for security reports.

Email: `security@placeholder.invalid`

Include:

- A clear description of the issue
- Steps to reproduce
- Potential impact
- Any suggested mitigations

We will acknowledge receipt within 7 days and provide a remediation plan or request more details.

## Supported Versions

This project follows a rolling-release model. The `main` branch is the only supported version for security fixes.

## Security Expectations

- Use `SESSION_SECRET` in production.
- Enable `SESSION_COOKIE_SECURE=true` behind HTTPS.
- Configure Redis sessions via `REDIS_URL` for production use.
- Avoid default credentials unless explicitly allowed with `ALLOW_DEFAULT_CREDENTIALS=true`.

## Automated Scans

CI is configured to run:

- Secret scanning (Gitleaks)
- SAST (CodeQL)
- Dependency review (GitHub Dependency Review)

See `docs/RUNBOOK.md` for verification commands.
