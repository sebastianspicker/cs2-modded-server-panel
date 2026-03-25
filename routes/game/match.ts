import express from 'express';
import rcon from '../../modules/rcon';
import isAuthenticated from '../../modules/middleware';
import { better_sqlite_client } from '../../db';
import { requireServerId } from '../../utils/parseServerId';
import { getMapsForMode, mapsConfig } from '../../utils/mapsConfig';
import {
  sanitizeString,
  sanitizeBackupFileName,
  sanitizeCfgName,
  isRconCommandAllowed,
  rconResponse,
  sendGameRouteError,
  parseIntBody,
  runGameCmd,
  execCfg,
  makeToggleRoute,
  makeSimpleCmdRoute,
  makeSequenceRoute,
  MAX_TEAM_NAME_LEN,
  MAX_SAY_MESSAGE_LEN,
  MAX_RCON_COMMAND_LEN,
  RCON_BLOCKED_COMMANDS,
} from './helpers';

const router = express.Router();

const updateServerStmt = better_sqlite_client.prepare(`
  UPDATE servers
     SET last_map        = ?,
         last_game_type  = ?,
         last_game_mode  = ?
   WHERE id = ?
`);

//
// === SETUP / CREATE MATCH ===
//
router.post('/api/setup-game', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const { team1 = '', team2 = '', game_type, game_mode, selectedMap } = req.body;

    if (typeof game_type !== 'string' || typeof game_mode !== 'string') {
      return res.status(400).json({ error: 'game_type and game_mode are required strings' });
    }
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
    // Allow alphanumeric, underscore, hyphen, dot, and forward-slash (for workshop/id/name paths).
    const VALID_MAP_NAME_RE = /^[a-zA-Z0-9_./-]+$/;
    if (!mapName || !VALID_MAP_NAME_RE.test(mapName)) {
      return res.status(400).json({ error: 'selectedMap contains invalid characters' });
    }
    if (allowedMaps.length > 0 && !allowedMaps.includes(mapName)) {
      return res.status(400).json({
        error: `selectedMap must be one of: ${allowedMaps.join(', ')}`,
      });
    }

    // Validate cfg name before sending any RCON commands so we never leave the
    // server in a half-applied state (map changed, CFG not loaded).
    const execFile = sanitizeCfgName(gm.exec);
    if (!execFile) {
      return res.status(400).json({ error: 'Invalid exec config name' });
    }

    const t1 = sanitizeString(team1, MAX_TEAM_NAME_LEN);
    const t2 = sanitizeString(team2, MAX_TEAM_NAME_LEN);

    const username = req.session?.user?.username ?? 'unknown';
    console.log(
      `[game] user=${username} action=setup-game map=${mapName} gameType=${game_type} gameMode=${game_mode}`
    );

    if (t1) await runGameCmd(server_id, `mp_teamname_1 "${t1}"`);
    if (t2) await runGameCmd(server_id, `mp_teamname_2 "${t2}"`);

    await runGameCmd(server_id, `changelevel ${mapName}`);
    await execCfg(server_id, execFile);

    updateServerStmt.run(mapName, game_type, game_mode, server_id);

    return res.status(200).json({ message: 'Game Created!' });
  } catch (err) {
    return sendGameRouteError(res, err, 'setup-game');
  }
});

//
// === QUICK COMMANDS ===
//
router.post(
  '/api/scramble-teams',
  isAuthenticated,
  makeSimpleCmdRoute('scramble-teams', 'mp_shuffleteams', 'Teams scrambled!')
);
router.post(
  '/api/kick-all-bots',
  isAuthenticated,
  makeSimpleCmdRoute('kick-all-bots', 'bot_kick all', 'All bots kicked!')
);
router.post(
  '/api/add-bot',
  isAuthenticated,
  makeSimpleCmdRoute('add-bot', 'bot_add', 'Bot added!')
);
router.post(
  '/api/kill-bots',
  isAuthenticated,
  makeSimpleCmdRoute('kill-bots', 'bot_kill', 'Bots killed!')
);

//
// === MATCH SETTINGS TOGGLES ===
//
router.post(
  '/api/limitteams-toggle',
  isAuthenticated,
  makeToggleRoute('limitteams-toggle', 'mp_limitteams')
);
router.post(
  '/api/autoteam-toggle',
  isAuthenticated,
  makeToggleRoute('autoteam-toggle', 'mp_autoteambalance')
);
router.post(
  '/api/friendlyfire-toggle',
  isAuthenticated,
  makeToggleRoute('friendlyfire-toggle', 'mp_friendlyfire')
);
router.post(
  '/api/autokick-toggle',
  isAuthenticated,
  makeToggleRoute('autokick-toggle', 'mp_autokick')
);

