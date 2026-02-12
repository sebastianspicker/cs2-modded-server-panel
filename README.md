# CS2 Modded Server Panel

A Node.js/Express web panel to control and monitor modded Counter-Strike 2 servers via RCON.

> This repository is a fork of [shobhit-pathak/cs2-rcon-panel](https://github.com/shobhit-pathak/cs2-rcon-panel)
> with a focus on containerized deployment and Pterodactyl support.

## Overview

Use this panel to manage CS2 servers, run RCON commands, configure match setup, and track live state.
It is designed to run in Docker and as a Pterodactyl Egg, with a local dev flow for contributors.

## Features

- Web interface for managing modded Counter-Strike 2 servers
- RCON connection and live console output
- Session-based authentication (bcrypt)
- SQLite-backed server management UI
- Deployment via Docker and Pterodactyl
- Map/mode/config support via `cfg/maps.json`

## Requirements

- Node.js `>=20 <23`
- npm
- Optional: Docker (for container builds and CI validation)
- Optional: Redis (recommended for production session storage)

## Quickstart

### Pterodactyl

Use the bundled Egg configuration at `cs2-modded-server-panel_egg.json` and set the image to
`sebastianspicker/cs2-modded-server-panel:latest`. Configure environment variables in the panel as needed.

> Note: The Egg install script is pinned to a specific commit for reproducibility.
> Update the pin when releasing new versions.

### Docker

```bash
git clone https://github.com/sebastianspicker/cs2-modded-server-panel.git
cd cs2-modded-server-panel

docker build -t cs2-modded-server-panel .

docker run -d -p 3000:3000 \
  -e DEFAULT_USERNAME=youradmin \
  -e DEFAULT_PASSWORD=yourpassword \
  -e ALLOW_DEFAULT_CREDENTIALS=false \
  -e SESSION_SECRET=your-session-secret \
  -e PORT=3000 \
  cs2-modded-server-panel
```

Panel will be available at `http://localhost:3000`.

### Local Development

```bash
cat .nvmrc
npm ci
cp .env.example .env
npm run dev
```

## Configuration

### Environment Variables

| Variable                    | Description                          | Default                           |
| --------------------------- | ------------------------------------ | --------------------------------- |
| `DEFAULT_USERNAME`          | Default admin login username         | `cspanel`                         |
| `DEFAULT_PASSWORD`          | Default admin login password         | `v67ic55x4ghvjfj`                 |
| `ALLOW_DEFAULT_CREDENTIALS` | Allow built-in default credentials   | `false`                           |
| `SESSION_SECRET`            | Session signing secret (production)  | _unset_                           |
| `SESSION_COOKIE_SECURE`     | Set to `true` behind HTTPS           | `false`                           |
| `SESSION_COOKIE_SAMESITE`   | Session cookie SameSite value        | `lax`                             |
| `REDIS_URL`                 | Redis connection URL (session store) | _unset_                           |
| `REDIS_HOST` / `REDIS_PORT` | Alternative to `REDIS_URL`            | _unset_ / `6379`                  |
| `PORT`                      | Port the panel runs on               | `3000`                            |
| `DB_PATH`                   | SQLite DB file path                  | `/home/container/data/cspanel.db`  |
| `RCON_COMMAND_TIMEOUT_MS`   | RCON command timeout (milliseconds)  | `2000`                            |

> If you use the built-in defaults (`cspanel` / `v67ic55x4ghvjfj`), you must set
> `ALLOW_DEFAULT_CREDENTIALS=true` or the server will refuse to start.

## Development

```bash
npm run dev
```

### Lint

```bash
npm run lint
```

### Format

```bash
npm run format
```

### Tests

```bash
npm test
```

### Validation

```bash
# Shell lint + format check, JSON/YAML validation
npm run validate

# Enforce Docker build + compose config (requires Docker daemon)
npm run validate -- --require-docker
```

### Full CI Loop

```bash
npm run ci
```

## Security

- CSRF protection is enforced for authenticated POST requests.
- Set `SESSION_SECRET` in production and enable `SESSION_COOKIE_SECURE=true` behind HTTPS.
- Use Redis sessions for production by setting `REDIS_URL`.
- Default credentials are blocked unless `ALLOW_DEFAULT_CREDENTIALS=true`.

## Troubleshooting

- **`npm ci` fails**: Ensure Node.js 20–22 is active (`cat .nvmrc`).
- **`npm run validate` fails**: Install `shellcheck`, `shfmt`, `jq`, and `ruby`.
- **Docker validation skipped**: Docker daemon not available; run without `--require-docker`.
- **Auth fails on fresh install**: Set `DEFAULT_USERNAME`, `DEFAULT_PASSWORD`, and
  `ALLOW_DEFAULT_CREDENTIALS` appropriately.
- **Session store warning**: Configure Redis with `REDIS_URL` for production stability.

## Project Structure

```
├── app.js                 # Express app entry
├── db.js                  # SQLite init and default user
├── modules/               # RCON manager, auth middleware
├── routes/                # auth, server, game, status
├── public/                # Static CSS/JS
├── views/                 # EJS templates
├── cfg/                   # maps.json, plugins.json, game configs
├── scripts/               # format, validate, ci-local, pterodactyl-install
├── test/                  # Unit and entrypoint tests
├── docs/                  # CI overview, runbook, repo map, audit
├── Dockerfile
├── docker-compose.yaml
└── cs2-modded-server-panel_egg.json
```

## Validation Commands

| Action   | Command |
| -------- | ------- |
| Install  | `npm ci` |
| Build    | `docker build -t cs2-modded-server-panel .` (optional) |
| Run      | `npm run dev` or `npm start` |
| Test     | `npm test` |
| Lint     | `npm run lint` |
| Format   | `npm run format` then `npm run format:check` |
| Validate | `npm run validate` (shell/config); add `-- --require-docker` for Docker checks |
| Full CI  | `npm run ci` |

## Notes

- Audit reports and findings live under `docs/audit/`.
- `scripts/pterodactyl-install.sh` mirrors the Egg’s embedded install script for review and shellcheck.
