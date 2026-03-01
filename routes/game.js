// routes/game.js
const express = require('express');
const router = express.Router();
const rcon = require('../modules/rcon');
const is_authenticated = require('../modules/middleware');
const { better_sqlite_client } = require('../db');
const { requireServerId } = require('../utils/parseServerId');
const { getMapsForMode, mapsConfig } = require('../utils/mapsConfig');

const MAX_TEAM_NAME_LEN = 64;
const MAX_SAY_MESSAGE_LEN = 256;
const MAX_RCON_COMMAND_LEN = 512;
const RCON_FORBIDDEN_SEPARATOR = /[;\r\n]/;
const RCON_BLOCKED_COMMANDS = [
  'quit',
  'exit',
  'shutdown',
  'q',
  'killserver',
  'restart',
  'sv_cheats',
  'rcon_password',
  'plugin',
  'meta',
];


/** Returns 0 or 1 for ConVar toggles, or null if invalid. */
function parseConVarValue(val) {
  if (val === 0 || val === '0') return 0;
  if (val === 1 || val === '1') return 1;
  return null;
}

/** Sanitize say message: strip quotes/newlines, limit length. */
function sanitizeSayMessage(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/["'\\\r\n;]/g, '')
    .trim()
    .slice(0, MAX_SAY_MESSAGE_LEN);
}


/** Returns true if RCON command is allowed (length + not blocked). */
function isRconCommandAllowed(cmd) {
  if (typeof cmd !== 'string') return false;
  const trimmed = cmd.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_RCON_COMMAND_LEN) return false;
  if (RCON_FORBIDDEN_SEPARATOR.test(trimmed)) return false;
  const lower = trimmed.toLowerCase().split(/\s+/)[0];
  return !RCON_BLOCKED_COMMANDS.includes(lower);
}

/** Allow only safe cfg filenames for exec (alphanumeric, underscore, hyphen, dot). */
function sanitizeCfgName(name) {
  if (typeof name !== 'string') return null;
  const s = name.trim();
  return /^[a-zA-Z0-9_.-]+$/.test(s) ? s : null;
}

/** Allow only safe backup filenames (e.g. backup_round01.txt). */
function sanitizeBackupFileName(name) {
  if (typeof name !== 'string') return null;
  const s = name.trim();
  return /^[a-zA-Z0-9_.-]+\.txt$/.test(s) ? s : null;
}

/** RCON response helper. Returns [isOk, text]. */
function rconResponse(resp) {
  if (resp instanceof Error) {
    return [false, resp.message];
  }
  return [true, typeof resp === 'string' ? resp : String(resp || '')];
}

/** Send standard 500 for game route errors; use in catch blocks. */
function sendGameRouteError(res, err, tag = 'game') {
  console.error(`[${tag}] Error:`, err);
  res.status(500).json({ error: 'Internal server error' });
}


