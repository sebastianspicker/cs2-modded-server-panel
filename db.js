// db.js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const {
  encryptRconSecret,
  hasRconSecretKey,
  isEncryptedRconSecret,
} = require('./utils/rconSecret');

const nodeEnv = process.env.NODE_ENV || 'development';
const defaultDbPath = path.resolve('/home/container/data/cspanel.db');
const fallbackDbPath = path.resolve(process.cwd(), 'data', 'cspanel.db');
const dbPathEnv = process.env.DB_PATH?.trim();
const preferredDbPath = dbPathEnv ? path.resolve(dbPathEnv) : defaultDbPath;

function openDb(dbFilePath) {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  return new Database(dbFilePath);
}

let better_sqlite_client;
try {
  better_sqlite_client = openDb(preferredDbPath);
} catch (err) {
  const allowFallback = !dbPathEnv && nodeEnv !== 'production';
  if (!allowFallback) {
    console.error(`[db] Failed to open DB at ${preferredDbPath}: ${err.message}`);
    process.exit(1);
  }
  console.warn(
    `[db] Failed to open DB at ${preferredDbPath} (${err.message}). Falling back to ${fallbackDbPath}.`
  );
  try {
    better_sqlite_client = openDb(fallbackDbPath);
  } catch (fallbackErr) {
    console.error(`[db] Fallback DB also failed: ${fallbackErr.message}`);
    process.exit(1);
  }
}

if (nodeEnv === 'production' && !hasRconSecretKey()) {
  throw new Error('RCON_SECRET_KEY must be set in production to protect stored RCON credentials');
}

// === 1) Tabellen erstellen, falls sie noch nicht existieren ===
better_sqlite_client.exec(`
  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY,
    serverIP TEXT NOT NULL,
    serverPort INTEGER NOT NULL,
    rconPassword TEXT NOT NULL
  )
`);

better_sqlite_client.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  )
`);

// === 2) Migration: neue Spalten in 'servers' hinzufügen, falls noch nicht vorhanden ===
{
  // PRAGMA table_info liefert alle Spalten der Tabelle
  const cols = better_sqlite_client
    .prepare(`PRAGMA table_info(servers)`)
    .all()
    .map((row) => row.name);

  if (!cols.includes('last_map')) {
    better_sqlite_client.exec(`ALTER TABLE servers ADD COLUMN last_map TEXT;`);
  }
  if (!cols.includes('last_game_type')) {
    better_sqlite_client.exec(`ALTER TABLE servers ADD COLUMN last_game_type TEXT;`);
  }
  if (!cols.includes('last_game_mode')) {
    better_sqlite_client.exec(`ALTER TABLE servers ADD COLUMN last_game_mode TEXT;`);
  }
}

// Encrypt any existing plaintext RCON passwords when a key is configured.
if (hasRconSecretKey()) {
  const rows = better_sqlite_client.prepare(`SELECT id, rconPassword FROM servers`).all();
  const update = better_sqlite_client.prepare(`UPDATE servers SET rconPassword = ? WHERE id = ?`);
  for (const row of rows) {
    if (typeof row.rconPassword !== 'string' || isEncryptedRconSecret(row.rconPassword)) continue;
    const encrypted = encryptRconSecret(row.rconPassword);
    update.run(encrypted, row.id);
  }
}

// === 3) Default-User anlegen, falls noch nicht vorhanden ===
const env_username = process.env.DEFAULT_USERNAME;
const env_password = process.env.DEFAULT_PASSWORD;
const has_env_credentials = Boolean(env_username && env_password);
const isWeakDefaultPassword = ['change-me', 'changeme', 'password', 'admin', 'default'].includes(
  String(env_password || '').toLowerCase()
);

const user_count = better_sqlite_client.prepare(`SELECT COUNT(1) AS count FROM users`).get().count;
const allowDefaultCredentials = process.env.ALLOW_DEFAULT_CREDENTIALS === 'true';

if (user_count > 0) {
  console.log('Users already exist; skipping default user creation.');
} else if (!allowDefaultCredentials) {
  console.warn(
    '[db] No users in DB and ALLOW_DEFAULT_CREDENTIALS is not "true". Set ALLOW_DEFAULT_CREDENTIALS=true and DEFAULT_USERNAME/DEFAULT_PASSWORD to create the first admin, or add a user by other means.'
  );
} else {
  if (!has_env_credentials) {
    console.error(
      '[db] ALLOW_DEFAULT_CREDENTIALS=true requires DEFAULT_USERNAME and DEFAULT_PASSWORD. Refusing to create unknown/random credentials.'
    );
    process.exit(1);
  }
  if (nodeEnv === 'production' && isWeakDefaultPassword) {
    console.error('[db] DEFAULT_PASSWORD uses a weak placeholder value in production.');
    process.exit(1);
  }

  const safeUsername = String(env_username).slice(0, 255);
  const hashed_password = bcrypt.hashSync(env_password, 10);
  better_sqlite_client
    .prepare(
      `
      INSERT INTO users (username, password)
      VALUES (?, ?)
    `
    )
    .run(safeUsername, hashed_password);
  console.log('Default user created successfully.');
}


module.exports = {
  better_sqlite_client,
};
