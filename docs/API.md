# API Reference

All endpoints except `/api/health` require authentication via session cookie.
State-changing requests (POST/PUT/DELETE) require a CSRF token in the `X-CSRF-Token` header.

## Authentication Flow

1. `GET /` — renders login page, sets session cookie and CSRF token
2. `POST /auth/login` — authenticate with username/password
3. Use session cookie + CSRF token for all subsequent requests
4. `POST /auth/logout` — destroy session

## Auth

| Method | Path           | Auth | CSRF | Rate Limit |
| ------ | -------------- | ---- | ---- | ---------- |
| POST   | `/auth/login`  | No   | Yes  | 20/15min   |
| POST   | `/auth/logout` | Yes  | Yes  | —          |

## Server Management

| Method | Path                    | Auth | CSRF | Description                              |
| ------ | ----------------------- | ---- | ---- | ---------------------------------------- |
| GET    | `/servers`              | Yes  | —    | Servers list page                        |
| GET    | `/manage/:server_id`    | Yes  | —    | Server management page                   |
| GET    | `/add-server`           | Yes  | —    | Add server form                          |
| GET    | `/api/servers`          | Yes  | —    | JSON list of servers with RCON status    |
| POST   | `/api/add-server`       | Yes  | Yes  | Add new server (ip, port, rcon_password) |
| POST   | `/api/delete-server`    | Yes  | Yes  | Delete server by server_id               |
| POST   | `/api/reconnect-server` | Yes  | Yes  | Reconnect RCON for server_id             |

## Game Setup

| Method | Path                                          | Auth | CSRF | Description                               |
| ------ | --------------------------------------------- | ---- | ---- | ----------------------------------------- |
| POST   | `/api/setup-game`                             | Yes  | Yes  | Deploy match (map, teams, game type/mode) |
| GET    | `/api/game-types/:type/game-modes`            | Yes  | —    | List game modes for type                  |
| GET    | `/api/game-types/:type/game-modes/:mode/maps` | Yes  | —    | List maps for mode                        |

## Match Control

| Method | Path                  | Auth | CSRF | Description       |
| ------ | --------------------- | ---- | ---- | ----------------- |
| POST   | `/api/restart`        | Yes  | Yes  | Restart game      |
| POST   | `/api/pause`          | Yes  | Yes  | Pause match       |
| POST   | `/api/unpause`        | Yes  | Yes  | Unpause match     |
| POST   | `/api/start-warmup`   | Yes  | Yes  | Start warmup      |
| POST   | `/api/start-knife`    | Yes  | Yes  | Start knife round |
| POST   | `/api/go-live`        | Yes  | Yes  | Go live           |
| POST   | `/api/swap-team`      | Yes  | Yes  | Swap teams        |
| POST   | `/api/scramble-teams` | Yes  | Yes  | Scramble teams    |

## Bot Control

| Method | Path                  | Auth | CSRF | Description              |
| ------ | --------------------- | ---- | ---- | ------------------------ |
| POST   | `/api/add-bot`        | Yes  | Yes  | Add bot                  |
| POST   | `/api/kick-all-bots`  | Yes  | Yes  | Kick all bots            |
| POST   | `/api/kill-bots`      | Yes  | Yes  | Kill all bots            |
| POST   | `/api/bot-add-ct`     | Yes  | Yes  | Add CT bot               |
| POST   | `/api/bot-add-t`      | Yes  | Yes  | Add T bot                |
| POST   | `/api/bot-kick-ct`    | Yes  | Yes  | Kick CT bots             |
| POST   | `/api/bot-kick-t`     | Yes  | Yes  | Kick T bots              |
| POST   | `/api/bot-difficulty` | Yes  | Yes  | Set bot difficulty (0-3) |

## Game Settings