/** Sanitize team name for RCON: strip quotes/newlines, limit length. */
function sanitizeTeamName(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/["'\\\r\n;]/g, '')
    .trim()
    .slice(0, MAX_TEAM_NAME_LEN);
}


/**
 * Führt einen beliebigen RCON‐Befehl aus und loggt ihn mit dem Tag [setup-game].
 * @param {string} server_id
 * @param {string} cmd — der komplette Befehl, z.B. 'changelevel de_dust2'
 */
async function runGameCmd(server_id, cmd) {
  console.log(`[setup-game] ${cmd}`);
  await rcon.execute_command(server_id, cmd);
}

/**
 * Führt per RCON einen "exec <cfgName>"-Befehl auf dem CS2-Server aus.
 * @param {string} server_id
 * @param {string} cfgName — z.B. "prefire.cfg"
 */
async function execCfg(server_id, cfgName) {
  const safe = sanitizeCfgName(cfgName);
  if (!safe) throw new Error('Invalid cfg name');
  await runGameCmd(server_id, `exec ${safe}`);
}

//
// === SETUP / CREATE MATCH ===
//
router.post('/api/setup-game', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const { team1 = '', team2 = '', game_type, game_mode, selectedMap } = req.body;

    // 1) game_type und game_mode validieren, erlaubte Maps ermitteln
    const gt = mapsConfig.gameTypes?.[game_type];
    if (!gt) {
      return res.status(400).json({ error: 'Unknown game type' });
    }
    const gm = gt.gameModes?.[game_mode];
    if (!gm) {
      return res.status(400).json({ error: 'Unknown game mode' });
    }
    const allowedMaps = getMapsForMode(game_type, game_mode);
    const mapName =
      typeof selectedMap === 'string' && selectedMap.trim().length > 0 ? selectedMap.trim() : '';
    if (!mapName || (allowedMaps.length > 0 && !allowedMaps.includes(mapName))) {
      return res.status(400).json({
        error: allowedMaps.length
          ? `selectedMap must be one of: ${allowedMaps.join(', ')}`
          : 'selectedMap is required',
      });
    }

    const t1 = sanitizeTeamName(team1);
    const t2 = sanitizeTeamName(team2);

    // 2) Team‐Namen setzen (falls angegeben)
    if (t1) {
      await runGameCmd(server_id, `mp_teamname_1 "${t1}"`);
    }
    if (t2) {
      await runGameCmd(server_id, `mp_teamname_2 "${t2}"`);
    }

    // 3) Map wechseln
    await runGameCmd(server_id, `changelevel ${mapName}`);

    // 4) CFG ausführen (only allow safe cfg names from config)
    const execFile = sanitizeCfgName(gm.exec);
    if (!execFile) {
      return res.status(400).json({ error: 'Invalid exec config name' });
    }
    await execCfg(server_id, execFile);

    // 5) Panel‐State in der DB aktualisieren
    const stmt = better_sqlite_client.prepare(`
      UPDATE servers
         SET last_map        = ?,
             last_game_type  = ?,
             last_game_mode  = ?
       WHERE id = ?
    `);
    stmt.run(mapName, game_type, game_mode, parseInt(server_id, 10));

    return res.status(200).json({ message: 'Game Created!' });
  } catch (err) {
    return sendGameRouteError(res, err, 'setup-game');
  }
});

//
// === QUICK COMMANDS ===
//
router.post('/api/scramble-teams', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'mp_shuffleteams');
    return res.status(200).json({ message: 'Teams scrambled!' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/scramble-teams');
  }
});

router.post('/api/kick-all-bots', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'bot_kick all');
    return res.status(200).json({ message: 'All bots kicked!' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/kick-all-bots');
  }
});

router.post('/api/add-bot', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'bot_add');
    return res.status(200).json({ message: 'Bot added!' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/add-bot');
  }
});

router.post('/api/kill-bots', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'bot_kill');
    return res.status(200).json({ message: 'Bots killed!' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/kill-bots');
  }
});

// Toggle-Endpoints für ConVars
// mp_limitteams an/aus
router.post('/api/limitteams-toggle', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const value = parseConVarValue(req.body?.value);
    if (value === null) {
      return res.status(400).json({ error: 'value must be 0 or 1' });
    }
    await runGameCmd(server_id, `mp_limitteams ${value}`);
    return res.status(200).json({ message: `mp_limitteams set to ${value}` });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/limitteams-toggle');
  }
});

// mp_autoteambalance an/aus
router.post('/api/autoteam-toggle', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const value = parseConVarValue(req.body?.value);
    if (value === null) {
      return res.status(400).json({ error: 'value must be 0 or 1' });
    }
    await runGameCmd(server_id, `mp_autoteambalance ${value}`);
    return res.status(200).json({ message: `mp_autoteambalance set to ${value}` });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/autoteam-toggle');
  }
});

// mp_friendlyfire an/aus
router.post('/api/friendlyfire-toggle', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const value = parseConVarValue(req.body?.value);
    if (value === null) {
      return res.status(400).json({ error: 'value must be 0 or 1' });
    }
    await runGameCmd(server_id, `mp_friendlyfire ${value}`);
    return res.status(200).json({ message: `mp_friendlyfire set to ${value}` });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/friendlyfire-toggle');
  }
});

// mp_autokick an/aus
router.post('/api/autokick-toggle', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const value = parseConVarValue(req.body?.value);
    if (value === null) {
      return res.status(400).json({ error: 'value must be 0 or 1' });
    }
    await runGameCmd(server_id, `mp_autokick ${value}`);
    return res.status(200).json({ message: `mp_autokick set to ${value}` });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/autokick-toggle');
  }
});

