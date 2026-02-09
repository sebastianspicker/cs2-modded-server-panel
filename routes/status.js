// routes/status.js
const express = require('express');
const router = express.Router();
const { better_sqlite_client } = require('../db');
const rcon = require('../modules/rcon');
const is_authenticated = require('../modules/middleware');

/**
 * GET /api/status/:server_id
 * Returns:
 *  - map                        from the panel state (DB)
 *  - last_game_type, last_game_mode from the panel state (DB)
 *  - current human and bot counts parsed from RCON 'status' output
 */
function parseServerId(val) {
  if (val == null || val === '') return null;
  const id = typeof val === 'number' ? val : parseInt(String(val).trim(), 10);
  return Number.isInteger(id) && id > 0 ? String(id) : null;
}

router.get('/api/status/:server_id', is_authenticated, async (req, res) => {
  const serverId = parseServerId(req.params.server_id);
  if (!serverId) {
    return res.status(404).json({ error: 'Server not found' });
  }

  try {
    // 1) Fetch last‐saved panel state from DB
    const stmt = better_sqlite_client.prepare(`
      SELECT last_map, last_game_type, last_game_mode
        FROM servers
       WHERE id = ?
    `);
    const row = stmt.get(serverId);
    if (!row) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // 2) Query live status via RCON
    let humanCount = null;
    let botCount = null;
    try {
      const resp = await rcon.execute_command(serverId, 'status');
      const text = typeof resp === 'string' ? resp : '';

      // 3) Parse the "players  : X humans, Y bots" line (case-insensitive)
      // e.g. "players  : 0 humans, 2 bots (0 max) ..."
      const m = text.match(/players\s*:\s*(\d+)\s*humans,\s*(\d+)\s*bots/i);
      if (m) {
        humanCount = parseInt(m[1], 10);
        botCount = parseInt(m[2], 10);
      }
    } catch (err) {
      console.error(`[status] RCON status error for server ${serverId}:`, err);
      // continue — we'll still return DB state
    }

    // 4) Return combined status, with "map" instead of "last_map"
    return res.json({
      map: row.last_map || null,
      last_game_type: row.last_game_type || null,
      last_game_mode: row.last_game_mode || null,
      humans: humanCount,
      bots: botCount,
    });
  } catch (err) {
    console.error('[status] Error fetching status:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