| Method | Path                             | Auth | CSRF | Description                      |
| ------ | -------------------------------- | ---- | ---- | -------------------------------- |
| POST   | `/api/cheats-toggle`             | Yes  | Yes  | Toggle sv_cheats (0/1)           |
| POST   | `/api/free-armor-toggle`         | Yes  | Yes  | Toggle mp_free_armor             |
| POST   | `/api/buy-anywhere-toggle`       | Yes  | Yes  | Toggle mp_buy_anywhere           |
| POST   | `/api/grenade-trajectory-toggle` | Yes  | Yes  | Toggle grenade trajectory        |
| POST   | `/api/show-impacts-toggle`       | Yes  | Yes  | Toggle sv_showimpacts            |
| POST   | `/api/respawn-toggle`            | Yes  | Yes  | Toggle respawn on death          |
| POST   | `/api/infinite-ammo-toggle`      | Yes  | Yes  | Set sv_infinite_ammo (0/1/2)     |
| POST   | `/api/limitteams-toggle`         | Yes  | Yes  | Toggle mp_limitteams             |
| POST   | `/api/autoteam-toggle`           | Yes  | Yes  | Toggle mp_autoteambalance        |
| POST   | `/api/friendlyfire-toggle`       | Yes  | Yes  | Toggle mp_friendlyfire           |
| POST   | `/api/autokick-toggle`           | Yes  | Yes  | Toggle mp_autokick               |
| POST   | `/api/set-freezetime`            | Yes  | Yes  | Set mp_freezetime (0/5/10/15/20) |
| POST   | `/api/set-startmoney`            | Yes  | Yes  | Set mp_startmoney                |
| POST   | `/api/set-roundtime`             | Yes  | Yes  | Set mp_roundtime (1/2/5/60)      |
| POST   | `/api/set-maxrounds`             | Yes  | Yes  | Set mp_maxrounds (16/24/30)      |
| POST   | `/api/set-overtime`              | Yes  | Yes  | Configure overtime               |
| POST   | `/api/set-gravity`               | Yes  | Yes  | Set sv_gravity (400/600/800)     |
| POST   | `/api/give-weapon`               | Yes  | Yes  | Give weapon to player            |
| POST   | `/api/reload-mode`               | Yes  | Yes  | Reload current game mode config  |

## Backups

| Method | Path                         | Auth | CSRF | Description                   |
| ------ | ---------------------------- | ---- | ---- | ----------------------------- |
| POST   | `/api/list-backups`          | Yes  | Yes  | List available round backups  |
| POST   | `/api/restore-round`         | Yes  | Yes  | Restore specific round (1-99) |
| POST   | `/api/restore-latest-backup` | Yes  | Yes  | Restore latest backup         |

## RCON & Chat

| Method | Path             | Auth | CSRF | Description                        |
| ------ | ---------------- | ---- | ---- | ---------------------------------- |
| POST   | `/api/rcon`      | Yes  | Yes  | Execute RCON command (allowlisted) |
| POST   | `/api/say-admin` | Yes  | Yes  | Broadcast message to server        |

## Plugins

| Method | Path                 | Auth | CSRF | Description            |
| ------ | -------------------- | ---- | ---- | ---------------------- |
| POST   | `/api/plugins/apply` | Yes  | Yes  | Enable/disable plugins |

## Status & Health

| Method | Path                     | Auth | CSRF | Rate Limit | Description                     |
| ------ | ------------------------ | ---- | ---- | ---------- | ------------------------------- |
| GET    | `/api/status/:server_id` | Yes  | —    | 60/min     | Live server status              |
| GET    | `/api/health`            | No   | —    | —          | Health check for load balancers |

## Common Response Formats

**Success:** `{ "message": "..." }` with HTTP 200/201

**Error:** `{ "error": "..." }` with HTTP 400/401/403/404/500

**Auth routes:** `{ "status": N, "message": "..." }`

## Request Body Format

All POST requests accept JSON (`Content-Type: application/json`).

Common fields:

- `server_id` (string/number) — required for all game/server operations
- `value` (number) — for toggle and preset routes (0/1 or allowlisted values)
