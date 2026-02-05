// /modules/rcon.js
const Rcon = require('rcon-srcds').default;
const { better_sqlite_client } = require('../db');

class RconManager {
  constructor() {
    this.rcons = {};
    this.details = {};
    this.servers = {};
    this.commandTimeoutMs = Number.parseInt(process.env.RCON_COMMAND_TIMEOUT_MS || '2000', 10);
    this.init();
  }

  /** Initialisiert Verbindungen zu allen in der DB stehenden Servern */
  async init() {
    try {
      const stmt = better_sqlite_client.prepare('SELECT * FROM servers');
      const servers = stmt.all();
      console.log('All servers in DB:', servers);
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
   * Gibt bei Erfolg die Antwort-String zurück, sonst HTTP‐style Code (200/400)
   */
  async execute_command(server_id, command) {
    try {
      let conn = this.rcons[server_id];
      const srv = this.servers[server_id];

      // bei Verbindungsproblemen reconnecten
      if (!conn || !conn.isConnected() || !conn.isAuthenticated() || !conn.connection.writable) {
        console.log(`[rcon] Connection issue, reconnecting ${server_id}`);
        await this.disconnect_rcon(server_id);
        await this.connect(server_id, srv);
        conn = this.rcons[server_id];
      }

      if (conn.isConnected() && conn.isAuthenticated() && conn.connection.writable) {
        // Timeout‐protect
        const resp = await Promise.race([
          conn.execute(command),
          new Promise((res) => setTimeout(() => res({ error: 'timeout' }), this.commandTimeoutMs)),
        ]);

        if (resp && resp.error) {
          console.warn(`[rcon] Command timed out: ${command}`);
          return 200;
        }
        return resp.toString();
      } else {
        console.error(`[rcon] Cannot execute, no valid connection: ${command}`);
        return 400;
      }
    } catch (err) {
      console.error('[rcon] execute_command error:', err);
      return 400;
    }
  }

  /** Helper für Game‐Setup: lädt zuerst Map, dann CFG */
  async execCfg(server_id, cfgName) {
    await this._exec(server_id, `exec ${cfgName}`, 'setup-game');
  }

  /** Helper für Plugin‐Override: unload oder load via css_plugins */
  async execPluginCmd(server_id, action, pluginName) {
    // pluginName schon inklusive möglichen Pfad oder Anführungszeichen
    await this._exec(server_id, `css_plugins ${action} "${pluginName}"`, 'plugins');
  }

  /** sendet periodisch einen status‐Heartbeat */
  async send_heartbeat(server_id, server) {
    if (!this.rcons[server_id]?.connection.writable) {
      console.log(`[heartbeat] Connection unwritable, reconnecting ${server_id}`);
      await this.disconnect_rcon(server_id);
      await this.connect(server_id, server);
    }
    try {
      await Promise.race([
        this.rcons[server_id].execute('status'),
        new Promise((_, rej) => setTimeout(() => rej('timeout'), 5000)),
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
    try {
      const conn = new Rcon({
        host: server.serverIP,
        port: server.serverPort,
        timeout: 5000,
      });
      console.log('CONNECTING RCON', server_id, server.serverIP, server.serverPort);

      // Auth‐Timeout
      const authTimeout = setTimeout(async () => {
        console.error('[rcon] Authentication timed out', server_id);
        await this.disconnect_rcon(server_id);
      }, 10000);

      try {
        await conn.authenticate(server.rconPassword);
        clearTimeout(authTimeout);
        console.log('RCON Authenticated', server_id);
      } catch (err) {
        clearTimeout(authTimeout);
        console.error('[rcon] Authentication failed', server_id, err);
      }

      this.rcons[server_id] = conn;
      this.details[server_id] = {
        host: server.serverIP,
        port: server.serverPort,
        rcon_password: server.rconPassword,
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
    if (!conn || !conn.connected) return;

    clearInterval(this.details[server_id]?.heartbeat_interval);
    conn.authenticated = false;
    conn.connected = false;

    return new Promise((resolve) => {
      conn.connection.once('close', () => resolve());
      conn.connection.once('error', () => resolve());
      conn.connection.end();
    });
  }
}

module.exports = new RconManager();
