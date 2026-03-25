# REPO_MAP

## Overview

Node.js/Express web panel for managing Counter-Strike 2 servers via RCON.
Written in TypeScript. Production builds compile with `tsc` → `dist/` and run via `node dist/app.js`. Development uses `tsx` for on-the-fly transpilation.
Server state and user accounts are stored in SQLite (better-sqlite3).
Views are rendered with EJS. Front-end assets live in `public/`.
Client-side TypeScript is bundled with esbuild into `public/js/console.js`.

## Entry Points

- `app.ts`: Express app bootstrap, session setup, static assets, and route mounts.
- `db.ts`: SQLite initialization, schema creation, migrations, and default admin user creation.

## Shared Utils

- `utils/parseServerId.ts`: Parse/validate `server_id`; `requireServerId(req, res)` for route handlers.
- `utils/mapsConfig.ts`: Loads `cfg/maps.json`; exports `getMapsForMode(gameType, gameMode)` and `mapsConfig`.
- `utils/rconResponse.ts`: `parseHostnameResponse(text, fallback)` for RCON hostname output.
- `utils/rconSecret.ts`: AES-256-GCM encryption/decryption for stored RCON passwords.
- `utils/networkValidation.ts`: SSRF prevention — `isBlockedIP`, `isValidServerHost` (IPv4/IPv6 normalization, blocked-prefix checking).

## Core Modules

- `modules/rcon.ts`: RCON connection manager with connection pooling, reconnection logic, and heartbeat.
- `modules/middleware.ts`: Authentication guard middleware for protected routes.

## Routes

- `routes/auth.ts`: Login/logout endpoints.
- `routes/server.ts`: Server CRUD, RCON connectivity, map/plugin metadata, and manage UI.
- `routes/game/`: Game setup and RCON command endpoints (split by concern):
  - `routes/game/helpers.ts`: Shared constants, validators (`parseIntBody`, `requireAllowlisted`, `parseConVarValue`, `sanitizeString`), and factory helpers (`makeToggleRoute`, `makeSimpleCmdRoute`, `makePresetRoute`, `makeMultiPresetRoute`, `makeSequenceRoute`).
  - `routes/game/match.ts`: Match setup, quick commands, match-phase controls (restart, pause, warmup, knife, go-live), round backups, and raw RCON/say endpoints.
  - `routes/game/controls.ts`: Practice/scrim/fun controls — freeze time, start money, round time, infinite ammo, cheats, buy anywhere, gravity, bots (per team), respawn, give weapon, overtime, max rounds, reload mode CFG, and visual aids.
  - `routes/game/index.ts`: Thin assembler that mounts `match` and `controls` routers; satisfies the `routes/game` import path.
- `routes/status.ts`: Status aggregation (DB state + live RCON status parsing).

## Views & Assets

- `views/`: EJS templates (`login.ejs`, `servers.ejs`, `manage.ejs` and partials).
- `public/css/panel.css`: Dark tactical UI stylesheet with CSS variables, toast system, `.btn-active`, and plugin grid.
- `public/ts/`: Client-side TypeScript source (bundled by esbuild):
  - `common.ts`: Shared helpers — `escapeHtml`, `sendPostRequest`, `showToast`, `initToast`, `toastError`, `withLoading`.
  - `servers.ts`: Server list page logic (`initServersPage`).
  - `manage.ts`: Manage page logic (`initManagePage`) — toggle helpers, preset helpers, live status polling, restore-backup flow.
  - `console.ts`: Entry point; routes `initServersPage` / `initManagePage` by URL path.
- `public/js/console.js`: Compiled bundle (gitignored, built via `npm run build:client`).
- `public/js/toast-inline.js`: Minimal toast for pages that don't load the main bundle (login, add-server).

## Configuration

- `cfg/maps.json`: Game types/modes/maps used by UI and setup endpoints.
- `cfg/plugins.json`: Plugin metadata for UI and RCON plugin toggles.

## Types

- `types/`: Shared TypeScript type declarations (e.g., session augmentation).

## Tests

- `test/app.test.ts`: Integration tests — login flow, CSRF, session cookies, auth middleware.
- `test/entrypoint.test.ts`: Entrypoint boot and production guard behavior.
- `test/rcon-secret.test.ts`: RCON secret encryption/decryption unit tests.
- `test/parse-server-id.test.ts`: `parseServerId` validation (21 tests).
- `test/rcon-response.test.ts`: `parseHostnameResponse` parsing (9 tests).
- `test/game-helpers.test.ts`: Game route helper functions (30+ tests).
- `test/network-validation.test.ts`: SSRF validation — `isBlockedIP`, `isValidServerHost` (26 tests).
- `test/server-crud.test.ts`: Server CRUD integration tests — add, list, edit, delete with owner isolation.

## Documentation

- `docs/RUNBOOK.md`: Commands, prerequisites, and CI overview.
- `docs/RELEASING.md`: Release checklist, versioning, tag/release, rollback.
- `docs/RELEASE_SCOPE.md`: Release-prep include/exclude scope and guardrails.
- `docs/API.md`: Complete API reference for all endpoints.
- `docs/REPO_MAP.md`: This file; code layout and hotspots.
- `docs/audit/`: Audit reports and findings (see `docs/audit/README.md`).
- `docs/screenshots/`: Canonical README UI screenshots.

## Ops & Tooling

- `scripts/format.sh`: Shell formatting (shfmt).
- `scripts/validate.sh`: Shellcheck/shfmt, JSON/YAML validation, optional Docker build/compose validation.
- `.github/workflows/ci.yml`: Runs `npm audit` then `npm run ci` in CI (Node 20 + 22 matrix).
- `tsconfig.json`: Server-side TypeScript config (used by `tsc` and `tsx`).
- `tsconfig.client.json`: Client-side TypeScript config (esbuild entry point `public/ts/console.ts`).
- `Dockerfile` / `docker-compose.yaml`: Multi-stage container build (builder + runtime) on `node:20-bookworm-slim`.
- `cs2-modded-server-panel_egg.json`: Pterodactyl Egg configuration.

## Data

- `data/`: Runtime DB storage (default location when using Docker/Pterodactyl).

## Hot Spots / Risk Areas

- Session handling in `app.ts` (secret management, session configuration).
- Default admin user creation in `db.ts` (credential handling).
- RCON lifecycle in `modules/rcon.ts` (reconnection lock, exponential backoff, graceful shutdown).
- SSRF prevention in `utils/networkValidation.ts` (IP blocking, IPv6 normalization).
- Input sanitization in `routes/game/helpers.ts` (`sanitizeString`, `isRconCommandAllowed`, allowlists).
