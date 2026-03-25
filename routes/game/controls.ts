import express from 'express';
import isAuthenticated from '../../modules/middleware';
import { better_sqlite_client } from '../../db';
import { requireServerId } from '../../utils/parseServerId';
import { mapsConfig } from '../../utils/mapsConfig';
import {
  parseConVarValue,
  sendGameRouteError,
  parseIntBody,
  requireAllowlisted,
  runGameCmd,
  execCfg,
  makeToggleRoute,
  makeSimpleCmdRoute,
  makePresetRoute,
  makeMultiPresetRoute,
} from './helpers';

const router = express.Router();

const selectModeStmt = better_sqlite_client.prepare(
  'SELECT last_game_type, last_game_mode FROM servers WHERE id = ? AND owner_id = ?'
);

//
// === PRACTICE CONTROLS ===
//
router.post('/api/cheats-toggle', isAuthenticated, makeToggleRoute('cheats-toggle', 'sv_cheats'));
router.post(
  '/api/free-armor-toggle',
  isAuthenticated,
  makeToggleRoute('free-armor-toggle', 'mp_free_armor')
);
router.post(
  '/api/buy-anywhere-toggle',
  isAuthenticated,
  makeToggleRoute('buy-anywhere-toggle', 'mp_buy_anywhere')
);
router.post(
  '/api/grenade-trajectory-toggle',
  isAuthenticated,
  makeToggleRoute(
    'grenade-trajectory-toggle',
    'sv_grenade_trajectory_prac_pipreview',
    'sv_grenade_trajectory'
  )
);
router.post(
  '/api/show-impacts-toggle',
  isAuthenticated,
  makeToggleRoute('show-impacts-toggle', 'sv_showimpacts')
);

router.post('/api/respawn-toggle', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const value = parseConVarValue(req.body?.value);
    if (value === null) {
      return res.status(400).json({ error: 'value must be 0 or 1' });
    }
    console.log(
      `[game] user=${req.session?.user?.username ?? 'unknown'} action=respawn-toggle value=${value}`
    );
    await Promise.all([
      runGameCmd(server_id, `mp_respawn_on_death_ct ${value}`),
      runGameCmd(server_id, `mp_respawn_on_death_t ${value}`),
    ]);
    return res.status(200).json({ message: `Respawn set to ${value}` });
  } catch (err) {
    return sendGameRouteError(res, err, 'respawn-toggle');
  }
});

router.post(
  '/api/infinite-ammo-toggle',
  isAuthenticated,
  makePresetRoute('infinite-ammo-toggle', 'sv_infinite_ammo', [0, 1, 2])
);

router.post(
  '/api/set-freezetime',
  isAuthenticated,
  makePresetRoute('set-freezetime', 'mp_freezetime', [0, 5, 10, 15, 20])
);

router.post(
  '/api/set-startmoney',
  isAuthenticated,
  makeMultiPresetRoute(
    'set-startmoney',
    [0, 800, 1600, 3200, 16000],
    async (sid, n) => {
      await Promise.all([
        runGameCmd(sid, `mp_startmoney ${n}`),
        runGameCmd(sid, `mp_maxmoney ${Math.max(n, 16000)}`),
      ]);
    },
    (n) => `mp_startmoney set to ${n}`
  )
);

router.post(
  '/api/bot-difficulty',
  isAuthenticated,
  makePresetRoute('bot-difficulty', 'bot_difficulty', [0, 1, 2, 3])
);

//
// === PRACTICE CONTROLS (extended) ===
//
router.post(
  '/api/set-roundtime',
  isAuthenticated,
  makeMultiPresetRoute(
    'set-roundtime',
    [1, 2, 5, 60],
    async (sid, n) => {
      await Promise.all([
        runGameCmd(sid, `mp_roundtime ${n}`),
        runGameCmd(sid, `mp_roundtime_defuse ${n}`),
      ]);
    },
    (n) => `mp_roundtime set to ${n} min`
  )
);

