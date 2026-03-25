# RELEASE_SCOPE

## Goal

Define what is intentionally included/excluded in this GitHub release-preparation pass.

## Include (Ship)

- Security/runtime hardening already present in working tree (`app.ts`, `db.ts`, routes/modules, tests).
- README updates (screenshots + architecture/lifecycle diagrams).
- Release-facing docs (`CHANGELOG.md`, `docs/RELEASING.md`).
- Documentation consistency updates (`docs/REPO_MAP.md`, `docs/RUNBOOK.md`, README references).
- Package metadata polish in `package.json`.
- Repo hygiene validation updates in `scripts/validate.sh`.

## Exclude (Do Not Ship in this pass)

- New runtime features unrelated to release hardening.
- UI redesign or non-essential visual refactors.
- Large architectural rewrites of route/module boundaries.
- Local-only artifacts, caches, logs, temp files, and machine metadata.

## Guardrails

- Preserve `docs/screenshots/01-login.png` through `04-manage.png` as canonical release assets.
- Keep `.gitignore` enforcement for local/runtime artifacts.
- Fail release validation if tracked junk files are detected.