//
// === GAME PHASE COMMANDS ===
//
router.post(
  '/api/restart',
  isAuthenticated,
  makeSimpleCmdRoute('restart', 'mp_restartgame 1', 'Game restarted')
);
router.post(
  '/api/swap-team',
  isAuthenticated,
  makeSimpleCmdRoute('swap-team', 'mp_swapteams', 'Teams swapped!')
);
router.post(
  '/api/pause',
  isAuthenticated,
  makeSimpleCmdRoute('pause', 'mp_pause_match', 'Game paused')
);
router.post(
  '/api/unpause',
  isAuthenticated,
  makeSimpleCmdRoute('unpause', 'mp_unpause_match', 'Game unpaused')
);

router.post(
  '/api/start-warmup',
  isAuthenticated,
  makeSequenceRoute('start-warmup', ['mp_restartgame 1', { cfg: 'warmup.cfg' }], 'Warmup started!')
);
router.post(
  '/api/start-knife',
  isAuthenticated,
  makeSequenceRoute(
    'start-knife',
    ['mp_warmup_end', 'mp_restartgame 1', { cfg: 'knife.cfg' }],
    'Knife started!'
  )
);
router.post(
  '/api/go-live',
  isAuthenticated,
  makeSequenceRoute('go-live', ['mp_warmup_end', 'mp_restartgame 1'], 'Match is live!')
);

//
// === ROUND BACKUPS ===
//
router.post('/api/list-backups', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    console.log(`[game] user=${req.session?.user?.username ?? 'unknown'} action=list-backups`);
    const resp = await rcon.executeCommand(server_id, 'mp_backup_restore_list_files');
    const [ok, text] = rconResponse(resp);
    return res.status(200).json({ message: ok ? text : 'RCON command failed' });
  } catch (err) {
    return sendGameRouteError(res, err, 'list-backups');
  }
});

router.post('/api/restore-round', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const n = parseIntBody(req.body.round_number);
    if (!Number.isInteger(n) || n < 1 || n > 99) {
      return res.status(400).json({ error: 'round_number must be 1-99' });
    }
    const num = String(n).padStart(2, '0');
    console.log(
      `[game] user=${req.session?.user?.username ?? 'unknown'} action=restore-round round=${n}`
    );
    await runGameCmd(server_id, `mp_backup_restore_load_file backup_round${num}.txt`);
    await runGameCmd(server_id, 'mp_pause_match');
    return res.status(200).json({ message: 'Round restored!' });
  } catch (err) {
    return sendGameRouteError(res, err, 'restore-round');
  }
});

router.post('/api/restore-latest-backup', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    console.log(
      `[game] user=${req.session?.user?.username ?? 'unknown'} action=restore-latest-backup`
    );
    const resp = await rcon.executeCommand(server_id, 'mp_backup_round_file_last');
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
    return sendGameRouteError(res, err, 'restore-latest-backup');
  }
});

//
// === RCON / SAY ===
//
router.post('/api/rcon', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const command = req.body?.command;
    if (!isRconCommandAllowed(command)) {
      return res.status(400).json({
        error: `Command not allowed (single command only, max ${MAX_RCON_COMMAND_LEN} chars, blocked: ${RCON_BLOCKED_COMMANDS.join(', ')})`,
      });
    }
    console.log(`[rcon] user=${req.session?.user?.username ?? 'unknown'} command=${command}`);
    const resp = await rcon.executeCommand(
      server_id,
      typeof command === 'string' ? command.trim() : ''
    );
    const [ok, text] = rconResponse(resp);
    const msg = ok && text ? `Response:\n${text}` : 'Command sent!';
    return res.status(200).json({ message: msg });
  } catch (err) {
    return sendGameRouteError(res, err, 'rcon');
  }
});

router.post('/api/say-admin', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const text = sanitizeString(req.body?.message, MAX_SAY_MESSAGE_LEN);
    if (!text) {
      return res.status(400).json({
        error: 'message is required and must be non-empty after sanitization',
      });
    }
    console.log(`[rcon] user=${req.session?.user?.username ?? 'unknown'} command=say ${text}`);
    await rcon.executeCommand(server_id, `say "${text}"`);
    return res.status(200).json({ message: 'Message sent!' });
  } catch (err) {
    return sendGameRouteError(res, err, 'say-admin');
  }
});

export default router;