router.post(
  '/api/bot-add-ct',
  isAuthenticated,
  makeSimpleCmdRoute('bot-add-ct', 'bot_add ct', 'CT bot added!')
);
router.post(
  '/api/bot-add-t',
  isAuthenticated,
  makeSimpleCmdRoute('bot-add-t', 'bot_add t', 'T bot added!')
);
router.post(
  '/api/bot-kick-ct',
  isAuthenticated,
  makeSimpleCmdRoute('bot-kick-ct', 'bot_kick ct', 'CT bots kicked!')
);
router.post(
  '/api/bot-kick-t',
  isAuthenticated,
  makeSimpleCmdRoute('bot-kick-t', 'bot_kick t', 'T bots kicked!')
);

const VALID_GIVE_WEAPONS = [
  'weapon_flashbang',
  'weapon_smokegrenade',
  'weapon_hegrenade',
  'weapon_molotov',
  'weapon_decoy',
  'weapon_incgrenade',
] as const;

router.post('/api/give-weapon', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const weapon = req.body?.weapon;
    if (typeof weapon !== 'string' || !(VALID_GIVE_WEAPONS as readonly string[]).includes(weapon)) {
      return res
        .status(400)
        .json({ error: `weapon must be one of: ${VALID_GIVE_WEAPONS.join(', ')}` });
    }
    console.log(
      `[game] user=${req.session?.user?.username ?? 'unknown'} action=give-weapon weapon=${weapon}`
    );
    await runGameCmd(server_id, `give ${weapon}`);
    return res.status(200).json({ message: `Gave ${weapon}` });
  } catch (err) {
    return sendGameRouteError(res, err, 'give-weapon');
  }
});

//
// === SCRIM CONTROLS ===
//
router.post(
  '/api/set-maxrounds',
  isAuthenticated,
  makePresetRoute('set-maxrounds', 'mp_maxrounds', [16, 24, 30])
);

const VALID_OT_ROUNDS = [3, 5, 6] as const;

router.post('/api/set-overtime', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const enable = parseConVarValue(req.body?.enable);
    if (enable === null) {
      return res.status(400).json({ error: 'enable must be 0 or 1' });
    }
    const otRounds = parseIntBody(req.body?.ot_rounds);
    if (
      !requireAllowlisted(
        res,
        otRounds,
        VALID_OT_ROUNDS,
        `ot_rounds must be one of: ${VALID_OT_ROUNDS.join(', ')}`
      )
    )
      return;
    console.log(
      `[game] user=${req.session?.user?.username ?? 'unknown'} action=set-overtime enable=${enable} ot_rounds=${otRounds}`
    );
    await Promise.all([
      runGameCmd(server_id, `mp_overtime_enable ${enable}`),
      runGameCmd(server_id, `mp_overtime_maxrounds ${otRounds}`),
    ]);
    return res
      .status(200)
      .json({ message: `Overtime ${enable ? 'enabled' : 'disabled'} (MR${otRounds})` });
  } catch (err) {
    return sendGameRouteError(res, err, 'set-overtime');
  }
});

//
// === FUN MODE CONTROLS ===
//
router.post(
  '/api/set-gravity',
  isAuthenticated,
  makePresetRoute('set-gravity', 'sv_gravity', [400, 600, 800])
);

router.post('/api/reload-mode', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const row = selectModeStmt.get(server_id, req.session.user.id) as
      | { last_game_type: string | null; last_game_mode: string | null }
      | undefined;
    if (!row?.last_game_type || !row?.last_game_mode) {
      return res.status(400).json({ error: 'No mode deployed yet — use Deploy Match first' });
    }
    const gt = mapsConfig.gameTypes?.[row.last_game_type];
    const gm = gt?.gameModes?.[row.last_game_mode];
    if (!gm?.exec) {
      return res.status(400).json({ error: 'Unknown game type/mode in config' });
    }
    console.log(
      `[game] user=${req.session?.user?.username ?? 'unknown'} action=reload-mode cfg=${gm.exec}`
    );
    await execCfg(server_id, gm.exec);
    return res.status(200).json({ message: `Reloaded: ${gm.exec}` });
  } catch (err) {
    return sendGameRouteError(res, err, 'reload-mode');
  }
});

export default router;
