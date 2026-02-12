# REPO_MAP

## Overview

Node.js/Express web panel for managing Counter-Strike 2 servers via RCON. Server state and user accounts are stored in SQLite (better-sqlite3). Views are rendered with EJS. Front-end assets live in `public/`.

## Entry Points

- `app.js`: Express app bootstrap, session setup, static assets, and route mounts.
- `db.js`: SQLite initialization, schema creation, migrations, and default admin user creation.

## Core Modules

- `modules/rcon.js`: RCON connection manager with connection pooling, reconnection logic, and heartbeat.
- `modules/middleware.js`: Authentication guard for routes.

## Routes

- `routes/auth.js`: Login/logout endpoints.
- `routes/server.js`: Server CRUD, RCON connectivity, map/plugin metadata, and manage UI.
- `routes/game.js`: Game setup and RCON command endpoints.
- `routes/status.js`: Status aggregation (DB state + live RCON status parsing).

## Views & Assets

- `views/`: EJS templates (UI pages and partials).
- `public/`: Static assets (CSS/JS).

## Configuration

- `cfg/maps.json`: Game types/modes/maps used by UI and setup endpoints.
- `cfg/plugins.json`: Plugin metadata for UI and RCON plugin toggles.

## Tests

- `test/app.test.js`: Basic unauthenticated login page check.
- `test/entrypoint.test.js`: Ensures `node app.js` starts and logs a port.

## Documentation

- `docs/ci.md`: CI overview and local reproduction.
- `docs/RUNBOOK.md`: Commands and prerequisites.
- `docs/REPO_MAP.md`: This file; code layout and hotspots.
- `docs/audit/`: Audit reports and findings (see `docs/audit/README.md`).

## Ops & Tooling

- `scripts/format.sh`: Shell formatting (shfmt).
- `scripts/validate.sh`: Shellcheck/shfmt, JSON/YAML validation, optional Docker build/compose validation.
- `.github/workflows/ci.yml`: Runs `npm run ci` in CI.
- `Dockerfile` / `docker-compose.yaml`: Container build and runtime.
- `cs2-modded-server-panel_egg.json`: Pterodactyl Egg configuration.

## Data

- `data/`: Runtime DB storage (default location when using Docker/Pterodactyl).

## Hot Spots / Risk Areas

- Session handling in `app.js` (secret management, session configuration).
- Default admin user creation in `db.js` (credential handling).
- RCON lifecycle and heartbeat handling in `modules/rcon.js`.
