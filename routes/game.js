// routes/game.js
const express = require('express');
const router = express.Router();
const mapsConfig = require('../cfg/maps.json');
const rcon = require('../modules/rcon');
const is_authenticated = require('../modules/middleware');
const { better_sqlite_client } = require('../db');

const MAX_TEAM_NAME_LEN = 64;

/** Returns valid server_id string or null if invalid. */
function parseServerId(val) {
  if (val == null || val === '') return null;
  const id = typeof val === 'number' ? val : parseInt(String(val).trim(), 10);
  return Number.isInteger(id) && id > 0 ? String(id) : null;
}

/** Sends 400 if server_id invalid; returns true if valid. */
function requireServerId(req, res) {
  const sid = parseServerId(req.body?.server_id);
  if (!sid) {
    res.status(400).json({ error: 'Missing or invalid server_id' });
    return null;
  }
  return sid;
}

/** RCON response: 200/400 are numeric; success body is string. Returns [isOk, text]. */
function rconResponse(resp) {
  if (typeof resp === 'number') {
    return [resp === 200, resp === 200 ? 'OK' : 'RCON command failed'];
  }
  return [true, typeof resp === 'string' ? resp : String(resp)];
}

/** Sanitize team name for RCON: strip quotes/newlines, limit length. */
function sanitizeTeamName(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/["\r\n]/g, '')
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
  await runGameCmd(server_id, `exec ${cfgName}`);
}

//
// === SETUP / CREATE MATCH ===
//
router.post('/api/setup-game', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const { team1 = '', team2 = '', game_type, game_mode, selectedMap } = req.body;
    const t1 = sanitizeTeamName(team1);
    const t2 = sanitizeTeamName(team2);

    // 1) Team‐Namen setzen (falls angegeben)
    if (t1) {
      await runGameCmd(server_id, `mp_teamname_1 "${t1}"`);
    }
    if (t2) {
      await runGameCmd(server_id, `mp_teamname_2 "${t2}"`);
    }

    // 2) Map wechseln
    await runGameCmd(server_id, `changelevel ${selectedMap}`);

    // 3) aus maps.json das passende Exec‐File ermitteln
    const gt = mapsConfig.gameTypes?.[game_type];
    if (!gt) {
      return res.status(400).json({ error: `Unbekannter game_type: ${game_type}` });
    }
    const gm = gt.gameModes?.[game_mode];
    if (!gm) {
      return res.status(400).json({ error: `Unbekannter game_mode: ${game_mode}` });
    }
    const execFile = gm.exec;

    // 4) CFG ausführen
    await execCfg(server_id, execFile);

    // 5) Panel‐State in der DB aktualisieren
    const stmt = better_sqlite_client.prepare(`
      UPDATE servers
         SET last_map        = ?,
             last_game_type  = ?,
             last_game_mode  = ?
       WHERE id = ?
    `);
    stmt.run(selectedMap, game_type, game_mode, parseInt(server_id, 10));

    return res.status(200).json({ message: 'Game Created!' });
  } catch (err) {
    console.error('[setup-game] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
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
    console.error('[/api/scramble-teams] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/kick-all-bots', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'bot_kick all');
    return res.status(200).json({ message: 'All bots kicked!' });
  } catch (err) {
    console.error('[/api/kick-all-bots] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/add-bot', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'bot_add');
    return res.status(200).json({ message: 'Bot added!' });
  } catch (err) {
    console.error('[/api/add-bot] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/kill-bots', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'bot_kill');
    return res.status(200).json({ message: 'Bots killed!' });
  } catch (err) {
    console.error('[/api/kill-bots] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle-Endpoints für ConVars
// mp_limitteams an/aus
router.post('/api/limitteams-toggle', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const { value } = req.body;
    await runGameCmd(server_id, `mp_limitteams ${value}`);
    return res.status(200).json({ message: `mp_limitteams set to ${value}` });
  } catch (err) {
    console.error('[/api/limitteams-toggle] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// mp_autoteambalance an/aus
router.post('/api/autoteam-toggle', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const { value } = req.body;
    await runGameCmd(server_id, `mp_autoteambalance ${value}`);
    return res.status(200).json({ message: `mp_autoteambalance set to ${value}` });
  } catch (err) {
    console.error('[/api/autoteam-toggle] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// mp_friendlyfire an/aus
router.post('/api/friendlyfire-toggle', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const { value } = req.body;
    await runGameCmd(server_id, `mp_friendlyfire ${value}`);
    return res.status(200).json({ message: `mp_friendlyfire set to ${value}` });
  } catch (err) {
    console.error('[/api/friendlyfire-toggle] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// mp_autokick an/aus
router.post('/api/autokick-toggle', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const { value } = req.body;
    await runGameCmd(server_id, `mp_autokick ${value}`);
    return res.status(200).json({ message: `mp_autokick set to ${value}` });
  } catch (err) {
    console.error('[/api/autokick-toggle] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
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
    console.error('[/api/restart] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
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
    console.error('[/api/start-warmup] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
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
    console.error('[/api/start-knife] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/swap-team', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'mp_swapteams');
    return res.status(200).json({ message: 'Teams swapped!' });
  } catch (err) {
    console.error('[/api/swap-team] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
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
    console.error('[/api/go-live] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
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
    console.error('[/api/list-backups] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
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
    console.error('[/api/restore-round] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/restore-latest-backup', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const resp = await rcon.execute_command(server_id, 'mp_backup_round_file_last');
    const [ok, text] = rconResponse(resp);
    const lastFile = ok && typeof text === 'string' ? text.split('=')[1]?.trim() : null;
    if (lastFile && lastFile.endsWith('.txt')) {
      await runGameCmd(server_id, `mp_backup_restore_load_file ${lastFile}`);
      await runGameCmd(server_id, 'mp_pause_match');
      return res.status(200).json({ message: `Latest round restored (${lastFile})` });
    }
    return res.status(200).json({ message: 'No latest backup found!' });
  } catch (err) {
    console.error('[/api/restore-latest-backup] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
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
    console.error('[/api/pause] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/unpause', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    await runGameCmd(server_id, 'mp_unpause_match');
    return res.status(200).json({ message: 'Game unpaused' });
  } catch (err) {
    console.error('[/api/unpause] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/rcon', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const { command } = req.body;
    console.log(`[rcon] ${command}`);
    const resp = await rcon.execute_command(server_id, command);
    const [ok, text] = rconResponse(resp);
    const msg = ok ? 'Command sent!' : `Response:\n${text}`;
    return res.status(200).json({ message: msg });
  } catch (err) {
    console.error('[/api/rcon] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/say-admin', is_authenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const text = req.body.message;
    console.log(`[rcon] say ${text}`);
    await rcon.execute_command(server_id, `say ${text}`);
    return res.status(200).json({ message: 'Message sent!' });
  } catch (err) {
    console.error('[/api/say-admin] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
