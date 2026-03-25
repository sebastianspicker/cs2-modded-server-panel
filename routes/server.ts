import express from 'express';
import rateLimit from 'express-rate-limit';
import { better_sqlite_client } from '../db';
import pluginConfig from '../cfg/plugins.json';
import { parseServerId, requireServerId } from '../utils/parseServerId';
import { getMapsForMode, mapsConfig } from '../utils/mapsConfig';
import { parseHostnameResponse } from '../utils/rconResponse';
import { encryptRconSecret } from '../utils/rconSecret';
import rcon from '../modules/rcon';
import isAuthenticated from '../modules/middleware';
import { isValidServerHost, isValidServerHostResolved } from '../utils/networkValidation';

const router = express.Router();

// Pre-prepared statements for performance (avoid re-preparing per request)
const selectManageStmt = better_sqlite_client.prepare(`
  SELECT id, serverIP, serverPort, last_game_type, last_game_mode, last_map
    FROM servers WHERE id = ? AND owner_id = ?
`);
const insertServerStmt = better_sqlite_client.prepare(`
  INSERT INTO servers (serverIP, serverPort, rconPassword, owner_id) VALUES (?, ?, ?, ?)
`);
const selectAllServersStmt = better_sqlite_client.prepare(
  `SELECT id, serverIP, serverPort FROM servers WHERE owner_id = ?`
);
const selectServerByIdStmt = better_sqlite_client.prepare(
  `SELECT * FROM servers WHERE id = ? AND owner_id = ?`
);
const deleteServerStmt = better_sqlite_client.prepare(
  `DELETE FROM servers WHERE id = ? AND owner_id = ?`
);
const countServersByOwnerStmt = better_sqlite_client.prepare(
  `SELECT COUNT(*) AS count FROM servers WHERE owner_id = ?`
);

interface ServerRow {
  id: number;
  serverIP: string;
  serverPort: number;
  last_game_type?: string;
  last_game_mode?: string;
  last_map?: string;
}

interface ServerListRow {
  id: number;
  serverIP: string;
  serverPort: number;
  hostname?: string;
  connected?: boolean;
  authenticated?: boolean;
}

interface ServerFullRow extends ServerRow {
  rconPassword: string;
}

const addServerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { status: 429, message: 'Too many servers added; try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Render "Add Server" form
router.get('/add-server', isAuthenticated, (req, res) => {
  res.render('add-server');
});

// Render "My Servers" overview page
router.get('/servers', isAuthenticated, (req, res) => {
  res.render('servers');
});

// Render the "Manage Server" page
router.get('/manage/:server_id', isAuthenticated, async (req, res) => {
  try {
    const server_id = parseServerId(req.params.server_id);
    if (!server_id) {
      return res.status(404).send('Server not found');
    }
    await rcon.readyPromise;
    const ownerId = req.session.user?.id;
    const server = selectManageStmt.get(server_id, ownerId) as ServerRow | undefined;

    if (!server) {
      return res.status(404).send('Server not found');
    }

    let hostname = '–';
    try {
      const resp = await rcon.executeCommand(server_id, 'hostname');
      hostname = parseHostnameResponse(resp, '–');
    } catch {
      // Silent failure — still show the manage template
    }

    const details = rcon.details[server_id] || ({} as { host?: string; port?: number });
    const host = details.host || server.serverIP;
    const port = details.port || server.serverPort;

    const gameTypes = Object.keys(mapsConfig.gameTypes);
    const mapGroups = Object.entries(mapsConfig.mapGroups).map(([id, grp]) => ({
      id,
      displayName: grp.displayName,
    }));

    const allPlugins = pluginConfig.plugins;
    const rootPlugins = allPlugins.filter((p) => p.defaultEnabled).map((p) => p.name);
    const disabledPlugins = allPlugins.filter((p) => !p.defaultEnabled).map((p) => p.name);

    const lastGameType = server.last_game_type || Object.keys(mapsConfig.gameTypes)[0] || '';
    const gt = mapsConfig.gameTypes[lastGameType];
    const lastGameMode =
      server.last_game_mode || (gt ? Object.keys(gt.gameModes)[0] : undefined) || '';
    const lastMap = server.last_map || '';

    res.render('manage', {
      server_id,
      hostname,
      host,
      port,
      gameTypes,
      mapGroups,
      rootPlugins,
      disabledPlugins,
      lastGameType,
      lastGameMode,
      lastMap,
      pluginConfig,
      connected: !!rcon.details[server_id]?.connected,
      authenticated: !!rcon.details[server_id]?.authenticated,
    });
  } catch (err) {
    console.error('[server] manage error:', err);
    return res.status(500).send('Internal Server Error');
  }
});

// API: Add a new CS2 server to the database
router.post('/api/add-server', isAuthenticated, addServerLimiter, async (req, res) => {
  const { server_ip, server_port, rcon_password } = req.body;

  const ip = typeof server_ip === 'string' ? server_ip.trim() : '';
  const portNum =
    typeof server_port === 'number' ? server_port : parseInt(String(server_port || ''), 10);
  const password = typeof rcon_password === 'string' ? rcon_password : '';

  if (!isValidServerHost(ip)) {
    return res.status(400).json({
      error: 'server_ip must be a valid IPv4/IPv6 address or hostname',
    });
  }
  if (!(await isValidServerHostResolved(ip))) {
    return res.status(400).json({
      error: 'server_ip must not resolve to a private or reserved IP address',
    });
  }
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return res.status(400).json({ error: 'server_port must be an integer between 1 and 65535' });
  }
  if (!password || password.length > 512) {
    return res.status(400).json({
      error: 'rcon_password is required and must be at most 512 characters',
    });
  }

  try {
    const ownerId = req.session.user?.id;
    const { count: serverCount } = countServersByOwnerStmt.get(ownerId) as { count: number };
    if (serverCount >= 50) {
      return res.status(400).json({ error: 'Maximum server limit reached' });
    }

    const encryptedPassword = encryptRconSecret(password);
    const result = insertServerStmt.run(ip, portNum, encryptedPassword, ownerId);

    if (result.changes > 0) {
      const newId = Number(result.lastInsertRowid);
      await rcon.connectServer({
        id: newId,
        serverIP: ip,
        serverPort: portNum,
        rconPassword: encryptedPassword,
      });
      return res.status(201).json({ message: 'Server added successfully' });
    } else {
      return res.status(500).json({ error: 'Failed to add the server' });
    }
  } catch (err) {
    console.error('[server] add-server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// API: List all servers with connection & hostname status
router.get('/api/servers', isAuthenticated, async (req, res) => {
  try {
    await rcon.readyPromise;
    const ownerId = req.session.user?.id;
    const servers = selectAllServersStmt.all(ownerId) as ServerListRow[];

    // Query all server hostnames in parallel with a 2-second overall timeout
    const BATCH_TIMEOUT_MS = 2000;
    const hostnameProbes = servers.map(async (s) => {
      const sid = s.id.toString();
      s.hostname = '-';
      s.connected = false;
      s.authenticated = false;

      if (sid in rcon.rcons) {
        try {
          const resp = await rcon.executeCommand(sid, 'hostname');
          s.hostname = parseHostnameResponse(resp, '-');
          s.connected = true;
          s.authenticated = true;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          console.warn(`[server] RCON error for ${sid}:`, message);
        }
      }
    });
    await Promise.race([
      Promise.allSettled(hostnameProbes),
      new Promise((resolve) => setTimeout(resolve, BATCH_TIMEOUT_MS)),
    ]);

    res.json({ servers });
  } catch (err) {
    console.error('[server] list-servers error:', err);
    res.status(500).json({ error: 'An error occurred while fetching servers.' });
  }
});

// API: Reconnect to a server's RCON session
router.post('/api/reconnect-server', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const ownerId = req.session.user?.id;
    const server = selectServerByIdStmt.get(server_id, ownerId) as ServerFullRow | undefined;

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    rcon.servers[server_id] = { id: server.id, serverIP: server.serverIP, serverPort: server.serverPort };
    await rcon.disconnectRcon(server_id);
    await rcon.connect(server_id, server);
    res.status(200).json({ message: 'Reconnected successfully' });
  } catch (err) {
    console.error('[server] reconnect-server error:', err);
    res.status(500).json({ error: 'An error occurred while reconnecting to the server.' });
  }
});

// API: Delete a server from the database
router.post('/api/delete-server', isAuthenticated, async (req, res) => {
  try {
    const server_id = requireServerId(req, res);
    if (!server_id) return;
    const ownerId = req.session.user?.id;
    const result = deleteServerStmt.run(server_id, ownerId);

    if (result.changes > 0) {
      await rcon.disconnectRcon(server_id);
      delete rcon.servers[server_id];
      return res.status(200).json({ message: 'Server deleted successfully' });
    } else {
      return res.status(404).json({ error: 'Server not found' });
    }
  } catch (err) {
    console.error('[server] delete-server error:', err);
    res.status(500).json({ error: 'An error occurred while deleting the server.' });
  }
});

// API: return list of game-modes for a given game-type
router.get('/api/game-types/:type/game-modes', isAuthenticated, (req, res) => {
  const type = req.params.type!; // guaranteed by Express route pattern `:type`
  const typeCfg = mapsConfig.gameTypes[type];
  if (!typeCfg) {
    return res.status(404).json({ error: 'Unknown game type' });
  }
  const modes = Object.keys(typeCfg.gameModes);
  res.json({ gameModes: modes });
});

// API: return flattened map list for a given type/mode
router.get('/api/game-types/:type/game-modes/:mode/maps', isAuthenticated, (req, res) => {
  const type = req.params.type!; // guaranteed by Express route pattern `:type`
  const mode = req.params.mode!; // guaranteed by Express route pattern `:mode`
  const typeCfg = mapsConfig.gameTypes[type];
  if (!typeCfg) {
    return res.status(404).json({ error: 'Unknown game type' });
  }
  const modeCfg = typeCfg.gameModes[mode];
  if (!modeCfg) {
    return res.status(404).json({ error: 'Unknown game mode' });
  }
  const maps = getMapsForMode(type, mode);
  res.json({ maps });
});

// API: apply plugin-override via RCON
router.post('/api/plugins/apply', isAuthenticated, async (req, res) => {
  const server_id = requireServerId(req, res);
  if (!server_id) return;
  const validNames = new Set(pluginConfig.plugins.map((p) => p.name));
  const enable: unknown[] = Array.isArray(req.body?.enable) ? req.body.enable : [];
  const disable: unknown[] = Array.isArray(req.body?.disable) ? req.body.disable : [];
  const enableFiltered = enable.filter(
    (name): name is string => typeof name === 'string' && validNames.has(name)
  );
  const disableFiltered = disable.filter(
    (name): name is string => typeof name === 'string' && validNames.has(name)
  );

  try {
    for (const plugin of disableFiltered) {
      const p = pluginConfig.plugins.find((x) => x.name === plugin);
      const pluginPath = p && p.defaultEnabled ? p.name : `disabled/${plugin}`;
      await rcon.execPluginCmd(server_id, 'unload', pluginPath);
    }
    for (const plugin of enableFiltered) {
      const p = pluginConfig.plugins.find((x) => x.name === plugin);
      const pluginPath = p && p.defaultEnabled ? p.name : `disabled/${plugin}`;
      await rcon.execPluginCmd(server_id, 'reload', pluginPath);
    }

    res.json({ message: 'Plugins successfully overridden via RCON.' });
  } catch (err) {
    console.error('[server] apply-plugins error:', err);
    res.status(500).json({ error: 'Failed to override plugins on CS2 server.' });
  }
});

export default router;
