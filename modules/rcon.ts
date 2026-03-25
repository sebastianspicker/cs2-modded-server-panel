// NOTE: rcon-srcds uses Math.random() for RCON packet IDs, which is not
// cryptographically secure. For production deployments with untrusted networks,
// consider forking the library to use crypto.randomInt() or replacing it with
// an alternative RCON client that uses a secure RNG.
import Rcon from 'rcon-srcds';
import { better_sqlite_client } from '../db';
import { decryptRconSecret } from '../utils/rconSecret';

const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 5000;
const RCON_SOCKET_TIMEOUT_MS = 5000;
const RCON_AUTH_TIMEOUT_MS = 10000;
const RCON_DISCONNECT_TIMEOUT_MS = 3000;

interface ServerRecord {
  id: number;
  serverIP: string;
  serverPort: number;
  rconPassword: string;
}

/** Cached server info without the password — passwords are fetched from DB on demand. */
interface ServerInfo {
  id: number;
  serverIP: string;
  serverPort: number;
}

const MAX_HEARTBEAT_INTERVAL_MS = 60000;

interface ServerDetails {
  host: string;
  port: number;
  connected: boolean;
  authenticated: boolean;
  heartbeatInterval?: ReturnType<typeof setInterval>;
  heartbeatFailures: number;
}

const fetchPasswordStmt = better_sqlite_client.prepare(
  `SELECT rconPassword FROM servers WHERE id = ?`
);

class RconManager {
  rcons: Record<string, Rcon>;
  details: Record<string, ServerDetails>;
  servers: Record<string, ServerInfo>;
  commandTimeoutMs: number;
  readyPromise: Promise<void>;
  // Prevents concurrent reconnection attempts for the same server
  private reconnecting = new Map<string, Promise<void>>();

  constructor() {
    this.rcons = {};
    this.details = {};
    this.servers = {};
    const raw = Number.parseInt(process.env.RCON_COMMAND_TIMEOUT_MS || '2000', 10);
    this.commandTimeoutMs = Number.isFinite(raw) && raw > 0 ? raw : 2000;
    this.readyPromise = this.init();
  }

  /** Fetch the encrypted password from the database (never from memory cache). */
  private fetchPasswordFromDb(serverId: number): string | null {
    const row = fetchPasswordStmt.get(serverId) as { rconPassword: string } | undefined;
    return row?.rconPassword ?? null;
  }

  // Serializes reconnection: if a reconnect is already in flight for this server,
  // await the existing promise instead of starting a duplicate attempt.
  private async reconnect(server_id: string, server: ServerInfo): Promise<void> {
    const existing = this.reconnecting.get(server_id);
    if (existing) return existing;
    const p = (async () => {
      await this.disconnectRcon(server_id);
      await this.connect(server_id, server);
    })().finally(() => this.reconnecting.delete(server_id));
    this.reconnecting.set(server_id, p);
    return p;
  }

  async init(): Promise<void> {
    try {
      const stmt = better_sqlite_client.prepare('SELECT id, serverIP, serverPort FROM servers');
      const servers = stmt.all() as ServerInfo[];
      console.log('[rcon] Initializing connections for', servers.length, 'server(s)');
      await Promise.allSettled(
        servers.map((server) => {
          const sid = server.id.toString();
          if (this.rcons[sid]) return Promise.resolve();
          this.servers[sid] = {
            id: server.id,
            serverIP: server.serverIP,
            serverPort: server.serverPort,
          };
          return this.connect(sid, server);
        })
      );
    } catch (err) {
      console.error('Error initializing RCON connections:', err);
    }
  }

  async connectServer(server: ServerRecord): Promise<void> {
    const sid = server.id.toString();
    // Cache only connection info, not the password.
    this.servers[sid] = { id: server.id, serverIP: server.serverIP, serverPort: server.serverPort };
    await this.connect(sid, {
      id: server.id,
      serverIP: server.serverIP,
      serverPort: server.serverPort,
    });
  }

  private async execTagged(server_id: string, command: string, tag = 'rcon'): Promise<string> {
    console.log(`[${tag}] ${command}`);
    return this.executeCommand(server_id, command);
  }

