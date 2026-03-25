# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Practice / Scrim / Fun controls panel**: new game-control endpoints and matching UI for round count presets (`mp_maxrounds`), overtime toggle + max-rounds (`mp_overtime_enable`, `mp_overtime_maxrounds`), round-time presets, per-team bot add/kick, give-weapon shortcuts, gravity presets, and "Reload Current Mode CFG".
- **Toast notification system**: slide-in toasts replace all `alert()` dialogs; success/error/info variants using existing CSS variables; auto-dismiss after 3 s.
- **Toggle state indicators**: `.btn-active` outline applied to active preset and on/off buttons so admins can see current state at a glance.
- **Plugin panel**: uncommented and styled with CSS grid; plugin enable/disable visible in the manage UI.
- **Live Status "Active Config" row**: derived from `last_game_type` + `last_game_mode` DB state, no extra API call.
- Client-side TypeScript source under `public/ts/` with four focused modules (`common`, `servers`, `manage`, `console`); bundled by esbuild.
- `tsconfig.client.json` for client-side type checking.
- `routes/game/helpers.ts`: shared constants, `parseIntBody`, `requireAllowlisted`, `makeToggleRoute`, `makeSimpleCmdRoute` factories eliminating route copy-paste.
- README screenshot section with canonical UI capture assets under `docs/screenshots/`.
- `docs/RELEASING.md` release runbook for repeatable GitHub releases.
- Repo hygiene validation in `scripts/validate.sh` to block tracked junk files (for example `.DS_Store`, `*.tmp`, `*.swp`).
- `docs/RELEASE_SCOPE.md` to track include/exclude decisions for release-prep changes.
- `npm audit --audit-level=high` step added to CI workflow.
- Password length cap (1024 chars) on the login endpoint to prevent bcrypt DoS.
- Server CRUD integration tests (`test/server-crud.test.ts`).
- Parallel RCON hostname probes on `/api/servers` with 2 s batch timeout.

### Changed

- **`routes/game.ts` split** into `routes/game/` directory with `helpers.ts`, `match.ts`, `controls.ts`, and `index.ts` (assembler); entry-point import path unchanged.
- **`public/js/console.js` split** into four TypeScript modules; `console.js` is now a gitignored build artifact.
- `sv_infinite_ammo` toggle now supports three states: Off / Full ammo / Nades-only (was binary 0/1).
- Independent RCON commands within a single route now run via `Promise.all` (respawn toggle, round time, overtime, start money).
- `sanitizeTeamName` and `sanitizeSayMessage` merged into `sanitizeString(s, maxLen)` with explicit max-length argument.
- UI redesigned with dark tactical gaming aesthetic using CSS custom properties throughout.
- README architecture and lifecycle Mermaid diagrams upgraded to operational flow with startup guards and runtime reconnect behavior.
- `docs/REPO_MAP.md` updated to reflect TypeScript codebase and new route structure.
- `package.json` metadata updated with repository, bugs, and homepage links for GitHub release readiness.
- `.gitignore` extended: `tmp-cs2-panel-*/`, `screenshots/` (scratch), `public/js/console.js`.
- `docker-compose.yaml` includes TLS reverse proxy guidance.
- RCON hostname response truncated to 128 characters.
- Custom CSP override now logs a warning at startup.

### Fixed

- Team name max length was inadvertently raised to 256 during refactor; corrected back to 64 (`MAX_TEAM_NAME_LEN`).
- `runGameCmd` log tag was `[setup-game]`; normalised to `[game]` for all routes.
- Error tag strings in `sendGameRouteError` calls are now consistent action-name slugs, not raw URL fragments.
- Removed local macOS `.DS_Store` artifacts from the working tree.
- Removed leftover `tmp-cs2-panel-*/` scratch directories.

### Security

- RCON command injection surface hardened: all user strings reach `runGameCmd` only via `sanitizeString` or `isRconCommandAllowed`.
- Numeric inputs validated with `parseIntBody` plus explicit allowlist before reaching RCON.
- Documented production environment requirements and startup guardrails in release docs/readme flow.
- Fixed double encryption bug in add-server route where RCON password was encrypted twice.
- Added DNS resolution check (`isValidServerHostResolved`) to prevent SSRF via DNS rebinding.
- Per-user server isolation: `owner_id` column on servers table; all queries filtered by authenticated user.
- Removed RCON password from in-memory server cache; fetched from DB on connect only.
- Destroy RCON socket on auth failure and command timeout to prevent listener leaks.
- Blocked `exec`, `host_writeconfig`, `writeid`, `writeip` in RCON command blocklist.
- `sanitizeString` now strips backticks and control characters.
- Enforced max 50 servers per owner.
- Minimum password length raised from 8 to 12; common weak passwords blocklisted.
- Pterodactyl install script now auto-generates `SESSION_SECRET` and `RCON_SECRET_KEY`.
- Source maps disabled in production builds.

## [1.0.0] - 2026-03-01

### Added

- Initial public release line for CS2 Modded Server Panel.
