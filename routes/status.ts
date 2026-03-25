import express from 'express';
import { better_sqlite_client } from '../db';
import rcon from '../modules/rcon';
import isAuthenticated from '../modules/middleware';
import { parseServerId } from '../utils/parseServerId';

const router = express.Router();

interface StatusRow {
  last_map: string | null;
  last_game_type: string | null;
  last_game_mode: string | null;
}

const selectStatusStmt = better_sqlite_client.prepare(`
  SELECT last_map, last_game_type, last_game_mode
    FROM servers
   WHERE id = ? AND owner_id = ?
`);

router.get('/api/status/:server_id', isAuthenticated, async (req, res) => {
  const serverId = parseServerId(req.params.server_id);
  if (!serverId) {
    return res.status(404).json({ error: 'Server not found' });
  }

  try {
    const row = selectStatusStmt.get(serverId, req.session.user.id) as StatusRow | undefined;
    if (!row) {
      return res.status(404).json({ error: 'Server not found' });
    }

    let humanCount: number | null = null;
    let botCount: number | null = null;
    try {
      const resp = await rcon.executeCommand(serverId, 'status');
      const text = typeof resp === 'string' ? resp : '';

      const m = text.match(/players\s*:\s*(\d+)\s*humans,\s*(\d+)\s*bots/i);
      if (m) {
        humanCount = parseInt(m[1]!, 10);
        botCount = parseInt(m[2]!, 10);
      }
    } catch (err) {
      console.error(`[status] RCON status error for server ${serverId}:`, err);
    }

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

export default router;