  async executeCommand(server_id: string, command: string): Promise<string> {
    await this.readyPromise;
    const srv = this.servers[server_id];
    if (!srv) {
      throw new Error(`Unknown server_id: ${server_id}`);
    }
    let conn = this.rcons[server_id];

    if (!conn || !conn.isConnected() || !conn.isAuthenticated() || !conn.connection?.writable) {
      console.log(`[rcon] Connection issue, reconnecting ${server_id}`);
      await this.reconnect(server_id, srv);
      conn = this.rcons[server_id];
    }

    if (!conn || !conn.isConnected() || !conn.isAuthenticated() || !conn.connection?.writable) {
      throw new Error(`No valid connection after reconnect for server ${server_id}`);
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const resp = await Promise.race([
        conn.execute(command),
        new Promise<never>((_, rej) => {
          timeoutHandle = setTimeout(() => {
            // On timeout, destroy the connection to prevent orphaned listeners,
            // but only if it hasn't been replaced by a heartbeat reconnect.
            try {
              if (this.rcons[server_id] === conn) {
                conn.connection?.removeAllListeners('data');
                conn.connection?.destroy();
                delete this.rcons[server_id];
              }
            } catch {
              // ignore cleanup errors
            }
            rej(new Error('RCON command timed out'));
          }, this.commandTimeoutMs);
        }),
      ]);
      return typeof resp === 'string' ? resp : '';
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  }

  async execPluginCmd(server_id: string, action: string, pluginName: string): Promise<void> {
    const safeAction = (['load', 'unload', 'reload'] as const).find((a) => a === action);
    if (!safeAction) throw new Error('Invalid plugin action');
    // Allowlist: only word chars, hyphens, dots, forward slashes (for "disabled/Name" paths).
    const safeName = String(pluginName);
    if (!/^[A-Za-z0-9_/.-]+$/.test(safeName)) throw new Error('Invalid plugin name');
    await this.execTagged(server_id, `css_plugins ${safeAction} "${safeName}"`, 'plugins');
  }

  // Heartbeat intervals could overlap if a heartbeat takes longer than the
  // interval period. The `reconnecting` Map in `reconnect()` serializes
  // concurrent reconnection attempts, preventing duplicate connections.
  async sendHeartbeat(server_id: string, server: ServerInfo): Promise<void> {
    if (!this.rcons[server_id]?.connection?.writable) {
      console.log(`[heartbeat] Connection unwritable, reconnecting ${server_id}`);
      await this.reconnect(server_id, server);
    }
    const conn = this.rcons[server_id];
    if (!conn || !conn.connection?.writable) return;
    try {
      await Promise.race([
        conn.execute('status'),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('Heartbeat timed out')), HEARTBEAT_TIMEOUT_MS)
        ),
      ]);
      // Heartbeat succeeded — update connected flag, reset failure count, restore normal interval
      const details = this.details[server_id];
      if (details) {
        details.connected = true;
        if (details.heartbeatFailures > 0) {
          details.heartbeatFailures = 0;
          this.restartHeartbeat(server_id, server, HEARTBEAT_INTERVAL_MS);
        }
      }
    } catch (err) {
      console.warn(`[heartbeat] Error (${err}), reconnecting ${server_id}`);
      if (this.details[server_id]) {
        this.details[server_id].connected = false;
      }
      await this.reconnect(server_id, server);
      // If the server was removed during reconnect, bail out
      if (!this.details[server_id]) return;
      // Exponential backoff: double interval on each consecutive failure (capped at 60s)
      const details = this.details[server_id];
      if (details) {
        details.heartbeatFailures++;
        const backoff = Math.min(
          HEARTBEAT_INTERVAL_MS * Math.pow(2, details.heartbeatFailures),
          MAX_HEARTBEAT_INTERVAL_MS
        );
        this.restartHeartbeat(server_id, server, backoff);
        console.log(`[heartbeat] Backoff for ${server_id}: next check in ${backoff}ms`);
      }
    }
  }

  private restartHeartbeat(server_id: string, server: ServerInfo, intervalMs: number): void {
    const details = this.details[server_id];
    if (!details) return;
    clearInterval(details.heartbeatInterval);
    details.heartbeatInterval = setInterval(
      () => this.sendHeartbeat(server_id, server),
      intervalMs
    );
  }

  async connect(server_id: string, server: ServerInfo): Promise<void> {
    if (!server) {
      console.error('[rcon] connect called without server object');
      return;
    }
    if (this.rcons[server_id]) {
      await this.disconnectRcon(server_id);
    }

    // Fetch the password from the database on every connect, never from cache.
    const encryptedPassword = this.fetchPasswordFromDb(server.id);
    if (!encryptedPassword) {
      console.error(`[rcon] No password found in DB for server_id=${server_id}`);
      return;
    }

    let authCompleted = false;
    let conn: Rcon | undefined;
    try {
      conn = new Rcon({
        host: server.serverIP,
        port: server.serverPort,
        timeout: RCON_SOCKET_TIMEOUT_MS,
      });
      console.log(
        `[rcon] connecting server_id=${server_id} host=${server.serverIP}:${server.serverPort}`
      );

      const authTimeout = setTimeout(() => {
        if (authCompleted) return;
        authCompleted = true;
        console.error('[rcon] Authentication timed out', server_id);
        try {
          if (conn && conn.connection) conn.connection.end();
        } catch {
          // ignore
        }
      }, RCON_AUTH_TIMEOUT_MS);

      try {
        const decryptedPassword = decryptRconSecret(encryptedPassword);
        await conn.authenticate(decryptedPassword);
        authCompleted = true;
        clearTimeout(authTimeout);
        console.log(`[rcon] authenticated server_id=${server_id}`);
      } catch (err: unknown) {
        authCompleted = true;
        clearTimeout(authTimeout);
        const message = err instanceof Error ? err.message : String(err);
        console.error('[rcon] Authentication failed', server_id, message);
        // Close the underlying socket to prevent a leak on auth failure
        conn.connection?.destroy();
        return;
      }

      this.rcons[server_id] = conn;
      this.details[server_id] = {
        host: server.serverIP,
        port: server.serverPort,
        connected: conn.isConnected(),
        authenticated: conn.isAuthenticated(),
        heartbeatFailures: 0,
      };

      if (conn.isConnected() && conn.isAuthenticated()) {
        this.details[server_id].heartbeatInterval = setInterval(
          () => this.sendHeartbeat(server_id, server),
          HEARTBEAT_INTERVAL_MS
        );
      }
    } catch (err) {
      console.error('[rcon] connect error:', err);
    }
  }

  async disconnectRcon(server_id: string): Promise<void> {
    console.log(`[rcon] disconnecting server_id=${server_id}`);
    // Always clear heartbeat interval first so stale setInterval closures
    // never reconnect to a server that has been deleted.
    clearInterval(this.details[server_id]?.heartbeatInterval);

    const conn = this.rcons[server_id];
    const isConnected = conn && (typeof conn.isConnected === 'function' ? conn.isConnected() : conn.connected);
    if (!conn || !isConnected) {
      delete this.rcons[server_id];
      delete this.details[server_id];
      return;
    }

    delete this.details[server_id];

    if (
      !conn.connection ||
      typeof conn.connection.once !== 'function' ||
      typeof conn.connection.end !== 'function'
    ) {
      delete this.rcons[server_id];
      return;
    }

    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        delete this.rcons[server_id];
        resolve();
      };
      const timeout = setTimeout(done, RCON_DISCONNECT_TIMEOUT_MS);
      conn.connection!.once('close', () => {
        clearTimeout(timeout);
        done();
      });
      conn.connection!.once('error', () => {
        clearTimeout(timeout);
        done();
      });
      conn.connection!.end();
    });
  }
  async shutdownAll(): Promise<void> {
    console.log('[rcon] Shutting down all connections...');
    for (const sid of Object.keys(this.details)) {
      clearInterval(this.details[sid]?.heartbeatInterval);
    }
    await Promise.allSettled(Object.keys(this.rcons).map((sid) => this.disconnectRcon(sid)));
    console.log('[rcon] All connections closed.');
  }
}

export default new RconManager();