//
// === SIMPLE COMMANDS ===
//
router.post('/api/restart', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'mp_restartgame 1');
    return res.status(200).json({ message: 'Game restarted' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/restart');
  }
});

router.post('/api/start-warmup', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'mp_restartgame 1');
    await execCfg(server_id, 'warmup.cfg');
    return res.status(200).json({ message: 'Warmup started!' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/start-warmup');
  }
});

router.post('/api/start-knife', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'mp_warmup_end');
    await runGameCmd(server_id, 'mp_restartgame 1');
    await execCfg(server_id, 'knife.cfg');
    return res.status(200).json({ message: 'Knife started!' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/start-knife');
  }
});

router.post('/api/swap-team', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'mp_swapteams');
    return res.status(200).json({ message: 'Teams swapped!' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/swap-team');
  }
});

router.post('/api/go-live', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'mp_warmup_end');
    await runGameCmd(server_id, 'mp_restartgame 1');
    return res.status(200).json({ message: 'Match is live!' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/go-live');
  }
});

//
// === ROUND BACKUPS ===
//
router.post('/api/list-backups', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const resp = await rcon.execute_command(server_id, 'mp_backup_restore_list_files');
    const [ok, text] = rconResponse(resp);
    return res.status(200).json({ message: ok ? text : 'RCON command failed' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/list-backups');
  }
});

router.post('/api/restore-round', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const raw = req.body.round_number;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (!Number.isInteger(n) || n < 1 || n > 99) {
      return res.status(400).json({ error: 'round_number must be 1–99' });
    }
    const num = String(n).padStart(2, '0');
    await runGameCmd(server_id, `mp_backup_restore_load_file backup_round${num}.txt`);
    await runGameCmd(server_id, 'mp_pause_match');
    return res.status(200).json({ message: 'Round restored!' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/restore-round');
  }
});

router.post('/api/restore-latest-backup', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const resp = await rcon.execute_command(server_id, 'mp_backup_round_file_last');
    const [ok, text] = rconResponse(resp);
    const rawFile = ok && typeof text === 'string' ? text.split('=')[1]?.trim() : null;
    const lastFile = sanitizeBackupFileName(rawFile);
    if (lastFile) {
      await runGameCmd(server_id, `mp_backup_restore_load_file ${lastFile}`);
      await runGameCmd(server_id, 'mp_pause_match');
      return res.status(200).json({ message: `Latest round restored (${lastFile})` });
    }
    return res.status(200).json({ message: 'No latest backup found!' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/restore-latest-backup');
  }
});

//
// === PAUSE / UNPAUSE / RCON / SAY ===
//
router.post('/api/pause', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'mp_pause_match');
    return res.status(200).json({ message: 'Game paused' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/pause');
  }
});

router.post('/api/unpause', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'mp_unpause_match');
    return res.status(200).json({ message: 'Game unpaused' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/unpause');
  }
});

router.post('/api/rcon', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const command = req.body?.command;
    if (!isRconCommandAllowed(command)) {
      return res.status(400).json({
        error: `Command not allowed (single command only, max ${MAX_RCON_COMMAND_LEN} chars, blocked: ${RCON_BLOCKED_COMMANDS.join(', ')})`,
      });
    }
    console.log(`[rcon] ${command}`);
    const resp = await rcon.execute_command(
      server_id,
      typeof command === 'string' ? command.trim() : ''
    );
    const [ok, text] = rconResponse(resp);
    const msg = ok ? 'Command sent!' : `Response:\n${text}`;
    return res.status(200).json({ message: msg });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/rcon');
  }
});

router.post('/api/say-admin', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const raw = req.body?.message;
    const text = sanitizeSayMessage(raw);
    if (!text) {
      return res.status(400).json({
        error: 'message is required and must be non-empty after sanitization',
      });
    }
    console.log(`[rcon] say ${text}`);
    await rcon.execute_command(server_id, `say ${text}`);
    return res.status(200).json({ message: 'Message sent!' });
  } catch (err) {
    return sendGameRouteError(res, err, '/api/say-admin');
  }
});

module.exports = router;
