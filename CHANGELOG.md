# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- README screenshot section with canonical UI capture assets under `docs/screenshots/`.
- `docs/RELEASING.md` release runbook for repeatable GitHub releases.
- Repo hygiene validation in `scripts/validate.sh` to block tracked junk files (for example `.DS_Store`, `*.tmp`, `*.swp`).
- `docs/RELEASE_SCOPE.md` to track include/exclude decisions for release-prep changes.

### Changed
- README architecture and lifecycle Mermaid diagrams upgraded to operational flow with startup guards and runtime reconnect behavior.
- `package.json` metadata updated with repository, bugs, and homepage links for GitHub release readiness.

### Fixed
- Removed local macOS `.DS_Store` artifacts from the working tree before release prep.

### Security
- Documented production environment requirements and startup guardrails in release docs/readme flow.

## [1.0.0] - 2026-03-01

### Added
- Initial public release line for CS2 Modded Server Panel.
