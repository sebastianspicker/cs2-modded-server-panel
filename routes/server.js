// routes/server.js
const express = require('express');
const router = express.Router();
const { better_sqlite_client } = require('../db');
const mapsConfig = require('../cfg/maps.json');
const pluginConfig = require('../cfg/plugins.json');

const rcon = require('../modules/rcon');
const is_authenticated = require('../modules/middleware');

function parseServerId(val) {
  if (val == null || val === '') return null;
  const id = typeof val === 'number' ? val : parseInt(String(val).trim(), 10);
  return Number.isInteger(id) && id > 0 ? String(id) : null;
}

// Render “Add Server” form
router.get('/add-server', is_authenticated, (req, res) => {
  res.render('add-server');
});

// Render “My Servers” overview page
router.get('/servers', is_authenticated, (req, res) => {
  res.render('servers');
});

// Render the “Manage Server” page, injecting RCON info + map/game config + plugin lists + last_* state
router.get('/manage/:server_id', is_authenticated, async (req, res) => {
  try {
    const server_id = parseServerId(req.params.server_id);
    if (!server_id) {
      return res.status(404).send('Server not found');
    }
    await rcon.readyPromise;
    const stmt = better_sqlite_client.prepare(`
      SELECT 
        id,
        serverIP,
        serverPort,
        rconPassword,
        last_game_type,
        last_game_mode,
        last_map
      FROM servers
      WHERE id = ?
    `);
    const server = stmt.get(server_id);

    if (!server) {
      return res.status(404).send('Server not found');
    }

    // Fetch hostname via RCON (nur falls verbunden)
    let hostname = '–';
    try {
      const resp = await rcon.execute_command(server_id, 'hostname');
      const txt = typeof resp === 'string' ? resp : '';
      hostname = txt.includes('=') ? txt.split('=')[1].trim() : txt || '–';
    } catch {
      // Silent failure, wir zeigen trotzdem das Manage-Template
    }

    // Host/port aus den RCON-Details
    const details = rcon.details[server_id] || {};
    const host = details.host || server.serverIP;
    const port = details.port || server.serverPort;

    // Spiel-Konfig aus maps.json
    const gameTypes = Object.keys(mapsConfig.gameTypes);
    const mapGroups = Object.entries(mapsConfig.mapGroups).map(([id, grp]) => ({
      id,
      displayName: grp.displayName,
    }));

    // Plugins: root vs. disabled
    const allPlugins = pluginConfig.plugins;
    const rootPlugins = allPlugins.filter((p) => p.defaultEnabled).map((p) => p.name);
    const disabledPlugins = allPlugins.filter((p) => !p.defaultEnabled).map((p) => p.name);

    // LAST-STATE (falls vorhanden) mit Default-Fallbacks
    const lastGameType = server.last_game_type || Object.keys(mapsConfig.gameTypes)[0];
    const lastGameMode =
      server.last_game_mode ||
      (mapsConfig.gameTypes[lastGameType] &&
        Object.keys(mapsConfig.gameTypes[lastGameType].gameModes)[0]) ||
      '';
    const lastMap = server.last_map || '';

    // Render & Props übergeben (safeServerId nur Ziffern für Script-Kontext)
    const safeServerId = /^\d+$/.test(String(server_id)) ? server_id : '';
    res.render('manage', {
      server_id,
      safeServerId,
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
router.post('/api/add-server', is_authenticated, async (req, res) => {
  const { server_ip, server_port, rcon_password } = req.body;

  const ip = typeof server_ip === 'string' ? server_ip.trim() : '';
  const portNum = typeof server_port === 'number' ? server_port : parseInt(String(server_port || ''), 10);
  const password = typeof rcon_password === 'string' ? rcon_password : '';

  if (!ip || ip.length > 255) {
    return res.status(400).json({ error: 'server_ip is required and must be at most 255 characters' });
  }
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return res.status(400).json({ error: 'server_port must be an integer between 1 and 65535' });
  }
  if (!password || password.length > 512) {
    return res.status(400).json({ error: 'rcon_password is required and must be at most 512 characters' });
  }

  try {
    const insert = better_sqlite_client.prepare(`
      INSERT INTO servers (serverIP, serverPort, rconPassword)
      VALUES (?, ?, ?)
    `);
    const result = insert.run(ip, portNum, password);

    if (result.changes > 0) {
      await rcon.init();
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
router.get('/api/servers', is_authenticated, async (req, res) => {
  try {
    await rcon.readyPromise;
    const stmt = better_sqlite_client.prepare(`SELECT * FROM servers`);
    const servers = stmt.all();

    for (const s of servers) {
      const sid = s.id.toString();
      s.hostname = '-';
      s.connected = false;
      s.authenticated = false;

      if (sid in rcon.rcons) {
        try {
          const resp = await rcon.execute_command(sid, 'hostname');
          const txt = typeof resp === 'string' ? resp : '';
          s.hostname = txt.includes('=') ? txt.split('=')[1].trim() : txt || '-';
          s.connected = true;
          s.authenticated = true;
        } catch (e) {
          console.warn(`[server] RCON error for ${sid}:`, e.message);
        }
      }
    }

    res.json({ servers });
  } catch (err) {
    console.error('[server] list-servers error:', err);
    res.status(500).json({ error: 'An error occurred while fetching servers.' });
  }
});

// API: Reconnect to a server’s RCON session
router.post('/api/reconnect-server', is_authenticated, async (req, res) => {
  try {
    const server_id = parseServerId(req.body?.server_id);
    if (!server_id) {
      return res.status(400).json({ error: 'Missing or invalid server_id' });
    }
    const stmt = better_sqlite_client.prepare(`SELECT * FROM servers WHERE id = ?`);
    const server = stmt.get(server_id);

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    await rcon.connect(server_id, server);
    res.status(200).json({ message: 'Reconnected successfully' });
  } catch (err) {
    console.error('[server] reconnect-server error:', err);
    res.status(500).json({ error: 'An error occurred while reconnecting to the server.' });
  }
});

// API: Delete a server from the database
router.post('/api/delete-server', is_authenticated, async (req, res) => {
  try {
    const server_id = parseServerId(req.body?.server_id);
    if (!server_id) {
      return res.status(400).json({ error: 'Missing or invalid server_id' });
    }
    const del = better_sqlite_client.prepare(`DELETE FROM servers WHERE id = ?`);
    const result = del.run(server_id);

    if (result.changes > 0) {
      await rcon.disconnect_rcon(server_id);
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
router.get('/api/game-types/:type/game-modes', is_authenticated, (req, res) => {
  const { type } = req.params;
  const typeCfg = mapsConfig.gameTypes[type];
  if (!typeCfg) {
    return res.status(404).json({ error: 'Unknown game type' });
  }
  const modes = Object.keys(typeCfg.gameModes);
  res.json({ gameModes: modes });
});

// API: return flattened map list for a given type/mode
router.get('/api/game-types/:type/game-modes/:mode/maps', is_authenticated, (req, res) => {
  const { type, mode } = req.params;
  const typeCfg = mapsConfig.gameTypes[type];
  if (!typeCfg) {
    return res.status(404).json({ error: 'Unknown game mode' });
  }
  const modeCfg = typeCfg.gameModes[mode];
  if (!modeCfg) {
    return res.status(404).json({ error: 'Unknown game mode' });
  }

  let maps = [];
  for (const mg of modeCfg.mapGroups || []) {
    const grp = mapsConfig.mapGroups[mg];
    if (grp && Array.isArray(grp.maps)) {
      maps = maps.concat(grp.maps);
    }
  }
  res.json({ maps });
});

// API: apply plugin‐override via RCON (only allowed plugin names from config)
router.post('/api/plugins/apply', is_authenticated, async (req, res) => {
  const server_id = parseServerId(req.body?.server_id);
  if (!server_id) {
    return res.status(400).json({ error: 'Missing or invalid server_id' });
  }
  const validNames = new Set(pluginConfig.plugins.map((p) => p.name));
  const enable = Array.isArray(req.body?.enable) ? req.body.enable : [];
  const disable = Array.isArray(req.body?.disable) ? req.body.disable : [];
  const enableFiltered = enable.filter((name) => validNames.has(name));
  const disableFiltered = disable.filter((name) => validNames.has(name));

  try {
    for (const plugin of disableFiltered) {
      const p = pluginConfig.plugins.find((x) => x.name === plugin);
      const path = p && p.defaultEnabled ? p.name : `disabled/${plugin}`;
      await rcon.execPluginCmd(server_id, 'unload', path);
    }
    for (const plugin of enableFiltered) {
      const p = pluginConfig.plugins.find((x) => x.name === plugin);
      const path = p && p.defaultEnabled ? p.name : `disabled/${plugin}`;
      await rcon.execPluginCmd(server_id, 'reload', path);
    }

    res.json({ message: 'Plugins successfully overridden via RCON.' });
  } catch (err) {
    console.error('[server] apply-plugins error:', err);
    res.status(500).json({ error: 'Failed to override plugins on CS2 server.' });
  }
});

module.exports = router;
