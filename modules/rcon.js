// /modules/rcon.js
const Rcon = require('rcon-srcds').default;
const { better_sqlite_client } = require('../db');
const { decryptRconSecret } = require('../utils/rconSecret');

class RconManager {
  constructor() {
    this.rcons = {};
    this.details = {};
    this.servers = {};
    const raw = Number.parseInt(process.env.RCON_COMMAND_TIMEOUT_MS || '2000', 10);
    this.commandTimeoutMs = Number.isFinite(raw) && raw > 0 ? raw : 2000;
    this.readyPromise = this.init();
  }

  /** Initialisiert Verbindungen zu allen in der DB stehenden Servern */
  async init() {
    try {
      const stmt = better_sqlite_client.prepare(
        'SELECT id, serverIP, serverPort, rconPassword FROM servers'
      );
      const servers = stmt.all();
      console.log('[rcon] Initializing connections for', servers.length, 'server(s)');
      for (const server of servers) {
        const sid = server.id.toString();
        if (this.rcons[sid]) continue;
        this.servers[sid] = server;
        await this.connect(sid, server);
      }
    } catch (err) {
      console.error('Error initializing RCON connections:', err);
    }
  }

  /** Wrapper um execute_command, mit Logging des Befehls-Kontexts */
  async _exec(server_id, command, tag = 'rcon') {
    console.log(`[${tag}] ${command}`);
    return this.execute_command(server_id, command);
  }

  /**
   * Führt ein RCON‐Kommando aus, reconnectet bei Bedarf
   * Gibt bei Erfolg die Antwort-String zurück.
   * Wirft bei Fehlern einen Error.
   */
  async execute_command(server_id, command) {
    await this.readyPromise;
    const srv = this.servers[server_id];
    if (!srv) {
      throw new Error(`Unknown server_id: ${server_id}`);
    }
    let conn = this.rcons[server_id];

    // bei Verbindungsproblemen reconnecten
    if (!conn || !conn.isConnected() || !conn.isAuthenticated() || !conn.connection?.writable) {
      console.log(`[rcon] Connection issue, reconnecting ${server_id}`);
      await this.disconnect_rcon(server_id);
      await this.connect(server_id, srv);
      conn = this.rcons[server_id];
    }

    if (!conn || !conn.isConnected() || !conn.isAuthenticated() || !conn.connection?.writable) {
      throw new Error(`No valid connection after reconnect for server ${server_id}`);
    }

    // Timeout‐protect
    const resp = await Promise.race([
      conn.execute(command),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('RCON command timed out')), this.commandTimeoutMs)
      ),
    ]);

    if (resp && resp.error) {
      throw new Error(`RCON error: ${resp.error}`);
    }
    return resp ? resp.toString() : '';
  }

  /** Helper für Game‐Setup: lädt zuerst Map, dann CFG */
  async execCfg(server_id, cfgName) {
    const safe = String(cfgName);
    if (!/^[a-zA-Z0-9_.-]+$/.test(safe)) {
      throw new Error('Invalid cfg name');
    }
    await this._exec(server_id, 'exec ' + safe, 'setup-game');
  }

  /** Helper für Plugin‐Override: unload oder load via css_plugins */
  async execPluginCmd(server_id, action, pluginName) {
    const safeAction = ['load', 'unload', 'reload'].includes(action) ? action : null;
    if (!safeAction) throw new Error('Invalid plugin action');
    const safeName = String(pluginName).replace(/[";\\]/g, '');
    if (!safeName) throw new Error('Invalid plugin name');
    await this._exec(server_id, `css_plugins ${safeAction} "${safeName}"`, 'plugins');
  }

  /** sendet periodisch einen status‐Heartbeat */
  async send_heartbeat(server_id, server) {
    if (!this.rcons[server_id]?.connection?.writable) {
      console.log(`[heartbeat] Connection unwritable, reconnecting ${server_id}`);
      await this.disconnect_rcon(server_id);
      await this.connect(server_id, server);
    }
    const conn = this.rcons[server_id];
    if (!conn || !conn.connection?.writable) return;
    try {
      await Promise.race([
        conn.execute('status'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Heartbeat timed out')), 5000)),
      ]);
      console.log('HEARTBEAT SUCCESS', server_id);
    } catch (err) {
      console.warn(`[heartbeat] Error (${err}), reconnecting ${server_id}`);
      await this.disconnect_rcon(server_id);
      await this.connect(server_id, server);
    }
  }

  /** baut die RCON‐Verbindung auf */
  async connect(server_id, server) {
    if (!server) {
      console.error('[rcon] connect called without server object');
      return;
    }
    if (this.rcons[server_id]) {
      await this.disconnect_rcon(server_id);
    }
    let authCompleted = false;
    let conn;
    try {
      conn = new Rcon({
        host: server.serverIP,
        port: server.serverPort,
        timeout: 5000,
      });
      console.log('CONNECTING RCON', server_id, server.serverIP, server.serverPort);

      const authTimeout = setTimeout(() => {
        if (authCompleted) return;
        authCompleted = true;
        console.error('[rcon] Authentication timed out', server_id);
        try {
          if (conn && conn.connection) conn.connection.end();
        } catch {
          // ignore
        }
      }, 10000);

      try {
        const decryptedPassword = decryptRconSecret(server.rconPassword);
        await conn.authenticate(decryptedPassword);
        authCompleted = true;
        clearTimeout(authTimeout);
        console.log('RCON Authenticated', server_id);
      } catch (err) {
        authCompleted = true;
        clearTimeout(authTimeout);
        console.error('[rcon] Authentication failed', server_id, err.message);
        return;
      }

      this.rcons[server_id] = conn;
      this.details[server_id] = {
        host: server.serverIP,
        port: server.serverPort,
        connected: conn.isConnected(),
        authenticated: conn.isAuthenticated(),
      };

      if (conn.isConnected() && conn.isAuthenticated()) {
        this.details[server_id].heartbeat_interval = setInterval(
          () => this.send_heartbeat(server_id, server),
          5000
        );
      }
    } catch (err) {
      console.error('[rcon] connect error:', err);
    }
  }

  /** trennt die RCON‐Verbindung */
  async disconnect_rcon(server_id) {
    console.log('DISCONNECTING RCON', server_id);
    const conn = this.rcons[server_id];
    const isConnected =
      conn && (typeof conn.isConnected === 'function' ? conn.isConnected() : conn.connected);
    if (!conn || !isConnected) {
      delete this.rcons[server_id];
      delete this.details[server_id];
      return;
    }

    clearInterval(this.details[server_id]?.heartbeat_interval);
    delete this.details[server_id];

    if (
      !conn.connection ||
      typeof conn.connection.once !== 'function' ||
      typeof conn.connection.end !== 'function'
    ) {
      delete this.rcons[server_id];
      return;
    }

    return new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        delete this.rcons[server_id];
        resolve();
      };
      const timeout = setTimeout(done, 3000);
      conn.connection.once('close', () => {
        clearTimeout(timeout);
        done();
      });
      conn.connection.once('error', () => {
        clearTimeout(timeout);
        done();
      });
      conn.connection.end();
    });
  }
}

module.exports = new RconManager();
