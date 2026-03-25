# RELEASING

## Purpose

Operational checklist for creating a clean GitHub release for this repository.

## Prerequisites

- Node.js `>=20 <23`
- npm
- Docker daemon available
- GitHub push permissions for `sebastianspicker/cs2-modded-server-panel`

## Release Branch Strategy

1. Branch from `origin/master` using `codex/release-prep-<date>`.
2. Keep commits split by concern:
   - `chore(repo): cleanup tracked junk and stale refs`
   - `docs(readme): architecture + lifecycle diagrams`
   - `docs(release): changelog + releasing guide`
   - `chore(release): metadata/checklist polish`
3. Merge to `master` only after all release-gate checks pass.

## Versioning Policy

- Default: **patch** bump from current version.
- Use **minor** for backward-compatible features.
- Use **major** for breaking API/runtime behavior changes.

## Release Gate (Must Pass)

Run from repository root:

```bash
npm run format:check
npm run lint
npm test
npm run validate -- --require-docker
npm audit --omit=dev
```

Additional checks:

- `git ls-files | rg -n "\\.DS_Store|\\.tmp|\\.swp|\\.swo"` returns no matches.
- README diagrams render in GitHub Markdown preview.
- README screenshot links resolve to files under `docs/screenshots/`.
- CI workflows are green (`ci`, `codeql`, `dependency-review`, `secret-scan`).

## Tag and GitHub Release Procedure

1. Ensure changelog `Unreleased` is accurate and move finalized notes under target version heading.
2. Bump version in `package.json` (and lockfile if regenerated).
3. Commit release prep changes.
4. Create annotated tag:

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin master
git push origin vX.Y.Z
```

5. Create GitHub Release draft from tag `vX.Y.Z`:
   - Title: `vX.Y.Z`
   - Notes sourced from `CHANGELOG.md`
   - Include upgrade notes for production env requirements:
     - `SESSION_SECRET`
     - Redis in production (`REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`)
     - `RCON_SECRET_KEY`

## Rollback Guidance

If release regression is detected:

1. Unpublish/revert GitHub Release notes to indicate withdrawal.
2. Revert release commit(s) on `master`.
3. Tag hotfix release (`vX.Y.(Z+1)`) after fixes and full gate pass.
4. Document root cause and corrective action in changelog/security notes.
